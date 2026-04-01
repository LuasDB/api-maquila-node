import express from "express"
import ReportsService from "../services/reports.service.js"
import { authenticate, authorize } from "../middlewares/authMiddleware.js"

const router = express.Router()
const reportsService = new ReportsService()

// GET /api/v1/reports/sales - Reporte de ventas
router.get("/sales",
  authenticate,
  authorize("admin", "supervisor"),
  async (req, res, next) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }
      const report = await reportsService.getSalesReport(filters)
      res.status(200).json({ success: true, data: report })
    } catch (error) {
      next(error)
    }
  }
)

// GET /api/v1/reports/production - Reporte de produccion
router.get("/production",
  authenticate,
  authorize("admin", "supervisor"),
  async (req, res, next) => {
    try {
      const filters = {
        startDate: req.query.startDate,
        endDate: req.query.endDate
      }
      const report = await reportsService.getProductionReport(filters)
      res.status(200).json({ success: true, data: report })
    } catch (error) {
      next(error)
    }
  }
)

export default router