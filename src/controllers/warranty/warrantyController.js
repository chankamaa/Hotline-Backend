import Warranty, { WARRANTY_STATUS, WARRANTY_TYPES, CLAIM_RESOLUTIONS } from "../../models/warranty/warrantyModel.js";
import Product from "../../models/product/productModel.js";
import RepairJob, { REPAIR_STATUS, DEVICE_TYPES } from "../../models/repair/repairJobModel.js";
import Stock from "../../models/inventory/stockModel.js";
import StockAdjustment, { ADJUSTMENT_TYPES } from "../../models/inventory/stockAdjustmentModel.js";
import Return, { RETURN_TYPES, RETURN_STATUS } from "../../models/sale/returnModel.js";
import Sale from "../../models/sale/saleModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create new warranty (manual creation)
 * POST /api/v1/warranties
 */
export const createWarranty = catchAsync(async (req, res, next) => {
  const {
    productId,
    customer,
    warrantyType,
    durationMonths,
    serialNumber,
    startDate,
    notes
  } = req.body;

  // Validate required fields
  if (!productId || !customer || !customer.phone || !customer.name) {
    return next(new AppError("Product ID and customer details (name, phone) are required", 400));
  }

  // Get product
  const product = await Product.findById(productId);
  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  // Use product warranty settings as defaults if not provided
  const finalWarrantyType = warrantyType || product.warrantyType || WARRANTY_TYPES.SHOP;
  const finalDuration = durationMonths || product.warrantyDuration || 12;

  if (finalDuration < 1) {
    return next(new AppError("Warranty duration must be at least 1 month", 400));
  }

  // Calculate dates
  const warrantyStartDate = startDate ? new Date(startDate) : new Date();
  const warrantyEndDate = new Date(warrantyStartDate);
  warrantyEndDate.setMonth(warrantyEndDate.getMonth() + finalDuration);

  // Generate warranty number
  const warrantyNumber = await Warranty.generateWarrantyNumber();

  // Create warranty
  const warranty = await Warranty.create({
    warrantyNumber,
    sourceType: "MANUAL",
    product: product._id,
    productName: product.name,
    serialNumber: serialNumber || null,
    customer: {
      name: customer.name,
      phone: customer.phone,
      email: customer.email || null
    },
    warrantyType: finalWarrantyType,
    durationMonths: finalDuration,
    startDate: warrantyStartDate,
    endDate: warrantyEndDate,
    status: WARRANTY_STATUS.ACTIVE,
    notes: notes || null,
    createdBy: req.userId
  });

  await warranty.populate([
    { path: "product", select: "name sku" },
    { path: "createdBy", select: "username" }
  ]);

  res.status(201).json({
    status: "success",
    data: { warranty }
  });
});

/**
 * Get all warranties with filters
 * GET /api/v1/warranties
 */
