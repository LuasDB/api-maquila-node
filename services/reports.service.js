import { ObjectId } from "mongodb"
import { db } from "./../db/mongoClient.js"
import Boom from "@hapi/boom"

class ReportsService {
  constructor() {
    this.salesCollection = "sales"
    this.paymentsCollection = "payments"
    this.productionCollection = "production_rolls"
  }

  // Reporte de ventas por periodo
  async getSalesReport(filters = {}) {
    try {
      const salesCol = db.collection(this.salesCollection)
      const paymentsCol = db.collection(this.paymentsCollection)

      const matchStage = {}
      if (filters.startDate || filters.endDate) {
        matchStage.date = {}
        if (filters.startDate) matchStage.date.$gte = new Date(filters.startDate)
        if (filters.endDate) {
          const end = new Date(filters.endDate)
          end.setHours(23, 59, 59, 999)
          matchStage.date.$lte = end
        }
      }

      // Aggregation principal de ventas
      const salesStats = await salesCol.aggregate([
        { $match: matchStage },
        {
          $facet: {
            // Totales generales
            general: [{
              $group: {
                _id: null,
                totalSales: { $sum: 1 },
                totalAmount: { $sum: "$total" },
                totalSubtotal: { $sum: "$subtotal" },
                totalTax: { $sum: "$tax" },
                totalPaid: { $sum: "$amountPaid" },
                totalBalance: { $sum: "$balance" }
              }
            }],

            // Por tipo de pago
            byPaymentType: [{
              $group: {
                _id: "$paymentType",
                count: { $sum: 1 },
                total: { $sum: "$total" },
                paid: { $sum: "$amountPaid" },
                balance: { $sum: "$balance" }
              }
            }],

            // Por estado
            byStatus: [{
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                total: { $sum: "$total" }
              }
            }],

            // Por producto (desglose de items)
            byProduct: [
              { $unwind: "$items" },
              {
                $group: {
                  _id: "$items.description",
                  quantity: { $sum: "$items.quantity" },
                  totalRevenue: { $sum: "$items.total" },
                  avgPrice: { $avg: "$items.unitPrice" }
                }
              },
              { $sort: { totalRevenue: -1 } },
              { $limit: 20 }
            ],

            // Por cliente
            byCustomer: [{
              $group: {
                _id: "$customerId",
                customerName: { $first: "$customerName" },
                count: { $sum: 1 },
                total: { $sum: "$total" },
                paid: { $sum: "$amountPaid" },
                balance: { $sum: "$balance" }
              }
            }, { $sort: { total: -1 } }, { $limit: 20 }],

            // Ventas por cobrar (credito con saldo pendiente)
            receivables: [
              { $match: { paymentType: "credit", balance: { $gt: 0 } } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  totalReceivable: { $sum: "$balance" }
                }
              }
            ],

            // Ventas vencidas
            overdue: [
              { $match: { balance: { $gt: 0 }, dueDate: { $lt: new Date() } } },
              {
                $group: {
                  _id: null,
                  count: { $sum: 1 },
                  totalOverdue: { $sum: "$balance" }
                }
              }
            ]
          }
        }
      ]).toArray()

      // Pagos recuperados en el periodo
      const paymentMatch = {}
      if (filters.startDate || filters.endDate) {
        paymentMatch.paymentDate = {}
        if (filters.startDate) paymentMatch.paymentDate.$gte = new Date(filters.startDate)
        if (filters.endDate) {
          const end = new Date(filters.endDate)
          end.setHours(23, 59, 59, 999)
          paymentMatch.paymentDate.$lte = end
        }
      }

      const paymentsStats = await paymentsCol.aggregate([
        { $match: paymentMatch },
        {
          $facet: {
            general: [{
              $group: {
                _id: null,
                totalPayments: { $sum: 1 },
                totalCollected: { $sum: "$amount" }
              }
            }],
            byMethod: [{
              $group: {
                _id: "$paymentMethod",
                count: { $sum: 1 },
                total: { $sum: "$amount" }
              }
            }]
          }
        }
      ]).toArray()

      const sr = salesStats[0]
      const pr = paymentsStats[0]
      const general = sr.general[0] || {}

