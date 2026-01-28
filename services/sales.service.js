import { ObjectId } from 'mongodb'
import { db } from './../db/mongoClient.js'
import Boom from '@hapi/boom'

class SaleService{
  constructor(){
    this.collection = 'sales'
    this.customerCollection='customers'
  }

  getCollection(){

    return db.collection(this.collection)
  }

  getCustomersCollection(){
    return db.collection(this.customerCollection)
  }

  async createIndexes() {
    const collection = this.getCollection()

    await collection.createIndex({ folio: 1 }, { unique: true })
    await collection.createIndex({ customerId: 1 })
    await collection.createIndex({ date: -1 })
    await collection.createIndex({ status: 1 })
    await collection.createIndex({ customerId: 1, date: -1 })

  }

  // ============================================
  // MÉTODOS PÚBLICOS
  // ============================================

  // Obtener todas las ventas con filtros
  async findAll(filters = {}) {
    try {
      const collection = this.getCollection()
      const query = {}

      // Filtro por cliente
      if (filters.customerId && ObjectId.isValid(filters.customerId)) {
        query.customerId = new ObjectId(filters.customerId)
      }

      // Filtro por estado
      if (filters.status) {
        query.status = filters.status
      }

      // Filtro por tipo de pago
      if (filters.paymentType) {
        query.paymentType = filters.paymentType
      }

      // Filtro por rango de fechas
      if (filters.startDate || filters.endDate) {
        query.date = {}
        if (filters.startDate) {
          query.date.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          query.date.$lte = new Date(filters.endDate)
        }
      }

      // Filtro por saldo pendiente
      if (filters.withBalance === 'true') {
        query.balance = { $gt: 0 }
      }

      const sales = await collection
        .find(query)
        .sort({ date: -1 })
        .toArray()

      return sales
    } catch (error) {
      throw Boom.internal('Error al obtener ventas: ' + error.message)
    }
  }

  // Obtener venta por ID
  async findById(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de venta inválido')
      }

      const collection = this.getCollection()
      const sale = await collection.findOne({ _id: new ObjectId(id) })

      if (!sale) {
        throw Boom.notFound('Venta no encontrada')
      }

