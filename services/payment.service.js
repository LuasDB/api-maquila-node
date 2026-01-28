import { ObjectId } from 'mongodb'
import { db } from './../db/mongoClient.js'
import Boom from '@hapi/boom'

class PaymentService{
  constructor() {
    this.collectionName = 'payments'
    this.salesCollection = 'sales'
    this.customersCollection = 'customers'
  }

   getCollection() {

    return db.collection(this.collectionName)
  }

  getSalesCollection() {

    return db.collection(this.salesCollection)
  }

  getCustomersCollection() {

    return db.collection(this.customersCollection)
  }

  // Crear índices
  async createIndexes() {
    const collection = this.getCollection()

    await collection.createIndex({ folio: 1 }, { unique: true })
    await collection.createIndex({ saleId: 1 })
    await collection.createIndex({ customerId: 1 })
    await collection.createIndex({ paymentDate: -1 })
    await collection.createIndex({ customerId: 1, paymentDate: -1 })

  }

  // ============================================
  // MÉTODOS PÚBLICOS
  // ============================================

  // Obtener todos los pagos con filtros
  async findAll(filters = {}) {
    try {
      const collection = this.getCollection()
      const query = {}

      // Filtro por venta
      if (filters.saleId && ObjectId.isValid(filters.saleId)) {
        query.saleId = new ObjectId(filters.saleId)
      }

      // Filtro por cliente
      if (filters.customerId && ObjectId.isValid(filters.customerId)) {
        query.customerId = new ObjectId(filters.customerId)
      }

      // Filtro por método de pago
      if (filters.paymentMethod) {
        query.paymentMethod = filters.paymentMethod
      }

      // Filtro por rango de fechas
      if (filters.startDate || filters.endDate) {
        query.paymentDate = {}
        if (filters.startDate) {
          query.paymentDate.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          query.paymentDate.$lte = new Date(filters.endDate)
        }
      }

      const payments = await collection
        .find(query)
        .sort({ paymentDate: -1 })
        .toArray()

      return payments
    } catch (error) {
      throw  Boom.internal('Error al obtener pagos: ' + error.message)
    }
  }

  // Obtener pago por ID
  async findById(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw  Boom.badRequest('ID de pago inválido')
      }

      const collection = this.getCollection()
      const payment = await collection.findOne({ _id: new ObjectId(id) })

      if (!payment) {
        throw  Boom.notFound('Pago no encontrado')
      }

