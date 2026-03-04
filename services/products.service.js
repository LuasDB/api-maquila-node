import { ObjectId } from 'mongodb'
import { db } from './../db/mongoClient.js'
import Boom from '@hapi/boom'

class ProductService {
  constructor() {
    this.collectionName = 'products'
  }

  getCollection() {
    return db.collection(this.collectionName)
  }

  async findAll(filters = {}) {
    try {
      const collection = this.getCollection()
      const query = {}

      if (filters.active !== undefined) {
        query.active = filters.active === 'true' || filters.active === true
      }

      if (filters.category) {
        query.category = filters.category
      }

      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { folio: { $regex: filters.search, $options: 'i' } },
          { description: { $regex: filters.search, $options: 'i' } }
        ]
      }

      const products = await collection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray()

      return products
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al obtener productos: ' + error.message)
    }
  }

  async findById(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de producto invalido')
      }

      const collection = this.getCollection()
      const product = await collection.findOne({ _id: new ObjectId(id) })

      if (!product) {
        throw Boom.notFound('Producto no encontrado')
      }

      return product
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al obtener producto: ' + error.message)
    }
  }

  async create(productData, userId) {
    try {
      this.validateProductData(productData)

      const collection = this.getCollection()

      const existing = await collection.findOne({
        name: { $regex: new RegExp('^' + productData.name.trim() + '$', 'i') }
      })

      if (existing) {
        throw Boom.conflict('Ya existe un producto con el nombre "' + productData.name + '"')
      }

      // Validar que las tallas existan en el catalogo
      const sizeIds = productData.sizes.map(s => new ObjectId(s.sizeId))
      const existingSizes = await db.collection('sizes')
        .find({ _id: { $in: sizeIds }, active: true })
        .toArray()

      if (existingSizes.length !== sizeIds.length) {
        throw Boom.badRequest('Una o mas tallas seleccionadas no existen o estan inactivas')
      }

      const folio = await this.generateFolio()

      const sizesWithLabels = productData.sizes.map(s => {
        const catalogSize = existingSizes.find(
          es => es._id.toString() === s.sizeId.toString()
        )
        return {
          sizeId: new ObjectId(s.sizeId),
          label: catalogSize.label,
          price: parseFloat(s.price || productData.basePrice || 0),
          cost: parseFloat(s.cost || productData.baseCost || 0)
        }
      })

      const newProduct = {
        folio,
        name: productData.name.trim(),
        description: productData.description ? productData.description.trim() : '',
        category: productData.category || 'general',
        sizes: sizesWithLabels,
        basePrice: parseFloat(productData.basePrice || 0),
        baseCost: parseFloat(productData.baseCost || 0),
        active: productData.active !== undefined ? productData.active : true,
        createdBy: new ObjectId(userId),
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const result = await collection.insertOne(newProduct)
      return await this.findById(result.insertedId.toString())
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al crear producto: ' + error.message)
    }
  }

  async update(id, productData) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de producto invalido')
      }

      const collection = this.getCollection()
      const existingProduct = await this.findById(id)

      if (productData.name && productData.name.trim() !== existingProduct.name) {
        const duplicate = await collection.findOne({
          name: { $regex: new RegExp('^' + productData.name.trim() + '$', 'i') },
          _id: { $ne: new ObjectId(id) }
        })

        if (duplicate) {
          throw Boom.conflict('Ya existe un producto con el nombre "' + productData.name + '"')
        }
      }

      const updateData = { updatedAt: new Date() }

      if (productData.name) updateData.name = productData.name.trim()
      if (productData.description !== undefined) updateData.description = productData.description.trim()
      if (productData.category) updateData.category = productData.category
      if (productData.basePrice !== undefined) updateData.basePrice = parseFloat(productData.basePrice)
      if (productData.baseCost !== undefined) updateData.baseCost = parseFloat(productData.baseCost)
      if (productData.active !== undefined) updateData.active = productData.active

      if (productData.sizes && Array.isArray(productData.sizes)) {
        const sizeIds = productData.sizes.map(s => new ObjectId(s.sizeId))
        const existingSizes = await db.collection('sizes')
          .find({ _id: { $in: sizeIds }, active: true })
          .toArray()

        if (existingSizes.length !== sizeIds.length) {
          throw Boom.badRequest('Una o mas tallas seleccionadas no existen o estan inactivas')
        }

        updateData.sizes = productData.sizes.map(s => {
          const catalogSize = existingSizes.find(
            es => es._id.toString() === s.sizeId.toString()
          )
          return {
            sizeId: new ObjectId(s.sizeId),
            label: catalogSize.label,
            price: parseFloat(s.price || productData.basePrice || existingProduct.basePrice || 0),
            cost: parseFloat(s.cost || productData.baseCost || existingProduct.baseCost || 0)
          }
        })
      }

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: updateData },
        { returnDocument: 'after' }
      )

      if (!result.value) {
        throw Boom.notFound('Producto no encontrado')
      }

      return result.value
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al actualizar producto: ' + error.message)
    }
  }

  async delete(id) {
    try {
      if (!ObjectId.isValid(id)) {
        throw Boom.badRequest('ID de producto invalido')
      }

      const collection = this.getCollection()
      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: { active: false, updatedAt: new Date() } },
        { returnDocument: 'after' }
      )

      if (!result.value) {
        throw Boom.notFound('Producto no encontrado')
      }

      return { message: 'Producto desactivado correctamente' }
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al eliminar producto: ' + error.message)
    }
  }

  async getStats() {
    try {
      const collection = this.getCollection()

      const stats = await collection.aggregate([
        {
          $facet: {
            total: [{ $count: 'count' }],
            active: [{ $match: { active: true } }, { $count: 'count' }],
            inactive: [{ $match: { active: false } }, { $count: 'count' }],
            byCategory: [
              { $match: { active: true } },
              { $group: { _id: '$category', count: { $sum: 1 } } }
            ],
            avgPrice: [
              { $match: { active: true } },
              { $group: { _id: null, avg: { $avg: '$basePrice' } } }
            ]
          }
        }
      ]).toArray()

      const result = stats[0]
      return {
        total: result.total[0]?.count || 0,
        active: result.active[0]?.count || 0,
        inactive: result.inactive[0]?.count || 0,
        byCategory: result.byCategory || [],
        avgPrice: result.avgPrice[0]?.avg || 0
      }
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal('Error al obtener estadisticas: ' + error.message)
    }
  }

  // ============================================
  // METODOS PRIVADOS
  // ============================================

  async generateFolio() {
    try {
      const collection = this.getCollection()
      const year = new Date().getFullYear()
      const prefix = 'PROD-' + year + '-'

      const lastProduct = await collection
        .find({ folio: { $regex: '^' + prefix } })
        .sort({ folio: -1 })
        .limit(1)
        .toArray()

      let nextNumber = 1

      if (lastProduct.length > 0) {
        const lastFolio = lastProduct[0].folio
        const lastNumber = parseInt(lastFolio.split('-')[2])
        nextNumber = lastNumber + 1
      }

      return prefix + String(nextNumber).padStart(4, '0')
    } catch (error) {
      throw new Error('Error al generar folio: ' + error.message)
    }
  }

  validateProductData(data) {
    if (!data.name || !data.name.trim()) {
      throw Boom.badRequest('El nombre del producto es requerido')
    }

    if (!data.sizes || !Array.isArray(data.sizes) || data.sizes.length === 0) {
      throw Boom.badRequest('Debe seleccionar al menos una talla')
    }

    for (const size of data.sizes) {
      if (!size.sizeId || !ObjectId.isValid(size.sizeId)) {
        throw Boom.badRequest('ID de talla invalido en la lista de tallas')
      }
    }

    if (data.basePrice !== undefined && parseFloat(data.basePrice) < 0) {
      throw Boom.badRequest('El precio base no puede ser negativo')
    }

    if (data.baseCost !== undefined && parseFloat(data.baseCost) < 0) {
      throw Boom.badRequest('El costo base no puede ser negativo')
    }
  }
}

export default ProductService
