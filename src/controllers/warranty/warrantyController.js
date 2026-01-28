import Warranty, { WARRANTY_STATUS, WARRANTY_TYPES, CLAIM_RESOLUTIONS } from "../../models/warranty/warrantyModel.js";
import Product from "../../models/product/productModel.js";
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
 */
export const createClaim = catchAsync(async (req, res, next) => {
  const { issue, resolution, repairJobId, notes } = req.body;

  if (!issue) {
    return next(new AppError("Issue description is required", 400));
  }

  const warranty = await Warranty.findById(req.params.id);

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

  // Create claim
  const claim = {
    claimNumber,
    claimDate: new Date(),
    issue,
    resolution: resolution || null,
    repairJob: repairJobId || null,
    resolvedDate: resolution ? new Date() : null,
    notes: notes || null,
    processedBy: req.userId
  };

  warranty.claims.push(claim);

  // Update status to CLAIMED if first claim
  if (warranty.status === WARRANTY_STATUS.ACTIVE) {
    warranty.status = WARRANTY_STATUS.CLAIMED;
  }

  await warranty.save();

  await warranty.populate("claims.processedBy", "username");

  res.status(201).json({
    status: "success",
    message: "Warranty claim created successfully",
    data: {
      warranty,
      newClaim: warranty.claims[warranty.claims.length - 1]
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
