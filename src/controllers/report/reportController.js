import Sale, { SALE_STATUS } from "../../models/sale/saleModel.js";
import Return, { RETURN_STATUS } from "../../models/sale/returnModel.js";
import Product from "../../models/product/productModel.js";
import Warranty from "../../models/warranty/warrantyModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Get sales summary by period
 * GET /api/v1/reports/sales-summary
 * Query: period=daily|weekly|monthly|yearly, date=YYYY-MM-DD
 */
export const getSalesSummary = catchAsync(async (req, res, next) => {
  const { period = "daily", date } = req.query;

  const targetDate = date ? new Date(date) : new Date();
  let startDate, endDate, periodLabel;

  switch (period) {
    case "weekly": {
      // Start of week (Monday)
      startDate = new Date(targetDate);
      const day = startDate.getDay();
      const diff = startDate.getDate() - day + (day === 0 ? -6 : 1);
      startDate.setDate(diff);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = `Week of ${startDate.toISOString().slice(0, 10)}`;
      break;
    }

    case "monthly":
      startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59, 999);
      periodLabel = targetDate.toLocaleString("default", { month: "long", year: "numeric" });
      break;

    case "yearly":
      startDate = new Date(targetDate.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate = new Date(targetDate.getFullYear(), 11, 31, 23, 59, 59, 999);
      periodLabel = `Year ${targetDate.getFullYear()}`;
      break;

    default: // daily
      startDate = new Date(targetDate);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(targetDate);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = targetDate.toISOString().slice(0, 10);
  }

  // Aggregate sales data
  const salesData = await Sale.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: SALE_STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: "$grandTotal" },
        totalDiscount: { $sum: "$discountTotal" },
        totalTax: { $sum: "$taxTotal" },
        avgSaleValue: { $avg: "$grandTotal" },
        totalItems: {
          $sum: {
            $reduce: {
              input: "$items",
              initialValue: 0,
              in: { $add: ["$$value", "$$this.quantity"] }
            }
          }
        }
      }
    }
  ]);

  // Payment method breakdown
  const paymentBreakdown = await Sale.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: SALE_STATUS.COMPLETED
      }
    },
    { $unwind: "$payments" },
    {
      $group: {
        _id: "$payments.method",
        total: { $sum: "$payments.amount" },
        count: { $sum: 1 }
      }
    }
  ]);

  // Voided sales count
  const voidedCount = await Sale.countDocuments({
    createdAt: { $gte: startDate, $lte: endDate },
    status: SALE_STATUS.VOIDED
  });

  const summary = salesData[0] || {
    totalSales: 0,
    totalRevenue: 0,
    totalDiscount: 0,
    totalTax: 0,
    avgSaleValue: 0,
    totalItems: 0
  };

  res.json({
    status: "success",
    data: {
      period,
      periodLabel,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      ...summary,
      avgSaleValue: Math.round((summary.avgSaleValue || 0) * 100) / 100,
      voidedSales: voidedCount,
      paymentBreakdown: paymentBreakdown.map(p => ({
        method: p._id,
        total: Math.round(p.total * 100) / 100,
        count: p.count
      }))
    }
  });
});

/**
 * Get profit report
 * GET /api/v1/reports/profit
 * Query: startDate, endDate
 * 
 * Includes warranty losses broken down by resolution type
 */
export const getProfitReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new AppError("Start date and end date are required", 400));
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Get sales with items populated
  const sales = await Sale.find({
    createdAt: { $gte: start, $lte: end },
    status: SALE_STATUS.COMPLETED
  });

  let totalRevenue = 0;
  let totalCost = 0;
  const productProfits = new Map();

  for (const sale of sales) {
    for (const item of sale.items) {
      const product = await Product.findById(item.product);
      if (product) {
        const itemRevenue = item.total;
        const itemCost = product.costPrice * item.quantity;
        const itemProfit = itemRevenue - itemCost;

        totalRevenue += itemRevenue;
        totalCost += itemCost;

        // Track by product
        const current = productProfits.get(product._id.toString()) || {
          name: product.name,
          sku: product.sku,
          revenue: 0,
          cost: 0,
          profit: 0,
          quantity: 0
        };
        current.revenue += itemRevenue;
        current.cost += itemCost;
        current.profit += itemProfit;
        current.quantity += item.quantity;
        productProfits.set(product._id.toString(), current);
      }
    }
  }

  const grossProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Get warranty losses - aggregate claims within date range
  const warrantyLosses = await Warranty.aggregate([
    { $unwind: "$claims" },
    {
      $match: {
        "claims.claimDate": { $gte: start, $lte: end },
        "claims.claimCost": { $gt: 0 }
      }
    },
    {
      $group: {
        _id: "$claims.resolution",
        count: { $sum: 1 },
        totalCost: { $sum: "$claims.claimCost" }
      }
    }
  ]);

  // Calculate total warranty cost
  const totalWarrantyCost = warrantyLosses.reduce((sum, loss) => sum + (loss.totalCost || 0), 0);
  const totalWarrantyClaims = warrantyLosses.reduce((sum, loss) => sum + loss.count, 0);

  // Format warranty losses by resolution
  const warrantyLossByType = warrantyLosses.reduce((acc, loss) => {
    acc[loss._id || "PENDING"] = {
      count: loss.count,
      cost: Math.round(loss.totalCost * 100) / 100
    };
    return acc;
  }, {});

  // Calculate net profit (after warranty losses)
  const netProfit = grossProfit - totalWarrantyCost;

  // Top profitable products
  const topProducts = Array.from(productProfits.values())
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10)
    .map(p => ({
      ...p,
      revenue: Math.round(p.revenue * 100) / 100,
      cost: Math.round(p.cost * 100) / 100,
      profit: Math.round(p.profit * 100) / 100,
      margin: p.revenue > 0 ? Math.round((p.profit / p.revenue) * 10000) / 100 : 0
    }));

  res.json({
    status: "success",
    data: {
      startDate,
      endDate,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      grossProfit: Math.round(grossProfit * 100) / 100,
      profitMargin: Math.round(profitMargin * 100) / 100,
      // Warranty losses section
      warrantyLosses: {
        totalClaims: totalWarrantyClaims,
        totalCost: Math.round(totalWarrantyCost * 100) / 100,
        byResolution: warrantyLossByType
      },
      // Net profit after warranty losses
      netProfit: Math.round(netProfit * 100) / 100,
      netProfitMargin: totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0,
      topProfitableProducts: topProducts
    }
  });
});

