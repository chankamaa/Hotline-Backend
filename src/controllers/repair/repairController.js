import RepairJob, { REPAIR_STATUS } from "../../models/repair/repairJobModel.js";
import User from "../../models/auth/userModel.js";
import Role from "../../models/auth/roleModel.js";
import Product from "../../models/product/productModel.js";
import Stock from "../../models/inventory/stockModel.js";
import StockAdjustment, { ADJUSTMENT_TYPES } from "../../models/inventory/stockAdjustmentModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create new repair job (Technician receives device)
 * POST /api/v1/repairs
 */
export const createRepair = catchAsync(async (req, res, next) => {
  const {
    customer,
    device,
    problemDescription,
    priority,
    estimatedCost,
    advancePayment,
    expectedCompletionDate,
    assignedTo
  } = req.body;

  // Validate required fields
  if (!customer || !customer.name || !customer.phone) {
    return next(new AppError("Customer name and phone are required", 400));
  }
  if (!device || !device.brand || !device.model) {
    return next(new AppError("Device brand and model are required", 400));
  }
  if (!problemDescription) {
    return next(new AppError("Problem description is required", 400));
  }

  // Generate job number
  const jobNumber = await RepairJob.generateJobNumber();

  // Create job - status is RECEIVED (device received by technician)
  const repairJob = await RepairJob.create({
    jobNumber,
    customer,
    device,
    problemDescription,
    priority: priority || "NORMAL",
    estimatedCost: estimatedCost || 0,
    advancePayment: advancePayment || 0,
    advancePaymentReceivedBy: advancePayment > 0 ? req.userId : null,
    advancePaymentReceivedAt: advancePayment > 0 ? new Date() : null,
    expectedCompletionDate,
    assignedTo: assignedTo || req.userId,  // Default to creator (technician)
    assignedBy: req.userId,
    assignedAt: new Date(),
    receivedBy: req.userId,
    receivedAt: new Date(),
    status: REPAIR_STATUS.RECEIVED,
    createdBy: req.userId
  });

  await repairJob.populate([
    { path: "createdBy", select: "username" },
    { path: "assignedTo", select: "username" },
    { path: "receivedBy", select: "username" }
  ]);

  res.status(201).json({
    status: "success",
    data: {
      repairJob,
      paymentInfo: {
        estimatedCost: repairJob.estimatedCost,
        advancePayment: repairJob.advancePayment,
        estimatedBalance: repairJob.estimatedCost - repairJob.advancePayment
      }
    }
  });
});

/**
 * Get all repair jobs (with filters)
 * GET /api/v1/repairs
 */
export const getRepairs = catchAsync(async (req, res, next) => {
  const {
    status,
    priority,
    assignedTo,
    phone,
    startDate,
    endDate,
    page = 1,
    limit = 20
  } = req.query;

  const query = {};

  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (assignedTo) query.assignedTo = assignedTo;
  if (phone) query["customer.phone"] = { $regex: phone, $options: "i" };

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

  const [repairs, total] = await Promise.all([
    RepairJob.find(query)
      .populate("assignedTo", "username")
      .populate("createdBy", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    RepairJob.countDocuments(query)
  ]);

  res.json({
    status: "success",
    results: repairs.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    data: { repairs }
  });
});

/**
 * Get technician's own assigned jobs
 * GET /api/v1/repairs/my-jobs
 */
export const getMyRepairs = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = { assignedTo: req.userId };
  if (status) query.status = status;

  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  const [repairs, total] = await Promise.all([
    RepairJob.find(query)
      .populate("createdBy", "username")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum),
    RepairJob.countDocuments(query)
  ]);

  res.json({
    status: "success",
    results: repairs.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    data: { repairs }
  });
});

/**
 * Get single repair job
 * GET /api/v1/repairs/:id
 */
export const getRepair = catchAsync(async (req, res, next) => {
  const repair = await RepairJob.findById(req.params.id)
    .populate("assignedTo", "username")
    .populate("createdBy", "username")
    .populate("completedBy", "username")
    .populate("partsUsed.product", "name sku");

  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  res.json({
    status: "success",
    data: { repair }
  });
});

/**
 * Get repair by job number
 * GET /api/v1/repairs/number/:jobNumber
 */
export const getRepairByNumber = catchAsync(async (req, res, next) => {
  const repair = await RepairJob.findOne({ jobNumber: req.params.jobNumber })
    .populate("assignedTo", "username")
    .populate("createdBy", "username");

  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  res.json({
    status: "success",
    data: { repair }
  });
});

/**
 * Assign technician to repair job
 * PUT /api/v1/repairs/:id/assign
 */
