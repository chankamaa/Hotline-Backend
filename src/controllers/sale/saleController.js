import Sale, { SALE_STATUS, DISCOUNT_TYPES } from "../../models/sale/saleModel.js";
import Product from "../../models/product/productModel.js";
import Stock from "../../models/inventory/stockModel.js";
import StockAdjustment, { ADJUSTMENT_TYPES } from "../../models/inventory/stockAdjustmentModel.js";
import Warranty from "../../models/warranty/warrantyModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create new sale
 * POST /api/v1/sales
 */
export const createSale = catchAsync(async (req, res, next) => {
  const {
    items,
    payments,
    discountType,
    discountValue,
    customer,
    notes
  } = req.body;

  // Validate items
  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("Sale must have at least one item", 400));
  }

  // Process items and validate stock
  const processedItems = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of items) {
    // Get product
    const product = await Product.findById(item.productId);
    if (!product) {
      return next(new AppError(`Product not found: ${item.productId}`, 404));
    }
    if (!product.isActive) {
      return next(new AppError(`Product is not available: ${product.name}`, 400));
    }

    // Check stock
    const stock = await Stock.findOne({ product: item.productId });
    const currentQty = stock ? stock.quantity : 0;

    if (currentQty < item.quantity) {
      return next(new AppError(
        `Insufficient stock for ${product.name}. Available: ${currentQty}, Requested: ${item.quantity}`,
        400
      ));
    }

    // Calculate item totals
    const unitPrice = item.unitPrice || product.sellingPrice;
    const quantity = item.quantity;
    const taxRate = product.taxRate || 0;
    const itemDiscount = item.discount || 0;

    const itemSubtotal = unitPrice * quantity;
    const taxAmount = (itemSubtotal - itemDiscount) * (taxRate / 100);
    const itemTotal = itemSubtotal - itemDiscount + taxAmount;

    processedItems.push({
      product: product._id,
      productName: product.name,
      sku: product.sku,
      serialNumber: item.serialNumber || null,
      quantity,
      unitPrice,
      taxRate,
      taxAmount: Math.round(taxAmount * 100) / 100,
      discount: itemDiscount,
      total: Math.round(itemTotal * 100) / 100
    });

    subtotal += itemSubtotal;
    taxTotal += taxAmount;
  }

  // Calculate discount
  let discountTotal = 0;
  if (discountType && discountValue > 0) {
    if (discountType === DISCOUNT_TYPES.PERCENTAGE) {
      discountTotal = (subtotal * discountValue) / 100;
    } else if (discountType === DISCOUNT_TYPES.FIXED) {
      discountTotal = discountValue;
    }
  }

  // Calculate grand total
  const grandTotal = Math.round((subtotal - discountTotal + taxTotal) * 100) / 100;

  // Process payments
  let amountPaid = 0;
  const processedPayments = [];

  if (payments && Array.isArray(payments)) {
    for (const payment of payments) {
      if (payment.amount > 0) {
        processedPayments.push({
          method: payment.method || "CASH",
          amount: payment.amount,
          reference: payment.reference || null
        });
        amountPaid += payment.amount;
      }
    }
  }

  // Calculate change
  const changeGiven = Math.max(0, amountPaid - grandTotal);

  // Generate sale number
  const saleNumber = await Sale.generateSaleNumber();

  // Create sale
  const sale = await Sale.create({
    saleNumber,
    items: processedItems,
    payments: processedPayments,
    customer: customer ? {
      name: customer.name || null,
      phone: customer.phone || null,
      email: customer.email || null
    } : null,
    subtotal: Math.round(subtotal * 100) / 100,
    discountType: discountType || null,
    discountValue: discountValue || 0,
    discountTotal: Math.round(discountTotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    grandTotal,
    amountPaid,
    changeGiven: Math.round(changeGiven * 100) / 100,
    status: SALE_STATUS.COMPLETED,
    notes,
    createdBy: req.userId
  });

  // Deduct inventory for each item
  for (const item of processedItems) {
    const stock = await Stock.getOrCreate(item.product);
    const previousQuantity = stock.quantity;
    const newQuantity = previousQuantity - item.quantity;

    stock.quantity = newQuantity;
    stock.lastUpdated = new Date();
    await stock.save();

    // Create stock adjustment record
    await StockAdjustment.create({
      product: item.product,
      type: ADJUSTMENT_TYPES.SALE,
      quantity: item.quantity,
      previousQuantity,
      newQuantity,
      reason: `Sale: ${saleNumber}`,
      reference: sale._id.toString(),
      referenceType: "Sale",
      createdBy: req.userId
    });
  }

  // Auto-create warranties for products with warranty duration (if customer info provided)
  const createdWarranties = [];
  if (customer && customer.phone && customer.name) {
    for (const item of processedItems) {
      const product = await Product.findById(item.product);
      if (product && product.warrantyDuration > 0) {
        // Create warranty for each unit sold
        for (let i = 0; i < item.quantity; i++) {
          const warrantyNumber = await Warranty.generateWarrantyNumber();
          const startDate = new Date();
          const endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + product.warrantyDuration);

          const warranty = await Warranty.create({
            warrantyNumber,
            sourceType: "SALE",
            sale: sale._id,
            product: product._id,
            productName: product.name,
            serialNumber: item.serialNumber || null,
            customer: {
              name: customer.name,
              phone: customer.phone,
              email: customer.email || null
            },
            warrantyType: product.warrantyType || "SHOP",
            durationMonths: product.warrantyDuration,
            startDate,
            endDate,
            status: "ACTIVE",
            createdBy: req.userId
          });
          createdWarranties.push(warranty.warrantyNumber);
        }
      }
    }
  }

  // Populate for response
  await sale.populate("createdBy", "username");

  res.status(201).json({
    status: "success",
    data: {
      sale,
      warrantiesCreated: createdWarranties.length,
      warranties: createdWarranties
    }
  });
});

