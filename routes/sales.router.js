import express from 'express';
import SaleService from '../services/sales.service.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();
const saleService = new SaleService();

// GET /api/sales - Obtener todas las ventas
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = {
        customerId: req.query.customerId,
        status: req.query.status,
        paymentType: req.query.paymentType,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        withBalance: req.query.withBalance
      };

      const sales = await saleService.findAll(filters);
      res.status(200).json({
        success: true,
        data: sales
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/stats - Obtener estadísticas de ventas
router.get('/stats',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = {
        customerId: req.query.customerId,
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      const stats = await saleService.getStats(filters);
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/customer/:customerId - Obtener ventas por cliente
router.get('/customer/:customerId',
  authenticate,
  async (req, res, next) => {
    try {
      const sales = await saleService.findByCustomerId(req.params.customerId);
      res.status(200).json({
        success: true,
        data: sales
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/:id - Obtener venta por ID
router.get('/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const sale = await saleService.findById(req.params.id);
      res.status(200).json({
        success: true,
        data: sale
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sales - Crear venta
router.post('/',
  authenticate,
  authorize('admin', 'supervisor', 'seller'),
  async (req, res, next) => {
    try {
      const userId = req.user.id; // Del token JWT
      const sale = await saleService.create(req.body, userId);
      res.status(201).json({
        success: true,
        message: 'Venta creada exitosamente',
        data: sale
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/sales/:id - Actualizar venta
router.patch('/:id',
  authenticate,
  authorize('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const sale = await saleService.update(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Venta actualizada exitosamente',
        data: sale
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/sales/:id - Eliminar venta
router.delete('/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const result = await saleService.delete(req.params.id);
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
