import express from 'express'
import PaymentService from '../services/payment.service.js'
import { authenticate, authorize } from '../middlewares/authMiddleware.js'

const router = express.Router()
const paymentService = new PaymentService()

// GET /api/payments - Obtener todos los pagos
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = {
        saleId: req.query.saleId,
        customerId: req.query.customerId,
        paymentMethod: req.query.paymentMethod,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }

      const payments = await paymentService.findAll(filters)
      res.status(200).json({
        success: true,
        data: payments
      })
    } catch (error) {
      next(error)
    }
  }
)

// GET /api/payments/stats - Obtener estadísticas de pagos
router.get('/stats',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = {
        customerId: req.query.customerId,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }

      const stats = await paymentService.getStats(filters)
      res.status(200).json({
        success: true,
        data: stats
      })
    } catch (error) {
      next(error)
    }
  }
)

// GET /api/payments/sale/:saleId - Obtener pagos por venta
router.get('/sale/:saleId',
  authenticate,
  async (req, res, next) => {
    try {
      const payments = await paymentService.findBySaleId(req.params.saleId)
      res.status(200).json({
        success: true,
        data: payments
      })
    } catch (error) {
      next(error)
    }
  }
)

// GET /api/payments/customer/:customerId - Obtener pagos por cliente
router.get('/customer/:customerId',
  authenticate,
  async (req, res, next) => {
    try {
      const payments = await paymentService.findByCustomerId(req.params.customerId)
      res.status(200).json({
        success: true,
        data: payments
      })
    } catch (error) {
      next(error)
    }
  }
)

// GET /api/payments/:id - Obtener pago por ID
router.get('/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const payment = await paymentService.findById(req.params.id)
      res.status(200).json({
        success: true,
        data: payment
      })
    } catch (error) {
      next(error)
    }
  }
)

// POST /api/payments - Crear pago
router.post('/',
  authenticate,
  authorize('admin', 'supervisor', 'seller'),
  async (req, res, next) => {
    try {
      const userId = req.user.id  // Del token JWT
      const payment = await paymentService.create(req.body, userId)
      res.status(201).json({
        success: true,
        message: 'Pago registrado exitosamente',
        data: payment
      })
    } catch (error) {
      next(error)
    }
  }
)

// DELETE /api/payments/:id - Eliminar pago (revertir)
router.delete('/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const result = await paymentService.delete(req.params.id)
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
