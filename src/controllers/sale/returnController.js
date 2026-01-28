import Return, { RETURN_TYPES, RETURN_STATUS } from "../../models/sale/returnModel.js";
import Sale, { SALE_STATUS } from "../../models/sale/saleModel.js";
import Product from "../../models/product/productModel.js";
import Stock from "../../models/inventory/stockModel.js";
import StockAdjustment, { ADJUSTMENT_TYPES } from "../../models/inventory/stockAdjustmentModel.js";
import Warranty, { WARRANTY_STATUS } from "../../models/warranty/warrantyModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create a return (refund)
 * POST /api/v1/returns
 * Body: { originalSaleId, items: [{ saleItemId, quantity }], reason, refundMethod }
 */
export const createReturn = catchAsync(async (req, res, next) => {
  const { originalSaleId, items, reason, refundMethod, notes } = req.body;

  // Validate required fields
  if (!originalSaleId || !items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("Original sale ID and items to return are required", 400));
  }

  if (!reason) {
    return next(new AppError("Return reason is required", 400));
  }

  // Get original sale
  const originalSale = await Sale.findById(originalSaleId);
  if (!originalSale) {
    return next(new AppError("Original sale not found", 404));
  }

  if (originalSale.status === SALE_STATUS.VOIDED) {
    return next(new AppError("Cannot return items from a voided sale", 400));
  }

  // Process return items
  const processedItems = [];
  let totalRefund = 0;

  for (const item of items) {
    // Find the item in the original sale
    const saleItem = originalSale.items.id(item.saleItemId);
    if (!saleItem) {
      return next(new AppError(`Sale item not found: ${item.saleItemId}`, 404));
    }

    // Validate quantity
    const returnQty = item.quantity || saleItem.quantity;
    if (returnQty > saleItem.quantity) {
      return next(new AppError(
        `Cannot return more than purchased. Item: ${saleItem.productName}, Purchased: ${saleItem.quantity}, Requested: ${returnQty}`,
        400
      ));
    }

    // Calculate refund for this item
    const itemRefund = (saleItem.unitPrice * returnQty) - (saleItem.discount || 0);

    processedItems.push({
      product: saleItem.product,
      productName: saleItem.productName,
      sku: saleItem.sku,
      serialNumber: saleItem.serialNumber,
      quantity: returnQty,
      unitPrice: saleItem.unitPrice,
      refundAmount: Math.round(itemRefund * 100) / 100
    });

    totalRefund += itemRefund;
  }

  // Generate return number
  const returnNumber = await Return.generateReturnNumber();

  // Create return record
  const returnRecord = await Return.create({
    returnNumber,
    originalSale: originalSaleId,
    returnType: RETURN_TYPES.REFUND,
    items: processedItems,
    totalRefund: Math.round(totalRefund * 100) / 100,
    reason,
    refundMethod: refundMethod || "CASH",
    notes,
    status: RETURN_STATUS.COMPLETED,
    createdBy: req.userId
  });

  // Restore stock for returned items
  for (const item of processedItems) {
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
      reason: `Return: ${returnNumber} - ${reason}`,
      reference: returnRecord._id.toString(),
      referenceType: "Sale",
      createdBy: req.userId
    });

    // Void any warranties for this returned product from the original sale
    await Warranty.updateMany(
      {
        sale: originalSaleId,
        product: item.product,
        status: WARRANTY_STATUS.ACTIVE
      },
      {
        $set: {
          status: WARRANTY_STATUS.VOID,
          voidedBy: req.userId,
          voidedAt: new Date(),
          voidReason: `Product returned: ${returnNumber}`
        }
      }
    );
  }

  // Populate for response
  await returnRecord.populate([
    { path: "originalSale", select: "saleNumber grandTotal" },
    { path: "createdBy", select: "username" }
  ]);

  res.status(201).json({
    status: "success",
    data: {
      return: returnRecord,
      message: `Refund of ₹${returnRecord.totalRefund} processed successfully`
    }
  });
});

/**
 * Create an exchange (return old items + buy new items)
 * POST /api/v1/returns/exchange
 * Body: {
 *   originalSaleId,
 *   returnItems: [{ saleItemId, quantity }],
 *   newItems: [{ productId, quantity, unitPrice? }],
 *   payments: [{ method, amount }],
 *   reason
 * }
 */
