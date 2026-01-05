import Stock from "../../models/inventory/stockModel.js";
import StockAdjustment, { ADJUSTMENT_TYPES } from "../../models/inventory/stockAdjustmentModel.js";
import Product from "../../models/product/productModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Get all stock levels
 * GET /api/v1/inventory
 * Query params:
 *   - category: Filter by category ID
 *   - lowStock: "true" to show only low stock items
 *   - page, limit: Pagination
 */
export const getStock = catchAsync(async (req, res, next) => {
  const { category, lowStock, page = 1, limit = 50 } = req.query;

  // If lowStock filter is requested, use the dedicated method
  if (lowStock === "true") {
    const lowStockItems = await Stock.getLowStock();
    return res.json({
      status: "success",
      results: lowStockItems.length,
      data: { stock: lowStockItems }
    });
  }

  // Build product query for filtering
  const productQuery = { isActive: true };
  if (category) {
    productQuery.category = category;
  }

  const products = await Product.find(productQuery).select("_id name sku category minStockLevel costPrice sellingPrice");
  const productIds = products.map(p => p._id);

  // Pagination
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 50;
  const skip = (pageNum - 1) * limitNum;

  // Get stock records for these products
  const stockRecords = await Stock.find({ product: { $in: productIds } })
    .populate("product", "name sku category minStockLevel costPrice sellingPrice")
    .skip(skip)
    .limit(limitNum);

  // Create a map for quick lookup
  const stockMap = new Map(stockRecords.map(s => [s.product._id.toString(), s]));

  // Build response with all products (even those without stock records)
  const stockData = products.slice(skip, skip + limitNum).map(product => {
    const stock = stockMap.get(product._id.toString());
    return {
      product: {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        minStockLevel: product.minStockLevel
      },
      quantity: stock ? stock.quantity : 0,
      lastUpdated: stock ? stock.lastUpdated : null,
      isLowStock: (stock ? stock.quantity : 0) <= product.minStockLevel,
      stockValue: {
        cost: (stock ? stock.quantity : 0) * product.costPrice,
        retail: (stock ? stock.quantity : 0) * product.sellingPrice
      }
    };
  });

  res.json({
    status: "success",
    results: stockData.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: products.length,
      pages: Math.ceil(products.length / limitNum)
    },
    data: { stock: stockData }
  });
});

/**
 * Get stock for a single product
 * GET /api/v1/inventory/:productId
 */
export const getProductStock = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.params.productId)
    .select("name sku category minStockLevel costPrice sellingPrice");

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  const stock = await Stock.findOne({ product: req.params.productId });
  const quantity = stock ? stock.quantity : 0;

  res.json({
    status: "success",
    data: {
      product: {
        _id: product._id,
        name: product.name,
        sku: product.sku,
        minStockLevel: product.minStockLevel
      },
      quantity,
      lastUpdated: stock ? stock.lastUpdated : null,
      isLowStock: quantity <= product.minStockLevel,
      stockValue: {
        cost: quantity * product.costPrice,
        retail: quantity * product.sellingPrice
      }
    }
  });
});

/**
 * Adjust stock (add or reduce)
 * POST /api/v1/inventory/adjust
 * Body: { productId, type, quantity, reason }
 */