      return sale
    } catch (error) {
      if (error.isBoom) throw error
      throw Boom.internal('Error al obtener venta: ' + error.message)
    }
  }

  // Obtener ventas por cliente
  async findByCustomerId(customerId) {
    try {
      if (!ObjectId.isValid(customerId)) {
        throw Boom.badRequest('ID de cliente inválido')
      }

      const collection = this.getCollection()
      const sales = await collection
        .find({ customerId: new ObjectId(customerId) })
        .sort({ date: -1 })
        .toArray()

      return sales
    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }
      throw Boom.internal('Error al obtener ventas del cliente: ' + error.message)
    }
  }

  // Crear venta con transacción
  async create(saleData, userId) {

    const session = db.client.startSession()

    try {
      await session.startTransaction()

      // Validar datos
      this.validateSaleData(saleData)

      // Verificar que el cliente existe
      const customersCollection = this.getCustomersCollection()
      const customer = await customersCollection.findOne(
        { _id: new ObjectId(saleData.customerId) },
        { session }
      )

      if (!customer) {
        throw Boom.notFound('Cliente no encontrado')
      }

      if (!customer.active) {
        throw Boom.badRequest('El cliente está inactivo')
      }

      // Calcular totales
      const subtotal = saleData.items.reduce((sum, item) =>
        sum + (parseFloat(item.quantity) * parseFloat(item.unitPrice)), 0
      )
      const tax = subtotal * 0.16  // IVA 16%
      const total = subtotal + tax

      // Si es a crédito, verificar límite
      if (saleData.paymentType === 'credit') {
        const newBalance = customer.currentBalance + total
        if (newBalance > customer.creditLimit) {
          throw Boom.badRequest(
            `La venta excede el límite de crédito. Disponible: $${(customer.creditLimit - customer.currentBalance).toFixed(2)}`
          )
        }
      }

      // Generar folio
      const folio = await this.generateFolio(session)

      // Calcular fecha de vencimiento
      const date = new Date(saleData.date)
      const dueDate = new Date(date)
      dueDate.setDate(dueDate.getDate() + customer.creditDays)

      // Crear venta
      const collection = this.getCollection()
      const newSale = {
        folio,
        customerId: new ObjectId(saleData.customerId),
        customerName: customer.name,
        date: new Date(saleData.date),
        dueDate,
        items: saleData.items.map(item => ({
          description: item.description,
          quantity: parseFloat(item.quantity),
          unitPrice: parseFloat(item.unitPrice),
          total: parseFloat(item.quantity) * parseFloat(item.unitPrice)
        })),
        subtotal,
        tax,
        total,
        amountPaid: saleData.paymentType === 'cash' ? total : 0,
        balance: saleData.paymentType === 'cash' ? 0 : total,
        status: saleData.paymentType === 'cash' ? 'paid' : 'pending',
        paymentType: saleData.paymentType,
        notes: saleData.notes || '',
        createdBy: new ObjectId(userId)

      }

      const result = await collection.insertOne(newSale, { session })

      // Si es a crédito, actualizar saldo del cliente
      if (saleData.paymentType === 'credit') {
        await customersCollection.findOneAndUpdate(
          { _id: new ObjectId(saleData.customerId) },
          {
            $inc: { currentBalance: total },
            $set: { updatedAt: new Date() }
          },
          { session }
        )
      }

      await session.commitTransaction()

      // Retornar la venta creada
      const createdSale = await collection.findOne({ _id: result.insertedId })
      return createdSale

    } catch (error) {
      await session.abortTransaction()
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al crear venta: ' + error.message)
    } finally {
      await session.endSession()
    }
  }

  // Actualizar venta
  async update(id, saleData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de venta inválido')
      }

      const collection = this.getCollection()

      // Verificar que existe
      const existingSale = await collection.findOne({ _id: new ObjectId(id) })
      if (!existingSale) {
        throw Boom.notFound('Venta no encontrada')
      }

      // No permitir actualizar si ya tiene pagos
      if (existingSale.amountPaid > 0) {
        throw Boom.badRequest('No se puede actualizar una venta que ya tiene pagos registrados')
      }

      const updateData = {
        ...saleData,
        updatedAt: new Date()
      }

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al actualizar venta: ' + error.message)
    }
  }

  // Eliminar venta con transacción
  async delete(id) {
    const db = getDB()
    const session = db.client.startSession()

    try {
      await session.startTransaction()

      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de venta inválido')
      }

      const collection = this.getCollection()
      const sale = await collection.findOne(
        { _id: new ObjectId(id) },
        { session }
      )

      if (!sale) {
        throw Boom.notFound('Venta no encontrada')
      }

      // No permitir eliminar si ya tiene pagos
      if (sale.amountPaid > 0) {
        throw Boom.badRequest('No se puede eliminar una venta que ya tiene pagos registrados')
      }

      // Si es a crédito y tiene saldo, restar del cliente
      if (sale.paymentType === 'credit' && sale.balance > 0) {
        const customersCollection = this.getCustomersCollection()
        await customersCollection.findOneAndUpdate(
          { _id: sale.customerId },
          {
            $inc: { currentBalance: -sale.balance },
            $set: { updatedAt: new Date() }
          },
          { session }
        )
      }

      await collection.deleteOne({ _id: new ObjectId(id) }, { session })

      await session.commitTransaction()
      return { message: 'Venta eliminada correctamente' }
    } catch (error) {
      await session.abortTransaction()
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al eliminar venta: ' + error.message)
    } finally {
      await session.endSession()
    }
  }

  // Actualizar estado y saldo de la venta (usado por pagos)
  async updatePaymentStatus(id, amountPaid) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de venta inválido')
      }

      const collection = this.getCollection()
      const sale = await collection.findOne({ _id: new ObjectId(id) })

      if (!sale) {
        throw Boom.notFound('Venta no encontrada')
      }

      const newAmountPaid = sale.amountPaid + amountPaid
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

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            amountPaid: newAmountPaid,
            balance: Math.max(newBalance, 0),
            status: newStatus,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al actualizar estado de pago: ' + error.message)
    }
  }

  // Obtener estadísticas de ventas
  async getStats(filters = {}) {
    try {
      const collection = this.getCollection()
      const matchStage = {}

      if (filters.customerId && ObjectId.isValid(filters.customerId)) {
        matchStage.customerId = new ObjectId(filters.customerId)
      }

      if (filters.startDate || filters.endDate) {
        matchStage.date = {}
        if (filters.startDate) {
          matchStage.date.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          matchStage.date.$lte = new Date(filters.endDate)
        }
      }

      const stats = await collection.aggregate([
        { $match: matchStage },
        {
          $facet: {
            total: [{ $count: 'count' }],
            totalAmount: [
              { $group: { _id: null, total: { $sum: '$total' } } }
            ],
            totalPaid: [
              { $group: { _id: null, total: { $sum: '$amountPaid' } } }
            ],
            totalBalance: [
              { $group: { _id: null, total: { $sum: '$balance' } } }
            ],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$total' } } }
            ],
            overdue: [
              {
                $match: {
                  balance: { $gt: 0 },
                  dueDate: { $lt: new Date() }
                }
              },
              { $count: 'count' }
            ]
          }
        }
      ]).toArray()

      const result = stats[0]

      return {
        total: result.total[0]?.count || 0,
        totalAmount: result.totalAmount[0]?.total || 0,
        totalPaid: result.totalPaid[0]?.total || 0,
        totalBalance: result.totalBalance[0]?.total || 0,
        byStatus: result.byStatus || [],
        overdue: result.overdue[0]?.count || 0
      }
    } catch (error) {

      throw Boom.internal('Error al obtener estadísticas: ' + error.message)
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

      const lastSale = await collection
        .find({ folio: { $regex: `^NV-${year}-` } }, options)
        .sort({ folio: -1 })
        .limit(1)
        .toArray()

      let nextNumber = 1

      if (lastSale.length > 0) {
        const lastFolio = lastSale[0].folio
        const lastNumber = parseInt(lastFolio.split('-')[2])
        nextNumber = lastNumber + 1
      }

      return `NV-${year}-${String(nextNumber).padStart(4, '0')}`
    } catch (error) {
      throw new Error('Error al generar folio: ' + error.message)
    }
  }

  // Validar datos de venta
  validateSaleData(saleData) {
    if (!saleData.customerId) {
      throw Boom.badRequest('El cliente es requerido')
    }

    if (!ObjectId.isValid(saleData.customerId)) {
      throw Boom.badRequest('ID de cliente inválido')
    }

    if (!saleData.date) {
      throw Boom.badRequest('La fecha es requerida')
    }

    if (!saleData.paymentType || !['cash', 'credit'].includes(saleData.paymentType)) {
      throw Boom.badRequest('Tipo de pago inválido')
    }

    if (!saleData.items || !Array.isArray(saleData.items) || saleData.items.length === 0) {
      throw Boom.badRequest('Debe incluir al menos un artículo')
    }

    // Validar cada artículo
    saleData.items.forEach((item, index) => {
      if (!item.description || !item.description.trim()) {
        throw Boom.badRequest(`El artículo ${index + 1} debe tener descripción`)
      }
      if (!item.quantity || parseFloat(item.quantity) <= 0) {
        throw Boom.badRequest(`El artículo ${index + 1} debe tener cantidad mayor a 0`)
      }
      if (!item.unitPrice || parseFloat(item.unitPrice) <= 0) {
        throw Boom.badRequest(`El artículo ${index + 1} debe tener precio mayor a 0`)
      }
    })
  }

}

export default SaleService