/**
 * Get all sales with filters
 * GET /api/v1/sales
 */
export const getSales = catchAsync(async (req, res, next) => {
  const {
    status,
    startDate,
    endDate,
    createdBy,
    page = 1,
    limit = 20
  } = req.query;

  // Build query
  const query = {};

  if (status) {
    query.status = status;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  if (createdBy) {
    query.createdBy = createdBy;
  }

  // Pagination
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const [sales, total] = await Promise.all([
    Sale.find(query)
      .populate("createdBy", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Sale.countDocuments(query)
  ]);

  res.json({
    status: "success",
    results: sales.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    data: { sales }
  });
});

/**
 * Get single sale
 * GET /api/v1/sales/:id
 */
export const getSale = catchAsync(async (req, res, next) => {
  const sale = await Sale.findById(req.params.id)
    .populate("createdBy", "username")
    .populate("voidedBy", "username")
    .populate("items.product", "name sku image");

  if (!sale) {
    return next(new AppError("Sale not found", 404));
  }

  res.json({
    status: "success",
    data: { sale }
  });
});

/**
 * Get sale by sale number
 * GET /api/v1/sales/number/:saleNumber
 */
export const getSaleByNumber = catchAsync(async (req, res, next) => {
  const sale = await Sale.findOne({ saleNumber: req.params.saleNumber })
    .populate("createdBy", "username")
    .populate("voidedBy", "username");

  if (!sale) {
    return next(new AppError("Sale not found", 404));
  }

  res.json({
    status: "success",
    data: { sale }
  });
});

/**
 * Void a sale
 * POST /api/v1/sales/:id/void
 */
export const voidSale = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason) {
    return next(new AppError("Void reason is required", 400));
  }

  const sale = await Sale.findById(req.params.id);

  if (!sale) {
    return next(new AppError("Sale not found", 404));
  }

  if (sale.status === SALE_STATUS.VOIDED) {
    return next(new AppError("Sale is already voided", 400));
  }

  // Restore inventory
  for (const item of sale.items) {
    const stock = await Stock.getOrCreate(item.product);
    const previousQuantity = stock.quantity;
    const newQuantity = previousQuantity + item.quantity;

    stock.quantity = newQuantity;
    stock.lastUpdated = new Date();
    await stock.save();

    // Create stock adjustment record
    await StockAdjustment.create({
      product: item.product,
      type: ADJUSTMENT_TYPES.RETURN,
      quantity: item.quantity,
      previousQuantity,
      newQuantity,
      reason: `Void Sale: ${sale.saleNumber} - ${reason}`,
      reference: sale._id.toString(),
      referenceType: "Sale",
      createdBy: req.userId
    });
  }

  // Update sale status
  sale.status = SALE_STATUS.VOIDED;
  sale.voidedBy = req.userId;
  sale.voidedAt = new Date();
  sale.voidReason = reason;
  await sale.save();

  await sale.populate("voidedBy", "username");

  res.json({
    status: "success",
    message: "Sale voided successfully",
    data: { sale }
  });
});

/**
 * Get daily summary
 * GET /api/v1/sales/daily
 */
export const getDailySummary = catchAsync(async (req, res, next) => {
  const { date } = req.query;

  const targetDate = date ? new Date(date) : new Date();
  const summary = await Sale.getDailySummary(targetDate);

  res.json({
    status: "success",
    data: { summary }
  });
});

/**
 * Get sales by date range
 * GET /api/v1/sales/report
 */
export const getSalesReport = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate) {
    return next(new AppError("Start date and end date are required", 400));
  }

  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
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
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: "$grandTotal" },
        totalDiscount: { $sum: "$discountTotal" },
        totalTax: { $sum: "$taxTotal" }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Calculate totals
  const totals = result.reduce((acc, day) => ({
    totalSales: acc.totalSales + day.totalSales,
    totalRevenue: acc.totalRevenue + day.totalRevenue,
    totalDiscount: acc.totalDiscount + day.totalDiscount,
    totalTax: acc.totalTax + day.totalTax
  }), { totalSales: 0, totalRevenue: 0, totalDiscount: 0, totalTax: 0 });

  res.json({
    status: "success",
    data: {
      startDate: startDate,
      endDate: endDate,
      dailyBreakdown: result,
      totals
    }
  });
});
