import express from 'express'
import collectionsRouter from './collections.router.js'
import authRouter from './auth.router.js'
import usersRouter from './users.router.js'
import customersRouter from './customers.router.js'
import paymentsRouter from './payments.router.js'
import salesRouter from './sales.router.js'
import productionRouter from './production.router.js'
import sizesRouter from "./sizes.router.js"
import productsRouter from "./products.router.js"
import reportsRouter from "./reports.router.js"

const router = express.Router()

const AppRouter = (app,io) => {

  app.use('/api/v1', router)
  router.use('/collections', collectionsRouter(io))
  router.use('/auth', authRouter)
  router.use('/users', usersRouter(io))
  router.use('/customers', customersRouter(io))
  router.use('/payments',paymentsRouter)
  router.use('/sales',salesRouter)
  router.use('/production',productionRouter)
  router.use("/sizes", sizesRouter)
  router.use("/products", productsRouter)
  router.use("/reports", reportsRouter)
  //Agregar las rutas necesarias

}

export default AppRouter