export const getWarranties = catchAsync(async (req, res, next) => {
  const {
    status,
    warrantyType,
    phone,
    productId,
    startDate,
    endDate,
    page = 1,
    limit = 20
  } = req.query;

  // Build query
  const query = {};

  if (status) query.status = status;
  if (warrantyType) query.warrantyType = warrantyType;
  if (phone) query["customer.phone"] = { $regex: phone, $options: "i" };
  if (productId) query.product = productId;

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  // Pagination
  const pageNum = parseInt(page, 10);
  const limitNum = parseInt(limit, 10);
  const skip = (pageNum - 1) * limitNum;

  // Execute query
  const [warranties, total] = await Promise.all([
    Warranty.find(query)
      .populate("product", "name sku")
      .populate("createdBy", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    Warranty.countDocuments(query)
  ]);

  res.json({
    status: "success",
    results: warranties.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    data: { warranties }
  });
});

/**
 * Get single warranty by ID
 * GET /api/v1/warranties/:id
 */
export const getWarranty = catchAsync(async (req, res, next) => {
  const warranty = await Warranty.findById(req.params.id)
    .populate("product", "name sku image")
    .populate("sale", "saleNumber")
    .populate("repairJob", "jobNumber")
    .populate("createdBy", "username")
    .populate("voidedBy", "username")
    .populate("claims.processedBy", "username")
    .populate("claims.repairJob", "jobNumber");

  if (!warranty) {
    return next(new AppError("Warranty not found", 404));
  }

  res.json({
    status: "success",
    data: { warranty }
  });
});

/**
 * Get warranty by warranty number
 * GET /api/v1/warranties/number/:warrantyNumber
 */
export const getWarrantyByNumber = catchAsync(async (req, res, next) => {
  const warranty = await Warranty.findOne({ warrantyNumber: req.params.warrantyNumber })
    .populate("product", "name sku image")
    .populate("createdBy", "username");

  if (!warranty) {
    return next(new AppError("Warranty not found", 404));
  }

  // Include validity check in response
  const validity = warranty.checkValidity();

  res.json({
    status: "success",
    data: {
      warranty,
      validity
    }
  });
});

/**
 * Search warranties by customer phone
 * GET /api/v1/warranties/customer/:phone
 */
export const searchByCustomer = catchAsync(async (req, res, next) => {
  const { phone } = req.params;

  if (!phone || phone.length < 3) {
    return next(new AppError("Phone number must be at least 3 characters", 400));
  }

  const warranties = await Warranty.find({
    "customer.phone": { $regex: phone, $options: "i" }
  })
    .populate("product", "name sku")
    .sort({ createdAt: -1 });

  // Add validity info to each warranty
  const warrantiesWithValidity = warranties.map(w => ({
    ...w.toJSON(),
    validity: w.checkValidity()
  }));

  res.json({
    status: "success",
    results: warrantiesWithValidity.length,
    data: { warranties: warrantiesWithValidity }
  });
});

/**
 * Check warranty status/validity
 * GET /api/v1/warranties/:id/status
 */
export const checkWarrantyStatus = catchAsync(async (req, res, next) => {
  const warranty = await Warranty.findById(req.params.id)
    .populate("product", "name sku");

  if (!warranty) {
    return next(new AppError("Warranty not found", 404));
  }

  const validity = warranty.checkValidity();

  res.json({
    status: "success",
    data: {
      warrantyNumber: warranty.warrantyNumber,
      product: warranty.product,
      customer: warranty.customer,
      warrantyStatus: warranty.status,
      ...validity,
      startDate: warranty.startDate,
      endDate: warranty.endDate,
      totalClaims: warranty.totalClaims
    }
  });
});

/**
 * Create warranty claim
 * POST /api/v1/warranties/:id/claims
 * 
 * For REPAIR resolution: Auto-creates a repair job linked to this claim
 * For REPLACE resolution: Deducts replacement product from inventory
 * For REFUND resolution: Creates a return record and voids the warranty
 */
export const createClaim = catchAsync(async (req, res, next) => {
  const { 
    issue, 
    resolution, 
    repairJobId,        // Optional: link to existing repair job (for REPAIR)
    replacementProductId, // Optional: for REPLACE if different product
    notes 
  } = req.body;

  if (!issue) {
    return next(new AppError("Issue description is required", 400));
  }

  const warranty = await Warranty.findById(req.params.id)
    .populate("product", "name sku costPrice sellingPrice")
    .populate("sale", "saleNumber grandTotal items");

  if (!warranty) {
    return next(new AppError("Warranty not found", 404));
  }

  // Check if warranty is valid
  const validity = warranty.checkValidity();
  if (!validity.valid) {
    return next(new AppError(`Cannot create claim: ${validity.reason}`, 400));
  }

  // Generate claim number
  const claimNumber = await Warranty.generateClaimNumber();

  // Initialize claim object
  const claim = {
    claimNumber,
    claimDate: new Date(),
    issue,
    resolution: resolution || null,
    resolvedDate: resolution ? new Date() : null,
    notes: notes || null,
    processedBy: req.userId,
    claimCost: 0,
    refundAmount: 0,
    repairJob: null,
    replacementProduct: null,
    returnRecord: null
  };

  // Process resolution side effects
  let resolutionResult = {};

  if (resolution === CLAIM_RESOLUTIONS.REPAIR) {
    // REPAIR Resolution: Auto-create repair job if not linking to existing
    if (repairJobId) {
      // Link to existing repair job
      const existingRepair = await RepairJob.findById(repairJobId);
      if (!existingRepair) {
        return next(new AppError("Repair job not found", 404));
      }
      claim.repairJob = repairJobId;
      resolutionResult.linkedRepairJob = existingRepair.jobNumber;
    } else {
      // Create new repair job
      const jobNumber = await RepairJob.generateJobNumber();
      
      const repairJob = await RepairJob.create({
        jobNumber,
        customer: {
          name: warranty.customer.name,
          phone: warranty.customer.phone,
          email: warranty.customer.email || null
        },
        device: {
          type: DEVICE_TYPES.OTHER,
          brand: "N/A",
          model: warranty.productName,
          serialNumber: warranty.serialNumber || null
        },
        problemDescription: `Warranty Claim: ${issue}`,
        priority: "NORMAL",
        status: REPAIR_STATUS.RECEIVED,
        receivedBy: req.userId,
        receivedAt: new Date(),
        createdBy: req.userId,
        // Track warranty reference in notes
        diagnosisNotes: `Warranty Claim: ${claimNumber}\nOriginal Warranty: ${warranty.warrantyNumber}`
      });

      claim.repairJob = repairJob._id;
      resolutionResult.createdRepairJob = repairJob.jobNumber;
      resolutionResult.repairJobId = repairJob._id;
    }
  } else if (resolution === CLAIM_RESOLUTIONS.REPLACE) {
    // REPLACE Resolution: Deduct replacement product from inventory
    const productToReplace = replacementProductId 
      ? await Product.findById(replacementProductId) 
      : warranty.product;

    if (!productToReplace) {
      return next(new AppError("Replacement product not found", 404));
    }

    // Check stock availability
    const stock = await Stock.getOrCreate(productToReplace._id);
    if (stock.quantity < 1) {
      return next(new AppError(`Insufficient stock for replacement. Available: ${stock.quantity}`, 400));
    }

    // Deduct from inventory
    const previousQuantity = stock.quantity;
    stock.quantity -= 1;
    await stock.save();

    // Create stock adjustment record
    await StockAdjustment.create({
      product: productToReplace._id,
      type: ADJUSTMENT_TYPES.WARRANTY_REPLACE,
      quantity: 1,
      previousQuantity,
      newQuantity: stock.quantity,
      reason: `Warranty Replacement: ${claimNumber} - ${warranty.warrantyNumber}`,
      reference: warranty._id.toString(),
      referenceType: "Manual",
      createdBy: req.userId
    });

    // Set claim cost as product cost price
    claim.claimCost = productToReplace.costPrice || 0;
    claim.replacementProduct = productToReplace._id;
    
    resolutionResult.replacedProduct = productToReplace.name;
    resolutionResult.stockDeducted = 1;
    resolutionResult.claimCost = claim.claimCost;
  } else if (resolution === CLAIM_RESOLUTIONS.REFUND) {
    // REFUND Resolution: Create return record and void warranty
    
    // Calculate refund amount from original sale
    let refundAmount = 0;
    
    if (warranty.sale) {
      // Find the item price from original sale
      const originalSale = await Sale.findById(warranty.sale);
      if (originalSale) {
        const saleItem = originalSale.items.find(item => 
          item.product.toString() === warranty.product._id.toString()
        );
        refundAmount = saleItem ? saleItem.total : warranty.product.sellingPrice || 0;
      } else {
        refundAmount = warranty.product.sellingPrice || 0;
      }
    } else {
      refundAmount = warranty.product.sellingPrice || 0;
    }

    // Create return record
    const returnNumber = await Return.generateReturnNumber();
    
    const returnRecord = await Return.create({
      returnNumber,
      originalSale: warranty.sale || null,
      returnType: RETURN_TYPES.WARRANTY_REFUND,
      items: [{
        product: warranty.product._id,
        productName: warranty.productName,
        sku: warranty.product.sku || null,
        serialNumber: warranty.serialNumber || null,
        quantity: 1,
        unitPrice: refundAmount,
        refundAmount: refundAmount,
        restockable: false, // Defective product - don't restock
        condition: "DEFECTIVE"
      }],
      totalRefund: refundAmount,
      reason: `Warranty Refund: ${claimNumber} - ${issue}`,
      refundMethod: "CASH",
      status: RETURN_STATUS.COMPLETED,
      notes: `Warranty Claim Refund\nWarranty: ${warranty.warrantyNumber}\nClaim: ${claimNumber}`,
      warrantyClaim: warranty._id,
      createdBy: req.userId
    });

    claim.returnRecord = returnRecord._id;
    claim.refundAmount = refundAmount;
    claim.claimCost = refundAmount;

    // Void the warranty after refund
    warranty.status = WARRANTY_STATUS.VOID;
    warranty.voidedBy = req.userId;
    warranty.voidedAt = new Date();
    warranty.voidReason = `Refunded via claim: ${claimNumber}`;

    resolutionResult.refundAmount = refundAmount;
    resolutionResult.returnNumber = returnNumber;
    resolutionResult.warrantyVoided = true;
  }

  // Add claim to warranty
  warranty.claims.push(claim);

  // Update status to CLAIMED if still active (and not voided by refund)
  if (warranty.status === WARRANTY_STATUS.ACTIVE) {
    warranty.status = WARRANTY_STATUS.CLAIMED;
  }

  await warranty.save();

  // Populate for response
  await warranty.populate([
    { path: "claims.processedBy", select: "username" },
    { path: "claims.repairJob", select: "jobNumber status" },
    { path: "claims.replacementProduct", select: "name sku" },
    { path: "claims.returnRecord", select: "returnNumber totalRefund" }
  ]);

  res.status(201).json({
    status: "success",
    message: `Warranty claim created successfully${resolution ? ` with ${resolution} resolution` : ""}`,
    data: {
      warranty,
      newClaim: warranty.claims[warranty.claims.length - 1],
      resolutionResult
    }
  });
});

/**
 * Update warranty claim
 * PUT /api/v1/warranties/:id/claims/:claimId
 */
export const updateClaim = catchAsync(async (req, res, next) => {
  const { resolution, repairJobId, notes } = req.body;

  const warranty = await Warranty.findById(req.params.id);

  if (!warranty) {
    return next(new AppError("Warranty not found", 404));
  }

  // Find the claim
  const claim = warranty.claims.id(req.params.claimId);

  if (!claim) {
    return next(new AppError("Claim not found", 404));
  }

  // Update claim fields
  if (resolution) {
    claim.resolution = resolution;
    claim.resolvedDate = new Date();
  }
  if (repairJobId) claim.repairJob = repairJobId;
  if (notes !== undefined) claim.notes = notes;

  await warranty.save();

  await warranty.populate([
    { path: "claims.processedBy", select: "username" },
    { path: "claims.repairJob", select: "jobNumber" }
  ]);

  res.json({
    status: "success",
    message: "Claim updated successfully",
    data: { warranty }
  });
});

/**
 * Void a warranty
 * POST /api/v1/warranties/:id/void
 */
export const voidWarranty = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason) {
    return next(new AppError("Void reason is required", 400));
  }

  const warranty = await Warranty.findById(req.params.id);

  if (!warranty) {
    return next(new AppError("Warranty not found", 404));
  }

  if (warranty.status === WARRANTY_STATUS.VOID) {
    return next(new AppError("Warranty is already voided", 400));
  }

  warranty.status = WARRANTY_STATUS.VOID;
  warranty.voidedBy = req.userId;
  warranty.voidedAt = new Date();
  warranty.voidReason = reason;

  await warranty.save();

  await warranty.populate("voidedBy", "username");

  res.json({
    status: "success",
    message: "Warranty voided successfully",
    data: { warranty }
  });
});

