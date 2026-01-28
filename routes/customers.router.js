import express from 'express'
import CustomerService from './../services/customers.service.js'
import { authenticate,authorize } from './../middlewares/authMiddleware.js'

const router = express.Router()
const customer = new CustomerService()

const customerRouter = (io)=>{

  router.get('/',authenticate,async(req,res,next)=>{
    try {
      const filters = {
        active: req.query.active,
        state: req.query.state,
        search: req.query.search,
        highBalance: req.query.highBalance
      }
      const customers = await customer.getAll(filters)

      res.status(200).json({
        success:true,
        data:customers
      })

    } catch (error) {
      next(error)
    }
  })
  router.get('/:id',authenticate,async(req,res,next)=>{
    try {

      const oneCustomer = await customer.getOneById(req.params.id)

      res.status(200).json({
        success:true,
        data:oneCustomer
      })

    } catch (error) {
      next(error)
    }
  })
  router.get('/all/stats',authenticate,async(req,res,next)=>{
    try {

      const stats = await customer.getStats()

      res.status(200).json({
        success:true,
        data:stats
      })

    } catch (error) {
      next(error)
    }
  })
  router.post('/',authenticate,authorize('admin','supervisor'),async(req,res,next)=>{
    try {

      const result = await customer.create(req.body)

      res.status(201).json({
        success:true,
        message:'Registro creado correctamente',
        data:result
      })

    } catch (error) {
      next(error)
    }
  })
  router.patch('/:id',authenticate,async(req,res,next)=>{
    try {
      const update = await customer.updateOneById(req.params.id,req.body)

      res.status(200).json({
        success:true,
        message:'Elemento actualizado',
        data:update
      })

    } catch (error) {
      next(error)
    }
  })
  router.delete('/:id',authenticate,authorize('admin','supervisor'),async(req,res,next)=>{
    try {
      const deleteOne = await customer.delete(req.params.id,req.body)

      res.status(200).json({
        success:true,
        message:'Elemento eliminado',
        data:deleteOne
      })

    } catch (error) {
      next(error)
    }
  })


  return router

}

export default customerRouter