      return {
        period: { startDate: filters.startDate || null, endDate: filters.endDate || null },
        sales: {
          totalSales: general.totalSales || 0,
          totalAmount: general.totalAmount || 0,
          totalSubtotal: general.totalSubtotal || 0,
          totalTax: general.totalTax || 0,
          totalPaid: general.totalPaid || 0,
          totalBalance: general.totalBalance || 0
        },
        byPaymentType: sr.byPaymentType || [],
        byStatus: sr.byStatus || [],
        byProduct: sr.byProduct || [],
        byCustomer: sr.byCustomer || [],
        receivables: {
          count: sr.receivables[0]?.count || 0,
          totalReceivable: sr.receivables[0]?.totalReceivable || 0
        },
        overdue: {
          count: sr.overdue[0]?.count || 0,
          totalOverdue: sr.overdue[0]?.totalOverdue || 0
        },
        collections: {
          totalPayments: pr.general[0]?.totalPayments || 0,
          totalCollected: pr.general[0]?.totalCollected || 0,
          byMethod: pr.byMethod || []
        }
      }
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal("Error al generar reporte de ventas: " + error.message)
    }
  }

  // Reporte de produccion/maquila por periodo
  async getProductionReport(filters = {}) {
    try {
      const col = db.collection(this.productionCollection)

      const matchStage = {}
      if (filters.startDate || filters.endDate) {
        matchStage.createdAt = {}
        if (filters.startDate) matchStage.createdAt.$gte = new Date(filters.startDate)
        if (filters.endDate) {
          const end = new Date(filters.endDate)
          end.setHours(23, 59, 59, 999)
          matchStage.createdAt.$lte = end
        }
      }

      const stats = await col.aggregate([
        { $match: matchStage },
        {
          $facet: {
            general: [{
              $group: {
                _id: null,
                totalRolls: { $sum: 1 },
                totalInvested: { $sum: "$summary.totalInvested" },
                totalPieces: { $sum: "$summary.totalPieces" },
                totalPiecesLost: { $sum: "$summary.piecesLost" },
                avgCostPerPiece: { $avg: { $cond: [{ $gt: ["$summary.totalPieces", 0] }, "$summary.costPerPiece", null] } }
              }
            }],
            byStatus: [{
              $group: {
                _id: "$summary.currentStatus",
                count: { $sum: 1 }
              }
            }],
            byProduct: [{
              $group: {
                _id: { $ifNull: ["$cutting.productName", "$cutting.productType"] },
                count: { $sum: 1 },
                totalPieces: { $sum: "$summary.totalPieces" },
                totalInvested: { $sum: "$summary.totalInvested" },
                piecesLost: { $sum: "$summary.piecesLost" }
              }
            }, { $sort: { count: -1 } }],
            costBreakdown: [{
              $group: {
                _id: null,
                fabricCost: { $sum: "$fabric.cost" },
                cuttingCost: { $sum: { $ifNull: ["$cutting.cutterCost", 0] } },
                sewingCost: { $sum: "$sewing.totalCost" },
                laundryCost: { $sum: "$laundry.totalCost" },
                finishingCost: { $sum: "$finishing.totalCost" }
              }
            }]
          }
        }
      ]).toArray()

      const r = stats[0]
      const general = r.general[0] || {}
      const costs = r.costBreakdown[0] || {}

      return {
        period: { startDate: filters.startDate || null, endDate: filters.endDate || null },
        general: {
          totalRolls: general.totalRolls || 0,
          totalInvested: general.totalInvested || 0,
          totalPieces: general.totalPieces || 0,
          totalPiecesLost: general.totalPiecesLost || 0,
          avgCostPerPiece: general.avgCostPerPiece || 0
        },
        byStatus: r.byStatus || [],
        byProduct: r.byProduct || [],
        costBreakdown: {
          fabric: costs.fabricCost || 0,
          cutting: costs.cuttingCost || 0,
          sewing: costs.sewingCost || 0,
          laundry: costs.laundryCost || 0,
          finishing: costs.finishingCost || 0
        }
      }
    } catch (error) {
      if (Boom.isBoom(error)) throw error
      throw Boom.internal("Error al generar reporte de produccion: " + error.message)
    }
  }
}

export default ReportsService