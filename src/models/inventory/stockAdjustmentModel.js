import mongoose from "mongoose";

// Adjustment types
export const ADJUSTMENT_TYPES = {
  ADDITION: "ADDITION",       // Generic stock addition
  REDUCTION: "REDUCTION",     // Generic stock reduction
  PURCHASE: "PURCHASE",       // Stock received from purchase
  SALE: "SALE",               // Stock reduced due to sale
  RETURN: "RETURN",           // Customer return (adds stock)
  DAMAGE: "DAMAGE",           // Damaged goods (reduces stock)
  THEFT: "THEFT",             // Stolen goods (reduces stock)
  CORRECTION: "CORRECTION",   // Inventory correction (add or reduce)
  TRANSFER_IN: "TRANSFER_IN", // Received from another location
  TRANSFER_OUT: "TRANSFER_OUT" // Sent to another location
};

const stockAdjustmentSchema = new mongoose.Schema({
  // Reference to product
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  // Type of adjustment
  type: {
    type: String,
    enum: Object.values(ADJUSTMENT_TYPES),
    required: true
  },
  // Quantity changed (always positive number)
  quantity: {
    type: Number,
    required: true,
    min: [1, "Adjustment quantity must be at least 1"]
  },
  // Stock level before this adjustment
  previousQuantity: {
    type: Number,
    required: true
  },
  // Stock level after this adjustment
  newQuantity: {
    type: Number,
    required: true
  },
  // Reason/notes for the adjustment
  reason: {
    type: String,
    trim: true,
    maxlength: [500, "Reason cannot exceed 500 characters"]
  },
  // Reference to related document (e.g., sale ID, purchase order ID)
  reference: {
    type: String,
    trim: true
  },
  // Reference type for linking to other collections
  referenceType: {
    type: String,
    enum: ["Sale", "Purchase", "Transfer", "Manual", null],
    default: "Manual"
  },
  // User who made the adjustment
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Indexes for querying
stockAdjustmentSchema.index({ product: 1, createdAt: -1 });
stockAdjustmentSchema.index({ type: 1, createdAt: -1 });
stockAdjustmentSchema.index({ createdBy: 1, createdAt: -1 });
stockAdjustmentSchema.index({ createdAt: -1 });

// Virtual to determine if stock increased or decreased
stockAdjustmentSchema.virtual("direction").get(function() {
  return this.newQuantity > this.previousQuantity ? "IN" : "OUT";
});

// Virtual for quantity change (with sign)
stockAdjustmentSchema.virtual("change").get(function() {
  return this.newQuantity - this.previousQuantity;
});

// Static method to get adjustment history for a product
stockAdjustmentSchema.statics.getHistory = async function(productId, options = {}) {
  const { limit = 50, page = 1, type, startDate, endDate } = options;
  
  const query = { product: productId };
  
  if (type) {
    query.type = type;
  }
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }
  
  const skip = (page - 1) * limit;
  
  const [adjustments, total] = await Promise.all([
    this.find(query)
      .populate("createdBy", "username")
      .populate("product", "name sku")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    this.countDocuments(query)
  ]);
  
  return {
    adjustments,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

export default mongoose.model("StockAdjustment", stockAdjustmentSchema);