export const adjustStock = catchAsync(async (req, res, next) => {
  const { productId, type, quantity, reason, reference, referenceType } = req.body;

  // Validate required fields
  if (!productId || !type || !quantity) {
    return next(new AppError("Product ID, type, and quantity are required", 400));
  }

  // Validate type
  if (!Object.values(ADJUSTMENT_TYPES).includes(type)) {
    return next(new AppError(`Invalid adjustment type. Valid types: ${Object.values(ADJUSTMENT_TYPES).join(", ")}`, 400));
  }

  // Validate quantity
  if (quantity <= 0) {
    return next(new AppError("Quantity must be a positive number", 400));
  }

  // Check product exists
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  // Get or create stock record
  const stock = await Stock.getOrCreate(productId);
  const previousQuantity = stock.quantity;

  // Determine if this is an addition or reduction
  const isAddition = ["ADDITION", "PURCHASE", "RETURN", "TRANSFER_IN", "CORRECTION"].includes(type);
  
  // For CORRECTION type, we need to determine direction from the data
  let newQuantity;
  if (type === "CORRECTION") {
    // For corrections, quantity can be the target quantity or a delta
    // We'll treat it as a delta - positive adds, handled by isAddition check
    newQuantity = isAddition ? previousQuantity + quantity : previousQuantity - quantity;
  } else {
    newQuantity = isAddition ? previousQuantity + quantity : previousQuantity - quantity;
  }

  // Check for negative stock
  if (newQuantity < 0) {
    return next(new AppError(`Insufficient stock. Current: ${previousQuantity}, Requested reduction: ${quantity}`, 400));
  }

  // Update stock
  stock.quantity = newQuantity;
  stock.lastUpdated = new Date();
  await stock.save();

  // Create adjustment record
  const adjustment = await StockAdjustment.create({
    product: productId,
    type,
    quantity,
    previousQuantity,
    newQuantity,
    reason,
    reference,
    referenceType: referenceType || "Manual",
    createdBy: req.userId
  });

  await adjustment.populate("createdBy", "username");

  res.status(201).json({
    status: "success",
    data: {
      stock: {
        product: {
          _id: product._id,
          name: product.name,
          sku: product.sku
        },
        previousQuantity,
        newQuantity,
        change: newQuantity - previousQuantity
      },
      adjustment: {
        _id: adjustment._id,
        type: adjustment.type,
        quantity: adjustment.quantity,
        reason: adjustment.reason,
        createdBy: adjustment.createdBy,
        createdAt: adjustment.createdAt
      }
    }
  });
});

/**
 * Get low stock products
 * GET /api/v1/inventory/low-stock
 */
export const getLowStock = catchAsync(async (req, res, next) => {
  const lowStockItems = await Stock.getLowStock();

  res.json({
    status: "success",
    results: lowStockItems.length,
    data: { items: lowStockItems }
  });
});

/**
 * Get stock adjustment history for a product
 * GET /api/v1/inventory/:productId/history
 */
export const getStockHistory = catchAsync(async (req, res, next) => {
  const { type, startDate, endDate, page = 1, limit = 20 } = req.query;

  const product = await Product.findById(req.params.productId).select("name sku");
  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  const result = await StockAdjustment.getHistory(req.params.productId, {
    type,
    startDate,
    endDate,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10)
  });

  res.json({
    status: "success",
    product: {
      _id: product._id,
      name: product.name,
      sku: product.sku
    },
    ...result
  });
});

/**
 * Get total inventory value
 * GET /api/v1/inventory/value
 */
export const getInventoryValue = catchAsync(async (req, res, next) => {
  const { category } = req.query;

  // Build product filter
  const productQuery = { isActive: true };
  if (category) {
    productQuery.category = category;
  }

  const products = await Product.find(productQuery).select("_id costPrice sellingPrice");
  const productIds = products.map(p => p._id);

  // Get all stock records
  const stockRecords = await Stock.find({ product: { $in: productIds } });

  // Create lookup map
  const productMap = new Map(products.map(p => [p._id.toString(), p]));

  // Calculate totals
  let totalCostValue = 0;
  let totalRetailValue = 0;
  let totalItems = 0;

  for (const stock of stockRecords) {
    const product = productMap.get(stock.product.toString());
    if (product && stock.quantity > 0) {
      totalCostValue += stock.quantity * product.costPrice;
      totalRetailValue += stock.quantity * product.sellingPrice;
      totalItems += stock.quantity;
    }
  }

  res.json({
    status: "success",
    data: {
      totalProducts: products.length,
      totalItems,
      costValue: Math.round(totalCostValue * 100) / 100,
      retailValue: Math.round(totalRetailValue * 100) / 100,
      potentialProfit: Math.round((totalRetailValue - totalCostValue) * 100) / 100
    }
  });
});

/**
 * Get adjustment types (for frontend dropdown)
 * GET /api/v1/inventory/adjustment-types
 */
export const getAdjustmentTypes = catchAsync(async (req, res, next) => {
  res.json({
    status: "success",
    data: {
      types: Object.entries(ADJUSTMENT_TYPES).map(([key, value]) => ({
        key,
        value,
        direction: ["ADDITION", "PURCHASE", "RETURN", "TRANSFER_IN"].includes(value) ? "IN" : "OUT"
      }))
    }
  });
});