export const createExchange = catchAsync(async (req, res, next) => {
  const { originalSaleId, returnItems, newItems, payments, reason, customer, notes } = req.body;

  // Validate required fields
  if (!originalSaleId || !returnItems || returnItems.length === 0) {
    return next(new AppError("Original sale ID and items to return are required", 400));
  }

  if (!newItems || newItems.length === 0) {
    return next(new AppError("New items to purchase are required for exchange", 400));
  }

  if (!reason) {
    return next(new AppError("Exchange reason is required", 400));
  }

  // Get original sale
  const originalSale = await Sale.findById(originalSaleId);
  if (!originalSale) {
    return next(new AppError("Original sale not found", 404));
  }

  if (originalSale.status === SALE_STATUS.VOIDED) {
    return next(new AppError("Cannot exchange items from a voided sale", 400));
  }

  // Process return items
  const processedReturnItems = [];
  let totalRefund = 0;

  for (const item of returnItems) {
    const saleItem = originalSale.items.id(item.saleItemId);
    if (!saleItem) {
      return next(new AppError(`Sale item not found: ${item.saleItemId}`, 404));
    }

    const returnQty = item.quantity || saleItem.quantity;
    if (returnQty > saleItem.quantity) {
      return next(new AppError(
        `Cannot return more than purchased. Item: ${saleItem.productName}, Purchased: ${saleItem.quantity}`,
        400
      ));
    }

    const itemRefund = (saleItem.unitPrice * returnQty) - (saleItem.discount || 0);

    processedReturnItems.push({
      product: saleItem.product,
      productName: saleItem.productName,
      sku: saleItem.sku,
      serialNumber: saleItem.serialNumber,
      quantity: returnQty,
      unitPrice: saleItem.unitPrice,
      refundAmount: Math.round(itemRefund * 100) / 100
    });

    totalRefund += itemRefund;
  }

  // Process new items
  const processedNewItems = [];
  let newItemsTotal = 0;

  for (const item of newItems) {
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

    const unitPrice = item.unitPrice || product.sellingPrice;
    const quantity = item.quantity;
    const taxRate = product.taxRate || 0;
    const itemSubtotal = unitPrice * quantity;
    const taxAmount = itemSubtotal * (taxRate / 100);
    const itemTotal = itemSubtotal + taxAmount;

    processedNewItems.push({
      product: product._id,
      productName: product.name,
      sku: product.sku,
      serialNumber: item.serialNumber || null,
      quantity,
      unitPrice,
      taxRate,
      taxAmount: Math.round(taxAmount * 100) / 100,
      discount: 0,
      total: Math.round(itemTotal * 100) / 100
    });

    newItemsTotal += itemTotal;
  }

  // Calculate exchange amount due
  const exchangeAmountDue = Math.round((newItemsTotal - totalRefund) * 100) / 100;

  // Process payments for the difference (if amount due > 0)
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

  // Validate payment if amount is due
  if (exchangeAmountDue > 0 && amountPaid < exchangeAmountDue) {
    return next(new AppError(
      `Insufficient payment. Amount due: ₹${exchangeAmountDue}, Paid: ₹${amountPaid}`,
      400
    ));
  }

  // Calculate change
  const changeGiven = Math.max(0, amountPaid - Math.max(0, exchangeAmountDue));

  // Generate numbers
  const returnNumber = await Return.generateReturnNumber();
  const saleNumber = await Sale.generateSaleNumber();

  // Create new sale for exchange items
  const newSale = await Sale.create({
    saleNumber,
    items: processedNewItems,
    payments: processedPayments,
    customer: customer || originalSale.customer,
    subtotal: Math.round(newItemsTotal * 100) / 100,
    discountType: null,
    discountValue: 0,
    discountTotal: 0,
    taxTotal: processedNewItems.reduce((sum, item) => sum + item.taxAmount, 0),
    grandTotal: Math.round(newItemsTotal * 100) / 100,
    amountPaid,
    changeGiven: Math.round(changeGiven * 100) / 100,
    status: SALE_STATUS.COMPLETED,
    notes: `Exchange from Return: ${returnNumber}`,
    createdBy: req.userId
  });

  // Create return record
  const returnRecord = await Return.create({
    returnNumber,
    originalSale: originalSaleId,
    returnType: RETURN_TYPES.EXCHANGE,
    items: processedReturnItems,
    totalRefund: Math.round(totalRefund * 100) / 100,
    exchangeSale: newSale._id,
    exchangeAmountDue: Math.max(0, exchangeAmountDue),
    reason,
    refundMethod: exchangeAmountDue < 0 ? "CASH" : null, // Refund if new items cost less
    notes,
    status: RETURN_STATUS.COMPLETED,
    createdBy: req.userId
  });

  // Restore stock for returned items
  for (const item of processedReturnItems) {
    const stock = await Stock.getOrCreate(item.product);
    const previousQuantity = stock.quantity;
    const newQuantity = previousQuantity + item.quantity;

    stock.quantity = newQuantity;
    stock.lastUpdated = new Date();
    await stock.save();

    await StockAdjustment.create({
      product: item.product,
      type: ADJUSTMENT_TYPES.RETURN,
      quantity: item.quantity,
      previousQuantity,
      newQuantity,
      reason: `Exchange Return: ${returnNumber}`,
      reference: returnRecord._id.toString(),
      referenceType: "Sale",
      createdBy: req.userId
    });

    // Void any warranties for this returned product from the original sale
    await Warranty.updateMany(
      {
        sale: originalSaleId,
        product: item.product,
        status: WARRANTY_STATUS.ACTIVE
      },
      {
        $set: {
          status: WARRANTY_STATUS.VOID,
          voidedBy: req.userId,
          voidedAt: new Date(),
          voidReason: `Product exchanged: ${returnNumber}`
        }
      }
    );
  }

  // Deduct stock for new items
  for (const item of processedNewItems) {
    const stock = await Stock.getOrCreate(item.product);
    const previousQuantity = stock.quantity;
    const newQuantity = previousQuantity - item.quantity;

    stock.quantity = newQuantity;
    stock.lastUpdated = new Date();
    await stock.save();

    await StockAdjustment.create({
      product: item.product,
      type: ADJUSTMENT_TYPES.SALE,
      quantity: item.quantity,
      previousQuantity,
      newQuantity,
      reason: `Exchange Sale: ${saleNumber}`,
      reference: newSale._id.toString(),
      referenceType: "Sale",
      createdBy: req.userId
    });
  }

  // Populate for response
  await returnRecord.populate([
    { path: "originalSale", select: "saleNumber grandTotal" },
    { path: "exchangeSale", select: "saleNumber grandTotal" },
    { path: "createdBy", select: "username" }
  ]);

  res.status(201).json({
    status: "success",
    data: {
      return: returnRecord,
      newSale: {
        _id: newSale._id,
        saleNumber: newSale.saleNumber,
        grandTotal: newSale.grandTotal
      },
      summary: {
        returnedAmount: returnRecord.totalRefund,
        newPurchaseAmount: newSale.grandTotal,
        amountDue: Math.max(0, exchangeAmountDue),
        amountPaid,
        changeGiven,
        refundDue: exchangeAmountDue < 0 ? Math.abs(exchangeAmountDue) : 0
      }
    }
  });
});

/**
 * Get all returns
 * GET /api/v1/returns
 */
export const getReturns = catchAsync(async (req, res, next) => {
  const { returnType, status, startDate, endDate, page = 1, limit = 20 } = req.query;

  const query = {};

  if (returnType) {
    query.returnType = returnType;
  }

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

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const [returns, total] = await Promise.all([
    Return.find(query)
      .populate("originalSale", "saleNumber grandTotal")
      .populate("exchangeSale", "saleNumber grandTotal")
      .populate("createdBy", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Return.countDocuments(query)
  ]);

  res.json({
    status: "success",
    results: returns.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    data: { returns }
  });
});

/**
 * Get single return
 * GET /api/v1/returns/:id
 */
export const getReturn = catchAsync(async (req, res, next) => {
  const returnRecord = await Return.findById(req.params.id)
    .populate("originalSale")
    .populate("exchangeSale")
    .populate("createdBy", "username")
    .populate("items.product", "name sku");

  if (!returnRecord) {
    return next(new AppError("Return not found", 404));
  }

  res.json({
    status: "success",
    data: { return: returnRecord }
  });
});