/**
 * Get warranties expiring soon
 * GET /api/v1/warranties/expiring
 */
export const getExpiringSoon = catchAsync(async (req, res, next) => {
  const { days = 30 } = req.query;

  const warranties = await Warranty.getExpiringSoon(parseInt(days, 10));

  res.json({
    status: "success",
    results: warranties.length,
    data: {
      expiringIn: `${days} days`,
      warranties
    }
  });
});

/**
 * Get warranty statistics
 * GET /api/v1/warranties/stats
 */
export const getWarrantyStats = catchAsync(async (req, res, next) => {
  const { startDate, endDate } = req.query;

  // Build date filter
  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateFilter.$lte = end;
  }

  const matchStage = {};
  if (Object.keys(dateFilter).length > 0) {
    matchStage.createdAt = dateFilter;
  }

  // Aggregate statistics
  const stats = await Warranty.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalWarranties: { $sum: 1 },
        activeWarranties: {
          $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] }
        },
        claimedWarranties: {
          $sum: { $cond: [{ $eq: ["$status", "CLAIMED"] }, 1, 0] }
        },
        expiredWarranties: {
          $sum: { $cond: [{ $eq: ["$status", "EXPIRED"] }, 1, 0] }
        },
        voidedWarranties: {
          $sum: { $cond: [{ $eq: ["$status", "VOID"] }, 1, 0] }
        },
        totalClaims: { $sum: { $size: "$claims" } }
      }
    }
  ]);

  // Get by warranty type
  const byType = await Warranty.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$warrantyType",
        count: { $sum: 1 }
      }
    }
  ]);

  // Update any expired warranties
  const expiredCount = await Warranty.updateExpiredWarranties();

  res.json({
    status: "success",
    data: {
      summary: stats[0] || {
        totalWarranties: 0,
        activeWarranties: 0,
        claimedWarranties: 0,
        expiredWarranties: 0,
        voidedWarranties: 0,
        totalClaims: 0
      },
      byType: byType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      expiredUpdated: expiredCount
    }
  });
});

/**
 * Get warranty types (for frontend dropdown)
 * GET /api/v1/warranties/types
 */
export const getWarrantyTypes = catchAsync(async (req, res, next) => {
  res.json({
    status: "success",
    data: {
      warrantyTypes: Object.entries(WARRANTY_TYPES).map(([key, value]) => ({
        key,
        value
      })),
      warrantyStatuses: Object.entries(WARRANTY_STATUS).map(([key, value]) => ({
        key,
        value
      })),
      claimResolutions: Object.entries(CLAIM_RESOLUTIONS).map(([key, value]) => ({
        key,
        value
      }))
    }
  });
});
