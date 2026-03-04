import { ObjectId } from 'mongodb'
import { db } from './../db/mongoClient.js'
import Boom from '@hapi/boom'

class SizeService {
  constructor() {
    this.collectionName = 'sizes'
  }

  getCollection() {
    return db.collection(this.collectionName)
  }

  // Obtener todas las tallas (ordenadas)
  async findAll(filters = {}) {
    try {
      const collection = this.getCollection()
      const query = {}

      if (filters.active !== undefined) {
        query.active = filters.active === 'true' || filters.active === true
      }

      const sizes = await collection
        .find(query)
        .sort({ order: 1 })
        .toArray()

      return sizes
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al obtener tallas: ' + error.message)
    }
  }

  // Obtener talla por ID
  async findById(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de talla invalido')
      }

      const collection = this.getCollection()
      const size = await collection.findOne({ _id: new ObjectId(id) })

      if (!size) {
        throw Boom.notFound('Talla no encontrada')
      }

      return size
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al obtener talla: ' + error.message)
    }
  }

  // Crear talla
  async create(sizeData) {
    try {
      this.validateSizeData(sizeData)

      const collection = this.getCollection()

      // Verificar que no exista una talla con el mismo label
      const existing = await collection.findOne({
        label: sizeData.label.trim().toUpperCase()
      })

      if (existing) {
        throw Boom.conflict('La talla ' + sizeData.label + ' ya existe')
      }

      // Calcular el siguiente orden si no se proporciona
      let order = sizeData.order
      if (order === undefined || order === null) {
        const lastSize = await collection
          .find()
          .sort({ order: -1 })
          .limit(1)
          .toArray()
        order = lastSize.length > 0 ? lastSize[0].order + 1 : 1
      }

      const newSize = {
        label: sizeData.label.trim().toUpperCase(),
        order: parseInt(order),
        active: sizeData.active !== undefined ? sizeData.active : true,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await collection.insertOne(newSize)
      return await this.findById(result.insertedId.toString())
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al crear talla: ' + error.message)
    }
  }

  // Crear multiples tallas de una vez
  async createMany(sizesArray) {
    try {
      if (!Array.isArray(sizesArray) || sizesArray.length === 0) {
        throw Boom.badRequest('Debe proporcionar un arreglo de tallas')
      }

      const collection = this.getCollection()
      const results = []

      const lastSize = await collection
        .find()
        .sort({ order: -1 })
        .limit(1)
        .toArray()
      let nextOrder = lastSize.length > 0 ? lastSize[0].order + 1 : 1

      for (const sizeData of sizesArray) {
        const label = (sizeData.label || sizeData).toString().trim().toUpperCase()

        if (!label) continue

        const existing = await collection.findOne({ label })
        if (existing) {
          results.push({ label, status: 'already_exists', id: existing._id })
          continue
        }

        const newSize = {
          label,
          order: sizeData.order || nextOrder++,
          active: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }

        const result = await collection.insertOne(newSize)
        results.push({ label, status: 'created', id: result.insertedId })
      }

      return results
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al crear tallas: ' + error.message)
    }
  }

  // Actualizar talla
  async update(id, sizeData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de talla invalido')
      }

      const collection = this.getCollection()

      if (sizeData.label) {
        const existing = await collection.findOne({
          label: sizeData.label.trim().toUpperCase(),
          _id: { $ne: new ObjectId(id) }
        })

        if (existing) {
          throw Boom.conflict('La talla ' + sizeData.label + ' ya existe')
        }
      }

      const updateData = {
        updatedAt: new Date()
      }

      if (sizeData.label) updateData.label = sizeData.label.trim().toUpperCase()
      if (sizeData.order !== undefined) updateData.order = parseInt(sizeData.order)
      if (sizeData.active !== undefined) updateData.active = sizeData.active

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      if (!result.value) {
        throw Boom.notFound('Talla no encontrada')
      }

      return result.value
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al actualizar talla: ' + error.message)
    }
  }

  // Eliminar talla
  async delete(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de talla invalido')
      }

      const productsUsingSize = await db.collection('products').countDocuments({
        'sizes.sizeId': new ObjectId(id)
      })

      if (productsUsingSize > 0) {
        throw Boom.conflict(
          'No se puede eliminar: ' + productsUsingSize + ' producto(s) usan esta talla. Desactivela en su lugar.'
        )
      }

      const collection = this.getCollection()
      const result = await collection.deleteOne({ _id: new ObjectId(id) })

      if (result.deletedCount === 0) {
        throw Boom.notFound('Talla no encontrada')
      }

      return { message: 'Talla eliminada correctamente' }
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al eliminar talla: ' + error.message)
    }
  }

  // Validaciones
  validateSizeData(data) {
    if (!data.label || !data.label.toString().trim()) {
      throw Boom.badRequest('El nombre de la talla es requerido')
    }
  }
}

export default SizeService
