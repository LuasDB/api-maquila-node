import express from 'express'
import SizeService from '../services/sizes.service.js'
import { authenticate, authorize } from '../middlewares/authMiddleware.js'

const router = express.Router()
const sizeService = new SizeService()

router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = {
        active: req.query.active
      }

      const sizes = await sizeService.findAll(filters)
      res.status(200).json({
        success: true,
        data: sizes
      })
    } catch (error) {
      next(error)
    }
  }
)

// GET /api/v1/sizes/:id - Obtener talla por ID
router.get('/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const size = await sizeService.findById(req.params.id)
      res.status(200).json({
        success: true,
        data: size
      })
    } catch (error) {
      next(error)
    }
  }
)

// POST /api/v1/sizes - Crear una talla
router.post('/',
  authenticate,
  authorize('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const size = await sizeService.create(req.body)
      res.status(201).json({
        success: true,
        message: 'Talla creada exitosamente',
        data: size
      })
    } catch (error) {
      next(error)
    }
  }
)

// POST /api/v1/sizes/batch - Crear multiples tallas
router.post('/batch',
  authenticate,
  authorize('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const results = await sizeService.createMany(req.body.sizes)
      res.status(201).json({
        success: true,
        message: 'Tallas procesadas',
        data: results
      })
    } catch (error) {
      next(error)
    }
  }
)

// PATCH /api/v1/sizes/:id - Actualizar talla
router.patch('/:id',
  authenticate,
  authorize('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const size = await sizeService.update(req.params.id, req.body)
      res.status(200).json({
        success: true,
        message: 'Talla actualizada exitosamente',
        data: size
      })
    } catch (error) {
      next(error)
    }
  }
)

// DELETE /api/v1/sizes/:id - Eliminar talla
router.delete('/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const result = await sizeService.delete(req.params.id)
      res.status(200).json({
        success: true,
        ...result
      })
    } catch (error) {
      next(error)
    }
  }
)

export default router
