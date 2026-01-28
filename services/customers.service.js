import Boom from "@hapi/boom"
import { db } from './../db/mongoClient.js'
import { ObjectId } from 'mongodb'



class CustomerService{
  constructor(){}

  async create(customerData){

    try {
      const newCustomer = {
        ...customerData,
        currentBalace:0,
        active: customerData.active !== undefined ? customerData.active : true,
        createdAt:new Date().toISOString(),
        updatedAt:new Date().toISOString(),
        creditLimit: parseFloat(customerData.creditLimit),
        creditDays: parseInt(customerData.creditDays),
        active: customerData.active !== undefined ? customerData.active : true
      }
      const customer = await db.collection('customers').insertOne(newCustomer)

      if(!customer.insertedId){
        throw Boom.badImplementation('No se puedo guardar el registro')
      }
      return customer

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo crear el registro',error)}
    }
  }
  async getAll(filters = {}){
    try {
      const query = {}

      if (filters.active !== undefined) {
        query.active = filters.active === 'true' || filters.active === true
      }
      if (filters.state) {
        query.state = filters.state
      }
      if (filters.highBalance === 'true') {
        query.$expr = {
          $gt: ['$currentBalance', { $multiply: ['$creditLimit', 0.7] }]
        }
      }
      if (filters.search) {
        query.$or = [
          { name: { $regex: filters.search, $options: 'i' } },
          { email: { $regex: filters.search, $options: 'i' } },
          { city: { $regex: filters.search, $options: 'i' } }
        ]
      }


      const customers = await db.collection('customers')
      .find(query)
      .sort({createdAt:-1})
      .toArray()

      return customers

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo traer a todos los usuarios',error)}
    }
  }
  async getOneById(id){
    try {
      if(!ObjectId.isValid(id)){
        throw Boom.badImplementation(`El ID ${id} no es un ID valido`)
      }

      const customer = await db.collection('customers')
      .findOne( {_id:new ObjectId(id)})

      if(!customer){
        throw Boom.notFound('El elemento no fue encontrado')
      }

      return customer

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo traer a todos los usuarios',error)}
    }
  }
  async updateOneById(id,customerData){
    try {
      if(!ObjectId.isValid(id)){
        throw Boom.badImplementation(`El ID ${id} no es un ID valido`)
      }

      const updateData = {
        ...customerData,
        updatedAt:new Date()
      }

      delete updateData.currentBalace
      delete updateData._id

      const updateCustomer = await db.collection('customers')
      .updateOne(
        {_id: new ObjectId(id)},
        {$set: updateData},
        {returnDocument:'after'})

        return updateCustomer.value

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo actualizar el registro',error)}
    }
  }
  async updateBalace(id, amount, operation = 'add'){
    try {
      if(!ObjectId.isValid(id)){
        throw Boom.badImplementation(`El ID ${id} no es un ID valido`)
      }

      const updateOperation = operation == 'add' ?
      { $inc: { currentBalace: amount }} :
      { $inc: { currentBalace: -amount }}

      const result = await db.collection('customers')
      .updateOne(
        {_id : new ObjectId(i)},
        {...updateOperation,
          $set:{updatedAt: new Date().toISOString()}
        },
        { returnDocument: 'after'}
      )

      return result.value

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo actualizar el registro',error)}
    }
  }
  async softDelete(id){

    try {
      if(!ObjectId.isValid(id)){
        throw Boom.badImplementation(`El ID ${id} no es un ID valido`)
      }

      const result = await db.collection('customers')
      .findOneAndUpdate(
        { _id: new ObjectId(id)},
        {
          $set: {
            active:false,
            updatedAt: new Date().toISOString()
          }
        },
        { returnDocument:'after' }
      )

      return result.value
    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo eliminar (soft) el registro',error)}
    }
  }
  async delete(id){
    try {


    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo eliminar el registro',error)}
    }
  }
  async count(filters={}){
    try {
      const query = {}
      if(filters.active !== undefined){
        query.active = filters.active
      }

      return await db.collection('customers').countDocuments(query)

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo constabilizar los elementos',error)}
    }
  }
  async getStats(){
    try {
      const stats = await db.collection('customers').aggregate([
        {
          $facet:{
            total:[{$count:'count'}],
            active:[{ $match: { active: true }},{$count:'count'}],
            inactive:[{ $match:{active: false}},{$count:'count'}],
            totalBalace:[
              { $match:{active:true}},
              { $group: {_id:null, total:{ $sum: '$currentBalance '}}}
            ],
            highBalance: [
              {
                $match: {
                  active: true,
                  $expr: { $gt: ['$currentBalance', { $multiply: ['$creditLimit', 0.7] }] }
                }
              },
              { $count: 'count' }
            ]

          }
        }
      ]).toArray()

      const result = stats[0]
      return {
        total: result.total[0]?.count || 0,
        active: result.active[0]?.count || 0,
        inactive: result.inactive[0]?.count || 0,
        totalBalance: result.totalBalance[0]?.total || 0,
        highBalance: result.highBalance[0]?.count || 0
      }

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo constabilizar los elementos',error)}
    }
  }
  async emailExists(email, excludeId=null){
    try {
      if (!email) return false
      const query = { email }
      if (excludeId && ObjectId.isValid(excludeId)) {
        query._id = { $ne: new ObjectId(excludeId) }
      }
      const count = await db.collection.countDocuments(query)
      return count > 0

    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo constabilizar los elementos',error)}
    }
  }
  async rfclExists(rfc, excludeId=null){
    try {
      if(!rfc) return false
      const query = { rfc }
      if (excludeId && ObjectId.isValid(excludeId)) {
        query._id = { $ne: new ObjectId(excludeId) }
      }
      const count = await db.collection('customers').countDocuments(query)
      return count > 0
    } catch (error) {
      if(Boom.isBoom(error)){
        throw error
      }else{
      throw Boom.badImplementation('No se pudo constabilizar los elementos',error)}
    }
  }



}

export default CustomerService
