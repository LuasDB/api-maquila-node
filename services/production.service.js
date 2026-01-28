import { ObjectId } from 'mongodb'
import { db } from './../db/mongoClient.js'
import Boom from '@hapi/boom'

class ProductionService {
  constructor() {
    this.collectionName = 'production_rolls'
  }

  getCollection() {
    return db.collection(this.collectionName)
  }

  // Crear índices
  async createIndexes() {
    const collection = this.getCollection()

    await collection.createIndex({ folio: 1 }, { unique: true })
    await collection.createIndex({ 'fabric.purchaseDate': -1 })
    await collection.createIndex({ 'cutting.productType': 1 })
    await collection.createIndex({ 'summary.currentStatus': 1 })
    await collection.createIndex({ createdAt: -1 })

    console.log('✅ Índices de producción creados')
  }

  // ============================================
  // MÉTODOS PÚBLICOS
  // ============================================

  // Obtener todos los rollos con filtros
  async findAll(filters = {}) {
    try {
      const collection = this.getCollection()
      const query = {}

      // Filtro por tipo de producto
      if (filters.productType) {
        query['cutting.productType'] = filters.productType
      }

      // Filtro por estado actual
      if (filters.status) {
        query['summary.currentStatus'] = filters.status
      }

      // Filtro por rango de fechas
      if (filters.startDate || filters.endDate) {
        query['fabric.purchaseDate'] = {}
        if (filters.startDate) {
          query['fabric.purchaseDate'].$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          query['fabric.purchaseDate'].$lte = new Date(filters.endDate)
        }
      }

      // Búsqueda por folio
      if (filters.search) {
        query.folio = { $regex: filters.search, $options: 'i' }
      }

      const rolls = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray()

      return rolls
    } catch (error) {
      throw boom.internal('Error al obtener rollos: ' + error.message)
    }
  }

