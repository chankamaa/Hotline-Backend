import mongoose from "mongoose";

// Job status
export const REPAIR_STATUS = {
  RECEIVED: "RECEIVED",         // Device received by technician
  IN_PROGRESS: "IN_PROGRESS",   // Technician working on it
  READY: "READY",               // Repair done, waiting for pickup
  COMPLETED: "COMPLETED",       // Customer paid and collected
  CANCELLED: "CANCELLED"        // Job cancelled
};

// Priority levels
export const REPAIR_PRIORITY = {
  LOW: "LOW",
  NORMAL: "NORMAL",
  HIGH: "HIGH",
  URGENT: "URGENT"
};

// Device types
export const DEVICE_TYPES = {
  MOBILE_PHONE: "MOBILE_PHONE",
  TABLET: "TABLET",
  LAPTOP: "LAPTOP",
  SMARTWATCH: "SMARTWATCH",
  OTHER: "OTHER"
};

// Payment status
export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  PAID: "PAID"
};

// Part used subdocument schema
const partUsedSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  sku: String,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: true });

// Customer subdocument schema
const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Customer name is required"],
    trim: true
  },
  phone: {
    type: String,
    required: [true, "Customer phone is required"],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  address: {
    type: String,
    trim: true
  }
}, { _id: false });

// Device subdocument schema
const deviceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: Object.values(DEVICE_TYPES),
    default: DEVICE_TYPES.MOBILE_PHONE
  },
  brand: {
    type: String,
    required: [true, "Device brand is required"],
    trim: true
  },
  model: {
    type: String,
    required: [true, "Device model is required"],
    trim: true
  },
  serialNumber: {
    type: String,
    trim: true
  },
  imei: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    trim: true
  },
  accessories: [{
    type: String,
    trim: true
  }],
  condition: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, { _id: false });

// Main RepairJob schema
const repairJobSchema = new mongoose.Schema({
  // Auto-generated job number
  jobNumber: {
    type: String,
    unique: true,
    required: true
  },
  // Status
  status: {
    type: String,
    enum: Object.values(REPAIR_STATUS),
    default: REPAIR_STATUS.RECEIVED
  },
  priority: {
    type: String,
    enum: Object.values(REPAIR_PRIORITY),
    default: REPAIR_PRIORITY.NORMAL
  },
  // Customer info
  customer: {
    type: customerSchema,
    required: true
  },
  // Device info
  device: {
    type: deviceSchema,
    required: true
  },
  // Problem details
  problemDescription: {
    type: String,
    required: [true, "Problem description is required"],
    trim: true,
    maxlength: 1000
  },
  diagnosisNotes: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  repairNotes: {
    type: String,
    trim: true,
    maxlength: 2000
  },
  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  assignedAt: Date,
  // Device received tracking
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  // Parts used
  partsUsed: {
    type: [partUsedSchema],
    default: []
  },
  // Costs
  laborCost: {
    type: Number,
    default: 0,
    min: 0
  },
  partsTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  totalCost: {
    type: Number,
    default: 0,
    min: 0
  },
  // Estimates and payments
  estimatedCost: {
    type: Number,
    default: 0,
    min: 0
  },
  advancePayment: {
    type: Number,
    default: 0,
    min: 0
  },
  advancePaymentReceivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  advancePaymentReceivedAt: Date,
  finalPayment: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING
  },
  // Dates
  expectedCompletionDate: Date,
  actualCompletionDate: Date,
  pickupDate: Date,
  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  cancelReason: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
repairJobSchema.index({ jobNumber: 1 });
repairJobSchema.index({ status: 1, createdAt: -1 });
repairJobSchema.index({ assignedTo: 1, status: 1 });
repairJobSchema.index({ "customer.phone": 1 });
repairJobSchema.index({ createdAt: -1 });

// Virtual for balance due
repairJobSchema.virtual("balanceDue").get(function() {
  return Math.max(0, this.totalCost - this.advancePayment - this.finalPayment);
});

// Static method to generate job number
repairJobSchema.statics.generateJobNumber = async function() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const lastJob = await this.findOne({
    jobNumber: { $regex: `^RJ-${dateStr}` }
  }).sort({ jobNumber: -1 });

  let sequence = 1;
  if (lastJob) {
    const lastSequence = parseInt(lastJob.jobNumber.split("-")[2], 10);
    sequence = lastSequence + 1;
  }

  return `RJ-${dateStr}-${sequence.toString().padStart(4, "0")}`;
};

// Pre-save hook to calculate totals
repairJobSchema.pre("save", async function() {
  // Calculate parts total
  this.partsTotal = this.partsUsed.reduce((sum, part) => sum + part.total, 0);

  // Calculate total cost
  this.totalCost = this.laborCost + this.partsTotal;

  // Update payment status
  const totalPaid = this.advancePayment + this.finalPayment;
  if (totalPaid >= this.totalCost && this.totalCost > 0) {
    this.paymentStatus = PAYMENT_STATUS.PAID;
  } else if (totalPaid > 0) {
    this.paymentStatus = PAYMENT_STATUS.PARTIAL;
  } else {
    this.paymentStatus = PAYMENT_STATUS.PENDING;
  }
});

export default mongoose.model("RepairJob", repairJobSchema);