/**
 * Get sales by category
 * GET /api/v1/reports/by-category
 */
export const getSalesByCategory = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  const sales = await Sale.find({
    createdAt: { $gte: start, $lte: end },
    status: SALE_STATUS.COMPLETED
  });

  const categoryStats = new Map();

  for (const sale of sales) {
    for (const item of sale.items) {
      const product = await Product.findById(item.product).populate("category", "name");
      if (product && product.category) {
        const catId = product.category._id.toString();
        const current = categoryStats.get(catId) || {
          name: product.category.name,
          totalSales: 0,
          totalRevenue: 0,
          itemsSold: 0
        };
        current.totalSales += 1;
        current.totalRevenue += item.total;
        current.itemsSold += item.quantity;
        categoryStats.set(catId, current);
      }
    }
  }

  const categories = Array.from(categoryStats.values())
    .sort((a, b) => b.totalRevenue - a.totalRevenue)
    .map(c => ({
      ...c,
      totalRevenue: Math.round(c.totalRevenue * 100) / 100
    }));

  res.json({
    status: "success",
    data: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      categories
    }
  });
});

/**
 * Get sales by cashier
 * GET /api/v1/reports/by-cashier
 */
export const getSalesByCashier = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  const result = await Sale.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: SALE_STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: "$createdBy",
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: "$grandTotal" },
        avgSaleValue: { $avg: "$grandTotal" }
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    {
      $project: {
        _id: 1,
        username: "$user.username",
        totalSales: 1,
        totalRevenue: { $round: ["$totalRevenue", 2] },
        avgSaleValue: { $round: ["$avgSaleValue", 2] }
      }
    },
    { $sort: { totalRevenue: -1 } }
  ]);

  res.json({
    status: "success",
    data: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      cashiers: result
    }
  });
});

/**
 * Get top selling products
 * GET /api/v1/reports/top-products
 */
export const getTopProducts = catchAsync(async (req, res, next) => {
  const { startDate, endDate, limit = 10 } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  const result = await Sale.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: SALE_STATUS.COMPLETED
      }
    },
    { $unwind: "$items" },
    {
      $group: {
        _id: "$items.product",
        productName: { $first: "$items.productName" },
        sku: { $first: "$items.sku" },
        totalQuantity: { $sum: "$items.quantity" },
        totalRevenue: { $sum: "$items.total" },
        salesCount: { $sum: 1 }
      }
    },
    { $sort: { totalQuantity: -1 } },
    { $limit: parseInt(limit, 10) },
    {
      $project: {
        productId: "$_id",
        productName: 1,
        sku: 1,
        totalQuantity: 1,
        totalRevenue: { $round: ["$totalRevenue", 2] },
        salesCount: 1
      }
    }
  ]);

  res.json({
    status: "success",
    data: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      topProducts: result
    }
  });
});

/**
 * Get return analytics
 * GET /api/v1/reports/returns
 */
export const getReturnAnalytics = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  const start = startDate ? new Date(startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
  start.setHours(0, 0, 0, 0);
  const end = endDate ? new Date(endDate) : new Date();
  end.setHours(23, 59, 59, 999);

  // Summary by type
  const byType = await Return.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: RETURN_STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: "$returnType",
        count: { $sum: 1 },
        totalRefund: { $sum: "$totalRefund" }
      }
    }
  ]);

  // Total returns
  const totalReturns = await Return.countDocuments({
    createdAt: { $gte: start, $lte: end },
    status: RETURN_STATUS.COMPLETED
  });

  // Total refund amount
  const totalRefundResult = await Return.aggregate([
    {
      $match: {
        createdAt: { $gte: start, $lte: end },
        status: RETURN_STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: "$totalRefund" }
      }
    }
  ]);

  // Recent returns
  const recentReturns = await Return.find({
    createdAt: { $gte: start, $lte: end }
  })
    .populate("originalSale", "saleNumber")
    .populate("createdBy", "username")
    .sort({ createdAt: -1 })
    .limit(10);

  res.json({
    status: "success",
    data: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      totalReturns,
      totalRefundAmount: totalRefundResult[0]?.total || 0,
      byType: byType.map(t => ({
        type: t._id,
        count: t.count,
        totalRefund: Math.round(t.totalRefund * 100) / 100
      })),
      recentReturns: recentReturns.map(r => ({
        returnNumber: r.returnNumber,
        originalSale: r.originalSale?.saleNumber,
        returnType: r.returnType,
        totalRefund: r.totalRefund,
        reason: r.reason,
        createdBy: r.createdBy?.username,
        createdAt: r.createdAt
      }))
    }
  });
});
