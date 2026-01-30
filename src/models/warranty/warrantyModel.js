import mongoose from "mongoose";

// Warranty Status
export const WARRANTY_STATUS = {
  ACTIVE: "ACTIVE",       // Valid warranty
  EXPIRED: "EXPIRED",     // Past end date
  CLAIMED: "CLAIMED",     // Has been claimed (may still be active for more claims)
  VOID: "VOID"            // Voided due to misuse/damage
};

// Warranty Type
export const WARRANTY_TYPES = {
  MANUFACTURER: "MANUFACTURER",  // Brand warranty
  SHOP: "SHOP",                  // Store warranty
  EXTENDED: "EXTENDED",          // Paid extended warranty
  REPAIR: "REPAIR"               // Warranty on repair work
};

// Claim Resolution Types
export const CLAIM_RESOLUTIONS = {
  REPAIR: "REPAIR",       // Item was repaired
  REPLACE: "REPLACE",     // Item was replaced
  REFUND: "REFUND",       // Money refunded
  REJECTED: "REJECTED"    // Claim rejected
};

// Claim subdocument schema
const claimSchema = new mongoose.Schema({
  claimNumber: {
    type: String,
    required: true
  },
  claimDate: {
    type: Date,
    default: Date.now
  },
  issue: {
    type: String,
    required: [true, "Issue description is required"],
    trim: true,
    maxlength: 1000
  },
  resolution: {
    type: String,
    enum: Object.values(CLAIM_RESOLUTIONS)
  },
  // For REPAIR resolution - linked repair job
  repairJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RepairJob"
  },
  // For REPLACE resolution - replacement product (if different from original)
  replacementProduct: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product"
  },
  // For REFUND resolution - linked return record
  returnRecord: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Return"
  },
  // For REFUND resolution - refund amount
  refundAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Cost of this claim (parts, labor, replacement cost, or refund amount)
  claimCost: {
    type: Number,
    default: 0,
    min: 0
  },
  resolvedDate: Date,
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { _id: true });

// Customer subdocument schema (embedded, not referenced)
const warrantyCustomerSchema = new mongoose.Schema({
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
  }
}, { _id: false });

// Main Warranty Schema
const warrantySchema = new mongoose.Schema({
  // Auto-generated warranty number
  warrantyNumber: {
    type: String,
    unique: true,
    required: true
  },

  // Source - where this warranty came from
  sourceType: {
    type: String,
    enum: ["SALE", "REPAIR", "MANUAL"],
    required: true
  },
  sale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sale"
  },
  repairJob: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RepairJob"
  },

  // Product Information
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  productName: {
    type: String,
    required: true  // Snapshot at time of warranty creation
  },
  serialNumber: {
    type: String,
    trim: true  // Device IMEI/Serial (optional)
  },

  // Customer Information
  customer: {
    type: warrantyCustomerSchema,
    required: true
  },

  // Warranty Details
  warrantyType: {
    type: String,
    enum: Object.values(WARRANTY_TYPES),
    required: true
  },
  durationMonths: {
    type: Number,
    required: true,
    min: [1, "Warranty duration must be at least 1 month"]
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },

  // Status
  status: {
    type: String,
    enum: Object.values(WARRANTY_STATUS),
    default: WARRANTY_STATUS.ACTIVE
  },

  // Claims History
  claims: {
    type: [claimSchema],
    default: []
  },

  // Void Information
  voidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  voidedAt: Date,
  voidReason: {
    type: String,
    trim: true,
    maxlength: 500
  },

  // Notes
  notes: {
    type: String,
    trim: true,
    maxlength: 1000
  },

  // Tracking
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for querying
warrantySchema.index({ warrantyNumber: 1 });
warrantySchema.index({ "customer.phone": 1 });
warrantySchema.index({ status: 1, endDate: 1 });
warrantySchema.index({ product: 1 });
warrantySchema.index({ sale: 1 });
warrantySchema.index({ createdAt: -1 });

// Virtual for total claims count
warrantySchema.virtual("totalClaims").get(function() {
  return this.claims ? this.claims.length : 0;
});

// Virtual for days remaining
warrantySchema.virtual("daysRemaining").get(function() {
  if (this.status === WARRANTY_STATUS.VOID) return 0;
  const now = new Date();
  const end = new Date(this.endDate);
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
});

// Virtual for checking if valid
warrantySchema.virtual("isValid").get(function() {
  if (this.status === WARRANTY_STATUS.VOID) return false;
  return new Date() <= new Date(this.endDate);
});

// Pre-save hook to update status based on end date
warrantySchema.pre("save", function() {
  // Auto-update status to EXPIRED if past end date
  if (this.status === WARRANTY_STATUS.ACTIVE && new Date() > new Date(this.endDate)) {
    this.status = WARRANTY_STATUS.EXPIRED;
  }
});

// Static method to generate warranty number
warrantySchema.statics.generateWarrantyNumber = async function() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const lastWarranty = await this.findOne({
    warrantyNumber: { $regex: `^WR-${dateStr}` }
  }).sort({ warrantyNumber: -1 });

  let sequence = 1;
  if (lastWarranty) {
    const lastSequence = parseInt(lastWarranty.warrantyNumber.split("-")[2], 10);
    sequence = lastSequence + 1;
  }

  return `WR-${dateStr}-${sequence.toString().padStart(4, "0")}`;
};

// Static method to generate claim number
warrantySchema.statics.generateClaimNumber = async function() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Count all claims across all warranties today
  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date(today);
  todayEnd.setHours(23, 59, 59, 999);

  const warranties = await this.find({
    "claims.claimDate": { $gte: todayStart, $lte: todayEnd }
  });

  let totalClaimsToday = 0;
  warranties.forEach(w => {
    w.claims.forEach(c => {
      if (c.claimDate >= todayStart && c.claimDate <= todayEnd) {
        totalClaimsToday++;
      }
    });
  });

  return `CLM-${dateStr}-${(totalClaimsToday + 1).toString().padStart(4, "0")}`;
};

// Static method to find warranties by customer phone
warrantySchema.statics.findByPhone = async function(phone) {
  return this.find({ "customer.phone": phone })
    .populate("product", "name sku")
    .sort({ createdAt: -1 });
};

// Static method to check and update expired warranties
warrantySchema.statics.updateExpiredWarranties = async function() {
  const now = new Date();
  const result = await this.updateMany(
    {
      status: WARRANTY_STATUS.ACTIVE,
      endDate: { $lt: now }
    },
    {
      $set: { status: WARRANTY_STATUS.EXPIRED }
    }
  );
  return result.modifiedCount;
};

// Static method to get warranties expiring soon
warrantySchema.statics.getExpiringSoon = async function(days = 30) {
  const now = new Date();
  const futureDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  return this.find({
    status: WARRANTY_STATUS.ACTIVE,
    endDate: { $gte: now, $lte: futureDate }
  })
    .populate("product", "name sku")
    .sort({ endDate: 1 });
};

// Instance method to check validity
warrantySchema.methods.checkValidity = function() {
  if (this.status === WARRANTY_STATUS.VOID) {
    return { valid: false, reason: "Warranty has been voided" };
  }

  const now = new Date();
  const endDate = new Date(this.endDate);

  if (now > endDate) {
    return { valid: false, reason: "Warranty has expired" };
  }

  const daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

  return {
    valid: true,
    daysRemaining,
    endDate: this.endDate,
    status: this.status
  };
};

export default mongoose.model("Warranty", warrantySchema);