export const assignTechnician = catchAsync(async (req, res, next) => {
  const { technicianId } = req.body;

  if (!technicianId) {
    return next(new AppError("Technician ID is required", 400));
  }

  // Verify technician exists and has TECHNICIAN role
  const technician = await User.findById(technicianId).populate("role");
  if (!technician) {
    return next(new AppError("Technician not found", 404));
  }
  if (!technician.isActive) {
    return next(new AppError("Technician is not active", 400));
  }

  const repair = await RepairJob.findById(req.params.id);
  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  if (repair.status === REPAIR_STATUS.COMPLETED || repair.status === REPAIR_STATUS.CANCELLED) {
    return next(new AppError("Cannot assign technician to completed/cancelled job", 400));
  }

  repair.assignedTo = technicianId;
  repair.assignedBy = req.userId;
  repair.assignedAt = new Date();
  repair.status = REPAIR_STATUS.ASSIGNED;
  await repair.save();

  await repair.populate("assignedTo", "username");

  res.json({
    status: "success",
    message: "Technician assigned successfully",
    data: { repair }
  });
});

/**
 * Start working on repair (Technician)
 * PUT /api/v1/repairs/:id/start
 */
export const startRepair = catchAsync(async (req, res, next) => {
  const repair = await RepairJob.findById(req.params.id);

  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  // Verify technician is assigned to this job
  if (repair.assignedTo?.toString() !== req.userId) {
    return next(new AppError("You are not assigned to this repair job", 403));
  }

  if (repair.status !== REPAIR_STATUS.RECEIVED) {
    return next(new AppError(`Cannot start repair with status: ${repair.status}. Must be RECEIVED.`, 400));
  }

  repair.status = REPAIR_STATUS.IN_PROGRESS;
  await repair.save();

  res.json({
    status: "success",
    message: "Repair started - status changed to IN_PROGRESS",
    data: { repair }
  });
});

/**
 * Complete repair (Technician adds parts, labor cost)
 * PUT /api/v1/repairs/:id/complete
 */
export const completeRepair = catchAsync(async (req, res, next) => {
  const { laborCost, partsUsed, diagnosisNotes, repairNotes } = req.body;

  const repair = await RepairJob.findById(req.params.id);

  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  // Verify technician is assigned to this job
  if (repair.assignedTo?.toString() !== req.userId) {
    return next(new AppError("You are not assigned to this repair job", 403));
  }

  if (repair.status !== REPAIR_STATUS.IN_PROGRESS && repair.status !== REPAIR_STATUS.RECEIVED) {
    return next(new AppError(`Cannot complete repair with status: ${repair.status}. Must be IN_PROGRESS or RECEIVED.`, 400));
  }

  // Process parts used
  const processedParts = [];
  if (partsUsed && Array.isArray(partsUsed)) {
    for (const part of partsUsed) {
      const product = await Product.findById(part.productId);
      if (!product) {
        return next(new AppError(`Product not found: ${part.productId}`, 404));
      }

      // Check stock
      const stock = await Stock.findOne({ product: part.productId });
      const currentQty = stock ? stock.quantity : 0;

      if (currentQty < part.quantity) {
        return next(new AppError(
          `Insufficient stock for ${product.name}. Available: ${currentQty}`,
          400
        ));
      }

      const unitPrice = part.unitPrice || product.sellingPrice;
      processedParts.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: part.quantity,
        unitPrice,
        total: unitPrice * part.quantity
      });

      // Deduct inventory
      const previousQuantity = stock.quantity;
      stock.quantity -= part.quantity;
      stock.lastUpdated = new Date();
      await stock.save();

      // Create stock adjustment
      await StockAdjustment.create({
        product: product._id,
        type: ADJUSTMENT_TYPES.SALE,
        quantity: part.quantity,
        previousQuantity,
        newQuantity: stock.quantity,
        reason: `Repair: ${repair.jobNumber}`,
        reference: repair._id.toString(),
        referenceType: "Sale",
        createdBy: req.userId
      });
    }
  }

  // Update repair
  repair.laborCost = laborCost || 0;
  repair.partsUsed = processedParts;
  if (diagnosisNotes) repair.diagnosisNotes = diagnosisNotes;
  if (repairNotes) repair.repairNotes = repairNotes;
  repair.status = REPAIR_STATUS.READY;
  repair.completedBy = req.userId;
  repair.actualCompletionDate = new Date();
  await repair.save();

  await repair.populate("partsUsed.product", "name sku");

  res.json({
    status: "success",
    message: "Repair completed and ready for pickup",
    data: { repair }
  });
});

/**
 * Collect payment and complete (Cashier)
 * PUT /api/v1/repairs/:id/payment
 */
export const collectPayment = catchAsync(async (req, res, next) => {
  const { amount } = req.body;

  if (!amount || amount <= 0) {
    return next(new AppError("Payment amount is required", 400));
  }

  const repair = await RepairJob.findById(req.params.id);

  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  if (repair.status !== REPAIR_STATUS.READY) {
    return next(new AppError(`Cannot collect payment. Status must be READY. Current: ${repair.status}`, 400));
  }

  // Calculate payment breakdown
  const totalCost = repair.totalCost;
  const advancePaid = repair.advancePayment;
  const balanceDue = Math.max(0, totalCost - advancePaid);
  const amountReceived = amount;
  const change = Math.max(0, amountReceived - balanceDue);

  repair.finalPayment = amount;
  repair.status = REPAIR_STATUS.COMPLETED;
  repair.pickupDate = new Date();
  await repair.save();

  await repair.populate([
    { path: "assignedTo", select: "username" },
    { path: "completedBy", select: "username" }
  ]);

  res.json({
    status: "success",
    message: "Payment collected and repair completed",
    data: {
      repair,
      paymentBreakdown: {
        totalCost,
        laborCost: repair.laborCost,
        partsTotal: repair.partsTotal,
        advancePaid,
        balanceDue,
        amountReceived,
        change,
        paymentStatus: "PAID"
      }
    }
  });
});