  // Obtener rollo por ID
  async findById(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      const collection = this.getCollection()
      const roll = await collection.findOne({ _id: new ObjectId(id) })

      if (!roll) {
        throw boom.notFound('Rollo no encontrado')
      }

      return roll
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al obtener rollo: ' + error.message)
    }
  }

  // Generar siguiente folio
  async generateFolio() {
    try {
      const collection = this.getCollection()
      const year = new Date().getFullYear()

      const lastRoll = await collection
        .find({ folio: { $regex: `^ROLLO-${year}-` } })
        .sort({ folio: -1 })
        .limit(1)
        .toArray()

      let nextNumber = 1

      if (lastRoll.length > 0) {
        const lastFolio = lastRoll[0].folio
        const lastNumber = parseInt(lastFolio.split('-')[2])
        nextNumber = lastNumber + 1
      }

      return `ROLLO-${year}-${String(nextNumber).padStart(4, '0')}`
    } catch (error) {
      throw new Error('Error al generar folio: ' + error.message)
    }
  }

  // Crear rollo (solo información básica)
  async create(rollData, userId) {
    try {
      this.validateRollData(rollData)

      const folio = await this.generateFolio()

      const collection = this.getCollection()
      const newRoll = {
        folio,
        fabric: {
          type: rollData.fabricType,
          meters: parseFloat(rollData.meters),
          supplier: rollData.supplier || '',
          purchaseDate: new Date(rollData.purchaseDate),
          cost: parseFloat(rollData.cost)
        },
        cutting: {
          date: null,
          pieces: 0,
          productType: '',
          size: '',
          notes: '',
          completed: false
        },
        sewing: {
          seamstress: '',
          embroider: '',
          piecesDelivered: 0,
          pricePerPiece: 0,
          totalCost: 0,
          deliveryDate: null,
          estimatedReturnDate: null,
          returns: [],
          piecesReturned: 0,
          piecesPending: 0,
          completed: false,
          notes: ''
        },
        laundry: {
          laundryName: '',
          piecesDelivered: 0,
          pricePerPiece: 0,
          totalCost: 0,
          deliveryDate: null,
          estimatedReturnDate: null,
          returns: [],
          piecesReturned: 0,
          piecesPending: 0,
          completed: false,
          notes: ''
        },
        finishing: {
          finisherName: '',
          piecesDelivered: 0,
          pricePerPiece: 0,
          totalCost: 0,
          deliveryDate: null,
          estimatedReturnDate: null,
          returns: [],
          piecesReturned: 0,
          piecesPending: 0,
          completed: false,
          notes: ''
        },
        summary: {
          totalPieces: 0,
          totalInvested: parseFloat(rollData.cost),
          costPerPiece: 0,
          piecesLost: 0,
          currentStatus: 'fabric', // fabric, cutting, sewing, laundry, finishing, completed
          currentLocation: 'warehouse'
        },
        createdBy: new ObjectId(userId),
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await collection.insertOne(newRoll)
      const createdRoll = await this.findById(result.insertedId.toString())
      return createdRoll
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al crear rollo: ' + error.message)
    }
  }

  // Registrar proceso de CORTE
  async registerCutting(id, cuttingData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      this.validateCuttingData(cuttingData)

      const roll = await this.findById(id)

      // Validar que no se haya registrado ya
      if (roll.cutting.completed) {
        throw boom.badRequest('El corte ya ha sido registrado')
      }

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            'cutting.date': new Date(cuttingData.date),
            'cutting.pieces': parseInt(cuttingData.pieces),
            'cutting.productType': cuttingData.productType,
            'cutting.size': cuttingData.size,
            'cutting.notes': cuttingData.notes || '',
            'cutting.completed': true,
            'summary.currentStatus': 'cutting',
            'summary.currentLocation': 'cutting',
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al registrar corte: ' + error.message)
    }
  }

  // Registrar proceso de MAQUILA (salida al maquilero)
  async registerSewing(id, sewingData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      this.validateSewingData(sewingData)

      const roll = await this.findById(id)

      // Validar que el corte esté completado
      if (!roll.cutting.completed) {
        throw boom.badRequest('Debe registrar el corte antes de la maquila')
      }

      // Validar que no se haya registrado ya
      if (roll.sewing.piecesDelivered > 0) {
        throw boom.badRequest('La maquila ya ha sido registrada')
      }

      const piecesDelivered = parseInt(sewingData.piecesDelivered)
      const pricePerPiece = parseFloat(sewingData.pricePerPiece)
      const totalCost = piecesDelivered * pricePerPiece

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            'sewing.seamstress': sewingData.seamstress,
            'sewing.embroider': sewingData.embroider || '',
            'sewing.piecesDelivered': piecesDelivered,
            'sewing.pricePerPiece': pricePerPiece,
            'sewing.totalCost': totalCost,
            'sewing.deliveryDate': new Date(sewingData.deliveryDate),
            'sewing.estimatedReturnDate': sewingData.estimatedReturnDate
              ? new Date(sewingData.estimatedReturnDate)
              : null,
            'sewing.piecesPending': piecesDelivered,
            'summary.currentStatus': 'sewing',
            'summary.currentLocation': 'seamstress',
            'summary.totalInvested': roll.summary.totalInvested + totalCost,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al registrar maquila: ' + error.message)
    }
  }

  // Registrar ENTREGA de maquila (parcial o total)
  async registerSewingReturn(id, returnData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      const roll = await this.findById(id)

      // Validar que la maquila esté registrada
      if (roll.sewing.piecesDelivered === 0) {
        throw boom.badRequest('Debe registrar la salida a maquila primero')
      }

      const pieces = parseInt(returnData.pieces)
      const newPiecesReturned = roll.sewing.piecesReturned + pieces
      const newPiecesPending = roll.sewing.piecesDelivered - newPiecesReturned

      // Validar que no exceda las piezas entregadas
      if (newPiecesReturned > roll.sewing.piecesDelivered) {
        throw boom.badRequest('No puede recibir más piezas de las entregadas')
      }

      const newReturn = {
        date: new Date(returnData.date),
        pieces: pieces,
        notes: returnData.notes || ''
      }

      const completed = newPiecesPending === 0

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $push: { 'sewing.returns': newReturn },
          $set: {
            'sewing.piecesReturned': newPiecesReturned,
            'sewing.piecesPending': newPiecesPending,
            'sewing.completed': completed,
            'summary.currentStatus': completed ? 'sewing' : 'sewing',
            'summary.currentLocation': completed ? 'warehouse' : 'seamstress',
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al registrar entrega de maquila: ' + error.message)
    }
  }

  // Registrar proceso de LAVANDERÍA (salida)
  async registerLaundry(id, laundryData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      this.validateLaundryData(laundryData)

      const roll = await this.findById(id)

      // Validar que la maquila esté completada
      if (!roll.sewing.completed) {
        throw boom.badRequest('Debe completar la maquila antes de la lavandería')
      }

      // Validar que no se haya registrado ya
      if (roll.laundry.piecesDelivered > 0) {
        throw boom.badRequest('La lavandería ya ha sido registrada')
      }

      const piecesDelivered = parseInt(laundryData.piecesDelivered)
      const pricePerPiece = parseFloat(laundryData.pricePerPiece)
      const totalCost = piecesDelivered * pricePerPiece

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            'laundry.laundryName': laundryData.laundryName,
            'laundry.piecesDelivered': piecesDelivered,
            'laundry.pricePerPiece': pricePerPiece,
            'laundry.totalCost': totalCost,
            'laundry.deliveryDate': new Date(laundryData.deliveryDate),
            'laundry.estimatedReturnDate': laundryData.estimatedReturnDate
              ? new Date(laundryData.estimatedReturnDate)
              : null,
            'laundry.piecesPending': piecesDelivered,
            'summary.currentStatus': 'laundry',
            'summary.currentLocation': 'laundry',
            'summary.totalInvested': roll.summary.totalInvested + totalCost,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al registrar lavandería: ' + error.message)
    }
  }

  // Registrar ENTREGA de lavandería
  async registerLaundryReturn(id, returnData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      const roll = await this.findById(id)

      if (roll.laundry.piecesDelivered === 0) {
        throw boom.badRequest('Debe registrar la salida a lavandería primero')
      }

      const pieces = parseInt(returnData.pieces)
      const newPiecesReturned = roll.laundry.piecesReturned + pieces
      const newPiecesPending = roll.laundry.piecesDelivered - newPiecesReturned

      if (newPiecesReturned > roll.laundry.piecesDelivered) {
        throw boom.badRequest('No puede recibir más piezas de las entregadas')
      }

      const newReturn = {
        date: new Date(returnData.date),
        pieces: pieces,
        notes: returnData.notes || ''
      }

      const completed = newPiecesPending === 0

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $push: { 'laundry.returns': newReturn },
          $set: {
            'laundry.piecesReturned': newPiecesReturned,
            'laundry.piecesPending': newPiecesPending,
            'laundry.completed': completed,
            'summary.currentStatus': completed ? 'laundry' : 'laundry',
            'summary.currentLocation': completed ? 'warehouse' : 'laundry',
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al registrar entrega de lavandería: ' + error.message)
    }
  }

  // Registrar proceso de TERMINADO (salida)
  async registerFinishing(id, finishingData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      this.validateFinishingData(finishingData)

      const roll = await this.findById(id)

      if (!roll.laundry.completed) {
        throw boom.badRequest('Debe completar la lavandería antes del terminado')
      }

      if (roll.finishing.piecesDelivered > 0) {
        throw boom.badRequest('El terminado ya ha sido registrado')
      }

      const piecesDelivered = parseInt(finishingData.piecesDelivered)
      const pricePerPiece = parseFloat(finishingData.pricePerPiece)
      const totalCost = piecesDelivered * pricePerPiece

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $set: {
            'finishing.finisherName': finishingData.finisherName,
            'finishing.piecesDelivered': piecesDelivered,
            'finishing.pricePerPiece': pricePerPiece,
            'finishing.totalCost': totalCost,
            'finishing.deliveryDate': new Date(finishingData.deliveryDate),
            'finishing.estimatedReturnDate': finishingData.estimatedReturnDate
              ? new Date(finishingData.estimatedReturnDate)
              : null,
            'finishing.piecesPending': piecesDelivered,
            'summary.currentStatus': 'finishing',
            'summary.currentLocation': 'finisher',
            'summary.totalInvested': roll.summary.totalInvested + totalCost,
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al registrar terminado: ' + error.message)
    }
  }

  // Registrar ENTREGA de terminado
  async registerFinishingReturn(id, returnData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      const roll = await this.findById(id)

      if (roll.finishing.piecesDelivered === 0) {
        throw boom.badRequest('Debe registrar la salida a terminado primero')
      }

      const pieces = parseInt(returnData.pieces)
      const newPiecesReturned = roll.finishing.piecesReturned + pieces
      const newPiecesPending = roll.finishing.piecesDelivered - newPiecesReturned

      if (newPiecesReturned > roll.finishing.piecesDelivered) {
        throw boom.badRequest('No puede recibir más piezas de las entregadas')
      }

      const newReturn = {
        date: new Date(returnData.date),
        pieces: pieces,
        notes: returnData.notes || ''
      }

      const completed = newPiecesPending === 0

      // Calcular totales finales
      const totalPieces = newPiecesReturned
      const piecesLost = roll.cutting.pieces - totalPieces
      const costPerPiece = totalPieces > 0 ? roll.summary.totalInvested / totalPieces : 0

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        {
          $push: { 'finishing.returns': newReturn },
          $set: {
            'finishing.piecesReturned': newPiecesReturned,
            'finishing.piecesPending': newPiecesPending,
            'finishing.completed': completed,
            'summary.totalPieces': totalPieces,
            'summary.costPerPiece': costPerPiece,
            'summary.piecesLost': piecesLost,
            'summary.currentStatus': completed ? 'completed' : 'finishing',
            'summary.currentLocation': completed ? 'warehouse' : 'finisher',
            updatedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      )

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al registrar entrega de terminado: ' + error.message)
    }
  }

  // Actualizar información del rollo
  async update(id, rollData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      const collection = this.getCollection()

      const updateData = {
        'fabric.type': rollData.fabricType,
        'fabric.meters': parseFloat(rollData.meters),
        'fabric.supplier': rollData.supplier || '',
        'fabric.purchaseDate': new Date(rollData.purchaseDate),
        'fabric.cost': parseFloat(rollData.cost),
        updatedAt: new Date()
      }

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      if (!result.value) {
        throw boom.notFound('Rollo no encontrado')
      }

      return result.value
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al actualizar rollo: ' + error.message)
    }
  }

  // Eliminar rollo
  async delete(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw boom.badRequest('ID de rollo inválido')
      }

      const collection = this.getCollection()
      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      if (result.deletedCount === 0) {
        throw boom.notFound('Rollo no encontrado')
      }

      return { message: 'Rollo eliminado correctamente' }
    } catch (error) {
      if (error.isBoom) throw error
      throw boom.internal('Error al eliminar rollo: ' + error.message)
    }
  }

  // Obtener estadísticas
  async getStats(filters = {}) {
    try {
      const collection = this.getCollection()
      const matchStage = {}

      if (filters.startDate || filters.endDate) {
        matchStage['fabric.purchaseDate'] = {}
        if (filters.startDate) {
          matchStage['fabric.purchaseDate'].$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          matchStage['fabric.purchaseDate'].$lte = new Date(filters.endDate)
        }
      }

      const stats = await collection.aggregate([
        { $match: matchStage },
        {
          $facet: {
            total: [{ $count: 'count' }],
            totalInvestment: [
              { $group: { _id: null, total: { $sum: '$summary.totalInvested' } } }
            ],
            totalPieces: [
              { $group: { _id: null, total: { $sum: '$summary.totalPieces' } } }
            ],
            byStatus: [
              { $group: { _id: '$summary.currentStatus', count: { $sum: 1 } } }
            ],
            byProductType: [
              { $group: { _id: '$cutting.productType', count: { $sum: 1 }, pieces: { $sum: '$summary.totalPieces' } } }
            ],
            avgCostPerPiece: [
              {
                $match: { 'summary.totalPieces': { $gt: 0 } }
              },
              {
                $group: {
                  _id: null,
                  avg: { $avg: '$summary.costPerPiece' }
                }
              }
            ]
          }
        }
      ]).toArray()

      const result = stats[0]

      return {
        total: result.total[0]?.count || 0,
        totalInvestment: result.totalInvestment[0]?.total || 0,
        totalPieces: result.totalPieces[0]?.total || 0,
        byStatus: result.byStatus || [],
        byProductType: result.byProductType || [],
        avgCostPerPiece: result.avgCostPerPiece[0]?.avg || 0
      }
    } catch (error) {
      throw boom.internal('Error al obtener estadísticas: ' + error.message)
    }
  }

  // ============================================
  // MÉTODOS DE VALIDACIÓN
  // ============================================

  validateRollData(data) {
    if (!data.fabricType || !data.fabricType.trim()) {
      throw boom.badRequest('El tipo de tela es requerido')
    }

    if (!data.meters || parseFloat(data.meters) <= 0) {
      throw boom.badRequest('Los metros deben ser mayores a 0')
    }

    if (!data.purchaseDate) {
      throw boom.badRequest('La fecha de compra es requerida')
    }

    if (!data.cost || parseFloat(data.cost) <= 0) {
      throw boom.badRequest('El costo debe ser mayor a 0')
    }
  }

  validateCuttingData(data) {
    if (!data.date) {
      throw boom.badRequest('La fecha de corte es requerida')
    }

    if (!data.pieces || parseInt(data.pieces) <= 0) {
      throw boom.badRequest('El número de piezas debe ser mayor a 0')
    }

    if (!data.productType || !data.productType.trim()) {
      throw boom.badRequest('El tipo de producto es requerido')
    }

    if (!data.size || !data.size.trim()) {
      throw boom.badRequest('La talla es requerida')
    }
  }

  validateSewingData(data) {
    if (!data.seamstress || !data.seamstress.trim()) {
      throw boom.badRequest('El nombre del maquilero es requerido')
    }

    if (!data.piecesDelivered || parseInt(data.piecesDelivered) <= 0) {
      throw boom.badRequest('Las piezas entregadas deben ser mayores a 0')
    }

    if (!data.pricePerPiece || parseFloat(data.pricePerPiece) <= 0) {
      throw boom.badRequest('El precio por pieza debe ser mayor a 0')
    }

    if (!data.deliveryDate) {
      throw boom.badRequest('La fecha de entrega es requerida')
    }
  }

  validateLaundryData(data) {
    if (!data.laundryName || !data.laundryName.trim()) {
      throw boom.badRequest('El nombre de la lavandería es requerido')
    }

    if (!data.piecesDelivered || parseInt(data.piecesDelivered) <= 0) {
      throw boom.badRequest('Las piezas entregadas deben ser mayores a 0')
    }

    if (!data.pricePerPiece || parseFloat(data.pricePerPiece) <= 0) {
      throw boom.badRequest('El precio por pieza debe ser mayor a 0')
    }

    if (!data.deliveryDate) {
      throw boom.badRequest('La fecha de entrega es requerida')
    }
  }

  validateFinishingData(data) {
    if (!data.finisherName || !data.finisherName.trim()) {
      throw boom.badRequest('El nombre del terminador es requerido')
    }

    if (!data.piecesDelivered || parseInt(data.piecesDelivered) <= 0) {
      throw boom.badRequest('Las piezas entregadas deben ser mayores a 0')
    }

    if (!data.pricePerPiece || parseFloat(data.pricePerPiece) <= 0) {
      throw boom.badRequest('El precio por pieza debe ser mayor a 0')
    }

    if (!data.deliveryDate) {
      throw boom.badRequest('La fecha de entrega es requerida')
    }
  }
}

export default ProductionService
