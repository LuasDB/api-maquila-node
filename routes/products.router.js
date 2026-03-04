import express from "express"
import ProductService from "../services/products.service.js"
import { authenticate, authorize } from "../middlewares/authMiddleware.js"

const router = express.Router()
const productService = new ProductService()

router.get("/", authenticate, async (req, res, next) => {
  try {
    const filters = { active: req.query.active, category: req.query.category, search: req.query.search }
    const products = await productService.findAll(filters)
    res.status(200).json({ success: true, data: products })
  } catch (error) { next(error) }
})

router.get("/stats", authenticate, async (req, res, next) => {
  try {
    const stats = await productService.getStats()
    res.status(200).json({ success: true, data: stats })
  } catch (error) { next(error) }
})

router.get("/:id", authenticate, async (req, res, next) => {
  try {
    const product = await productService.findById(req.params.id)
    res.status(200).json({ success: true, data: product })
  } catch (error) { next(error) }
})

router.post("/", authenticate, authorize("admin", "supervisor"), async (req, res, next) => {
  try {
    const userId = req.user.id || req.user._id
    const product = await productService.create(req.body, userId)
    res.status(201).json({ success: true, message: "Producto creado exitosamente", data: product })
  } catch (error) { next(error) }
})

router.patch("/:id", authenticate, authorize("admin", "supervisor"), async (req, res, next) => {
  try {
    const product = await productService.update(req.params.id, req.body)
    res.status(200).json({ success: true, message: "Producto actualizado exitosamente", data: product })
  } catch (error) { next(error) }
})

router.delete("/:id", authenticate, authorize("admin"), async (req, res, next) => {
  try {
    const result = await productService.delete(req.params.id)
    res.status(200).json({ success: true, ...result })
  } catch (error) { next(error) }
})

export default router