/**
 * Cancel repair job
 * PUT /api/v1/repairs/:id/cancel
 */
export const cancelRepair = catchAsync(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason) {
    return next(new AppError("Cancel reason is required", 400));
  }

  const repair = await RepairJob.findById(req.params.id);

  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  if (repair.status === REPAIR_STATUS.COMPLETED) {
    return next(new AppError("Cannot cancel completed repair", 400));
  }

  // Restore inventory for any parts used
  if (repair.partsUsed && repair.partsUsed.length > 0) {
    for (const part of repair.partsUsed) {
      const stock = await Stock.getOrCreate(part.product);
      const previousQuantity = stock.quantity;
      stock.quantity += part.quantity;
      stock.lastUpdated = new Date();
      await stock.save();

      await StockAdjustment.create({
        product: part.product,
        type: ADJUSTMENT_TYPES.RETURN,
        quantity: part.quantity,
        previousQuantity,
        newQuantity: stock.quantity,
        reason: `Cancel Repair: ${repair.jobNumber}`,
        reference: repair._id.toString(),
        referenceType: "Manual",
        createdBy: req.userId
      });
    }
  }

  repair.status = REPAIR_STATUS.CANCELLED;
  repair.cancelledBy = req.userId;
  repair.cancelReason = reason;
  await repair.save();

  res.json({
    status: "success",
    message: "Repair job cancelled",
    data: { repair }
  });
});

/**
 * Get available technicians
 * GET /api/v1/repairs/technicians
 */
export const getAvailableTechnicians = catchAsync(async (req, res, next) => {
  // Find TECHNICIAN role
  const techRole = await Role.findOne({ name: "TECHNICIAN" });

  if (!techRole) {
    return res.json({
      status: "success",
      data: { technicians: [] }
    });
  }

  // Find active users with technician role
  const technicians = await User.find({
    role: techRole._id,
    isActive: true
  }).select("username email");

  // Get current job count for each technician
  const technicianData = await Promise.all(
    technicians.map(async (tech) => {
      const activeJobs = await RepairJob.countDocuments({
        assignedTo: tech._id,
        status: { $in: [REPAIR_STATUS.ASSIGNED, REPAIR_STATUS.IN_PROGRESS] }
      });
      return {
        _id: tech._id,
        username: tech.username,
        email: tech.email,
        activeJobs
      };
    })
  );

  res.json({
    status: "success",
    results: technicianData.length,
    data: { technicians: technicianData }
  });
});

/**
 * Get repair dashboard stats
 * GET /api/v1/repairs/dashboard
 */
export const getDashboard = catchAsync(async (req, res, next) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [
    pending,
    inProgress,
    ready,
    completedToday,
    totalRevenue
  ] = await Promise.all([
    RepairJob.countDocuments({ status: REPAIR_STATUS.RECEIVED }),
    RepairJob.countDocuments({ status: REPAIR_STATUS.IN_PROGRESS }),
    RepairJob.countDocuments({ status: REPAIR_STATUS.READY }),
    RepairJob.countDocuments({
      status: REPAIR_STATUS.COMPLETED,
      pickupDate: { $gte: today }
    }),
    RepairJob.aggregate([
      { $match: { status: REPAIR_STATUS.COMPLETED } },
      { $group: { _id: null, total: { $sum: "$totalCost" } } }
    ])
  ]);

  res.json({
    status: "success",
    data: {
      received: pending,  // Changed from pending
      inProgress,
      ready,
      completedToday,
      totalRevenue: totalRevenue[0]?.total || 0
    }
  });
});

/**
 * Update advance payment for repair job
 * PUT /api/v1/repairs/:id/advance
 */
export const updateAdvancePayment = catchAsync(async (req, res, next) => {
  const { amount } = req.body;

  if (amount === undefined || amount < 0) {
    return next(new AppError("Valid advance amount is required", 400));
  }

  const repair = await RepairJob.findById(req.params.id);

  if (!repair) {
    return next(new AppError("Repair job not found", 404));
  }

  if (repair.status === REPAIR_STATUS.COMPLETED || repair.status === REPAIR_STATUS.CANCELLED) {
    return next(new AppError("Cannot update advance for completed/cancelled job", 400));
  }

  repair.advancePayment = amount;
  repair.advancePaymentReceivedBy = req.userId;
  repair.advancePaymentReceivedAt = new Date();
  await repair.save();

  await repair.populate("advancePaymentReceivedBy", "username");

  res.json({
    status: "success",
    message: "Advance payment updated",
    data: {
      repair,
      paymentInfo: {
        advancePayment: repair.advancePayment,
        estimatedCost: repair.estimatedCost,
        estimatedBalance: repair.estimatedCost - repair.advancePayment
      }
    }
  });
});