      return payment
    } catch (error) {
      if(Boom.isBoom(error)) throw error
      throw  Boom.internal('Error al obtener pago: ' + error.message)
    }
  }

  // Obtener pagos por venta
  async findBySaleId(saleId) {
    try {
      if (!ObjectId.isValid(saleId)) {
        throw  Boom.badRequest('ID de venta inválido')
      }

      const collection = this.getCollection()
      const payments = await collection
        .find({ saleId: new ObjectId(saleId) })
        .sort({ paymentDate: -1 })
        .toArray()

      return payments
    } catch (error) {
      throw  Boom.internal('Error al obtener pagos de la venta: ' + error.message)
    }
  }

  // Obtener pagos por cliente
  async findByCustomerId(customerId) {
    try {
      if (!ObjectId.isValid(customerId)) {
        throw  Boom.badRequest('ID de cliente inválido')
      }

      const collection = this.getCollection()
      const payments = await collection
        .find({ customerId: new ObjectId(customerId) })
        .sort({ paymentDate: -1 })
        .toArray()

      return payments
    } catch (error) {
      throw  Boom.internal('Error al obtener pagos del cliente: ' + error.message)
    }
  }

  // Crear pago con transacción
  async create(paymentData, userId) {

    const session = db.client.startSession()

    try {
      await session.startTransaction()

      // Validar datos
      this.validatePaymentData(paymentData)

      // Verificar que la venta existe
      const salesCollection = this.getSalesCollection()
      const sale = await salesCollection.findOne(
        { _id: new ObjectId(paymentData.saleId) },
        { session }
      )

      if (!sale) {
        throw  Boom.notFound('Venta no encontrada')
      }

      // Verificar que tiene saldo pendiente
      if (sale.balance <= 0) {
        throw  Boom.badRequest('La venta ya está completamente pagada')
      }

      const amount = parseFloat(paymentData.amount)

      // Verificar que el monto no exceda el saldo
      if (amount > sale.balance) {
        throw  Boom.badRequest(
          `El monto no puede ser mayor al saldo pendiente: $${sale.balance.toFixed(2)}`
        )
      }

      // Generar folio
      const folio = await this.generateFolio(session)

      // Crear pago
      const collection = this.getCollection()
      const newPayment = {
        folio,
        saleId: new ObjectId(paymentData.saleId),
        saleFolio: sale.folio,
        customerId: sale.customerId,
        customerName: sale.customerName,
        amount,
        paymentMethod: paymentData.paymentMethod,
        reference: paymentData.reference || '',
        paymentDate: new Date(paymentData.paymentDate),
        notes: paymentData.notes || '',
        receivedBy: new ObjectId(userId)

      }

      const result = await collection.insertOne(newPayment, { session })

      // Actualizar venta (amountPaid, balance, status)
      const newAmountPaid = sale.amountPaid + amount
      const newBalance = sale.total - newAmountPaid

      let newStatus = 'pending'
      if (newBalance <= 0) {
        newStatus = 'paid'
      } else if (newAmountPaid > 0) {
        newStatus = 'partial'
      }

      // Verificar si está vencida
      const today = new Date()
      const dueDate = new Date(sale.dueDate)
      if (newBalance > 0 && today > dueDate) {
        newStatus = 'overdue'
      }

      await salesCollection.findOneAndUpdate(
        { _id: new ObjectId(paymentData.saleId) },
        {
          $set: {
            amountPaid: newAmountPaid,
            balance: Math.max(newBalance, 0),
            status: newStatus,
            updatedAt: new Date()
          }
        },
        { session }
      )

      // Actualizar saldo del cliente (restar el pago)
      const customersCollection = this.getCustomersCollection()
      await customersCollection.findOneAndUpdate(
        { _id: sale.customerId },
        {
          $inc: { currentBalance: -amount },
          $set: { updatedAt: new Date() }
        },
        { session }
      )

      await session.commitTransaction()

      // Retornar el pago creado
      const createdPayment = await collection.findOne({ _id: result.insertedId })
      return createdPayment

    } catch (error) {
      await session.abortTransaction()
      if(Boom.isBoom(error)) throw error
      throw  Boom.internal('Error al registrar pago: ' + error.message)
    } finally {
      await session.endSession()
    }
  }

  // Eliminar pago con transacción (revertir)
  async delete(id) {
    const db = getDB()
    const session = db.client.startSession()

    try {
      await session.startTransaction()

      if (!ObjectId.isValid(id)) {
        throw  Boom.badRequest('ID de pago inválido')
      }

      const collection = this.getCollection()
      const payment = await collection.findOne(
        { _id: new ObjectId(id) },
        { session }
      )

      if (!payment) {
        throw  Boom.notFound('Pago no encontrado')
      }

      // Revertir en la venta
      const salesCollection = this.getSalesCollection()
      const sale = await salesCollection.findOne(
        { _id: payment.saleId },
        { session }
      )

      if (sale) {
        const newAmountPaid = Math.max(sale.amountPaid - payment.amount, 0)
        const newBalance = sale.total - newAmountPaid

        let newStatus = 'pending'
        if (newAmountPaid === 0) {
          newStatus = 'pending'
        } else if (newBalance > 0) {
          newStatus = 'partial'
        }

        // Verificar si está vencida
        const today = new Date()
        const dueDate = new Date(sale.dueDate)
        if (newBalance > 0 && today > dueDate) {
          newStatus = 'overdue'
        }

        await salesCollection.findOneAndUpdate(
          { _id: payment.saleId },
          {
            $set: {
              amountPaid: newAmountPaid,
              balance: newBalance,
              status: newStatus,
              updatedAt: new Date()
            }
          },
          { session }
        )
      }

      // Revertir en el cliente (sumar el saldo de nuevo)
      const customersCollection = this.getCustomersCollection()
      await customersCollection.findOneAndUpdate(
        { _id: payment.customerId },
        {
          $inc: { currentBalance: payment.amount },
          $set: { updatedAt: new Date() }
        },
        { session }
      )

      // Eliminar pago
      await collection.deleteOne({ _id: new ObjectId(id) }, { session })

      await session.commitTransaction()
      return { message: 'Pago eliminado correctamente' }
    } catch (error) {
      await session.abortTransaction()
      if(Boom.isBoom(error)) throw error
      throw  Boom.internal('Error al eliminar pago: ' + error.message)
    } finally {
      await session.endSession()
    }
  }

  // Obtener estadísticas de pagos
  async getStats(filters = {}) {
    try {
      const collection = this.getCollection()
      const matchStage = {}

      if (filters.customerId && ObjectId.isValid(filters.customerId)) {
        matchStage.customerId = new ObjectId(filters.customerId)
      }

      if (filters.startDate || filters.endDate) {
        matchStage.paymentDate = {}
        if (filters.startDate) {
          matchStage.paymentDate.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          matchStage.paymentDate.$lte = new Date(filters.endDate)
        }
      }

      const stats = await collection.aggregate([
        { $match: matchStage },
        {
          $facet: {
            total: [{ $count: 'count' }],
            totalAmount: [
              { $group: { _id: null, total: { $sum: '$amount' } } }
            ],
            byMethod: [
              {
                $group: {
                  _id: '$paymentMethod',
                  count: { $sum: 1 },
                  total: { $sum: '$amount' }
                }
              }
            ],
            byDate: [
              {
                $group: {
                  _id: {
                    year: { $year: '$paymentDate' },
                    month: { $month: '$paymentDate' }
                  },
                  count: { $sum: 1 },
                  total: { $sum: '$amount' }
                }
              },
              { $sort: { '_id.year': -1, '_id.month': -1 } },
              { $limit: 12 }
            ]
          }
        }
      ]).toArray()

      const result = stats[0]

      return {
        total: result.total[0]?.count || 0,
        totalAmount: result.totalAmount[0]?.total || 0,
        byMethod: result.byMethod || [],
        byDate: result.byDate || []
      }
    } catch (error) {
      throw  Boom.internal('Error al obtener estadísticas: ' + error.message)
    }
  }

  // ============================================
  // MÉTODOS PRIVADOS
  // ============================================

  // Generar siguiente folio
  async generateFolio(session = null) {
    try {
      const collection = this.getCollection()
      const year = new Date().getFullYear()

      const options = session ? { session } : {}

      const lastPayment = await collection
        .find({ folio: { $regex: `^PAG-${year}-` } }, options)
        .sort({ folio: -1 })
        .limit(1)
        .toArray()

      let nextNumber = 1

      if (lastPayment.length > 0) {
        const lastFolio = lastPayment[0].folio
        const lastNumber = parseInt(lastFolio.split('-')[2])
        nextNumber = lastNumber + 1
      }

      return `PAG-${year}-${String(nextNumber).padStart(4, '0')}`
    } catch (error) {
      throw new Error('Error al generar folio: ' + error.message)
    }
  }

  // Validar datos de pago
  validatePaymentData(paymentData) {
    if (!paymentData.saleId) {
      throw  Boom.badRequest('La venta es requerida')
    }

    if (!ObjectId.isValid(paymentData.saleId)) {
      throw  Boom.badRequest('ID de venta inválido')
    }

    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) {
      throw  Boom.badRequest('El monto debe ser mayor a 0')
    }

    const validMethods = ['cash', 'transfer', 'check', 'card']
    if (!paymentData.paymentMethod || !validMethods.includes(paymentData.paymentMethod)) {
      throw  Boom.badRequest('Método de pago inválido. Valores permitidos: cash, transfer, check, card')
    }

    if (!paymentData.paymentDate) {
      throw  Boom.badRequest('La fecha de pago es requerida')
    }

    // Validar que la fecha no sea futura
    const paymentDate = new Date(paymentData.paymentDate)
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    if (paymentDate > today) {
      throw  Boom.badRequest('La fecha de pago no puede ser futura')
    }

    // Validar referencia para ciertos métodos
    if ((paymentData.paymentMethod === 'transfer' || paymentData.paymentMethod === 'check')
        && paymentData.reference && paymentData.reference.length > 100) {
      throw  Boom.badRequest('La referencia es demasiado larga (máximo 100 caracteres)')
    }
  }


}

export default PaymentService
