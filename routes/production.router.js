import express from 'express';
import ProductionService from '../services/production.service.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();
const productionService = new ProductionService();

// ============================================
// RUTAS PRINCIPALES - ROLLOS
// ============================================

// GET /api/production - Obtener todos los rollos
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = {
        productType: req.query.productType,
        status: req.query.status,
        startDate: req.query.startDate,
        endDate: req.query.endDate,
        search: req.query.search
      };

      const rolls = await productionService.findAll(filters);
      res.status(200).json({
        success: true,
        data: rolls
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/production/stats - Obtener estadísticas
router.get('/stats',
  authenticate,
  async (req, res, next) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate
      };

      const stats = await productionService.getStats(filters);
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/production/:id - Obtener rollo por ID
router.get('/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const roll = await productionService.findById(req.params.id);
      res.status(200).json({
        success: true,
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/production - Crear rollo
router.post('/',
  authenticate,
  authorize('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const roll = await productionService.create(req.body, userId);
      res.status(201).json({
        success: true,
        message: 'Rollo creado exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/production/:id - Actualizar información del rollo
router.put('/:id',
  authenticate,
  authorize('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const roll = await productionService.update(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Rollo actualizado exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/production/:id - Eliminar rollo
router.delete('/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const result = await productionService.delete(req.params.id);
      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// RUTAS DE PROCESOS - CORTE
// ============================================

// POST /api/production/:id/cutting - Registrar corte
router.post('/:id/cutting',
  authenticate,
  authorize('admin', 'supervisor', 'operator'),
  async (req, res, next) => {
    try {
      const roll = await productionService.registerCutting(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Corte registrado exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// RUTAS DE PROCESOS - MAQUILA
// ============================================

// POST /api/production/:id/sewing - Registrar salida a maquila
router.post('/:id/sewing',
  authenticate,
  authorize('admin', 'supervisor', 'operator'),
  async (req, res, next) => {
    try {
      const roll = await productionService.registerSewing(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Salida a maquila registrada exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/production/:id/sewing/return - Registrar entrega de maquila
router.post('/:id/sewing/return',
  authenticate,
  authorize('admin', 'supervisor', 'operator'),
  async (req, res, next) => {
    try {
      const roll = await productionService.registerSewingReturn(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Entrega de maquila registrada exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// RUTAS DE PROCESOS - LAVANDERÍA
// ============================================

// POST /api/production/:id/laundry - Registrar salida a lavandería
router.post('/:id/laundry',
  authenticate,
  authorize('admin', 'supervisor', 'operator'),
  async (req, res, next) => {
    try {
      const roll = await productionService.registerLaundry(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Salida a lavandería registrada exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/production/:id/laundry/return - Registrar entrega de lavandería
router.post('/:id/laundry/return',
  authenticate,
  authorize('admin', 'supervisor', 'operator'),
  async (req, res, next) => {
    try {
      const roll = await productionService.registerLaundryReturn(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Entrega de lavandería registrada exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// RUTAS DE PROCESOS - TERMINADO
// ============================================

// POST /api/production/:id/finishing - Registrar salida a terminado
router.post('/:id/finishing',
  authenticate,
  authorize('admin', 'supervisor', 'operator'),
  async (req, res, next) => {
    try {
      const roll = await productionService.registerFinishing(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Salida a terminado registrada exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/production/:id/finishing/return - Registrar entrega de terminado
router.post('/:id/finishing/return',
  authenticate,
  authorize('admin', 'supervisor', 'operator'),
  async (req, res, next) => {
    try {
      const roll = await productionService.registerFinishingReturn(req.params.id, req.body);
      res.status(200).json({
        success: true,
        message: 'Entrega de terminado registrada exitosamente',
        data: roll
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
