import mongoose from "mongoose";

// Promotion types
export const PROMOTION_TYPES = {
  PERCENTAGE: "PERCENTAGE",  // Percentage off
  FIXED: "FIXED",            // Fixed amount off
  BUY_X_GET_Y: "BUY_X_GET_Y" // Buy X get Y free
};

// Target types
export const TARGET_TYPES = {
  ALL: "ALL",          // Applies to all products
  CATEGORY: "CATEGORY", // Applies to specific categories
  PRODUCT: "PRODUCT"    // Applies to specific products
};

const promotionSchema = new mongoose.Schema({
  // Basic info
  name: {
    type: String,
    required: [true, "Promotion name is required"],
    trim: true,
    maxlength: [100, "Name cannot exceed 100 characters"]
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },
  // Discount configuration
  type: {
    type: String,
    enum: Object.values(PROMOTION_TYPES),
    required: [true, "Promotion type is required"]
  },
  value: {
    type: Number,
    required: [true, "Discount value is required"],
    min: [0, "Value cannot be negative"]
  },
  // For BUY_X_GET_Y type
  buyQuantity: {
    type: Number,
    min: [1, "Buy quantity must be at least 1"],
    default: null
  },
  getQuantity: {
    type: Number,
    min: [1, "Get quantity must be at least 1"],
    default: null
  },
  // Limits
  minPurchase: {
    type: Number,
    min: [0, "Minimum purchase cannot be negative"],
    default: 0
  },
  maxDiscount: {
    type: Number,
    min: [0, "Maximum discount cannot be negative"],
    default: null  // null = no cap
  },
  // Scheduling
  startDate: {
    type: Date,
    required: [true, "Start date is required"]
  },
  endDate: {
    type: Date,
    required: [true, "End date is required"]
  },
  // Targeting
  targetType: {
    type: String,
    enum: Object.values(TARGET_TYPES),
    default: TARGET_TYPES.ALL
  },
  targetProducts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product"
  }],
  targetCategories: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category"
  }],
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  priority: {
    type: Number,
    default: 0  // Higher priority applies first
  },
  // Usage tracking
  usageLimit: {
    type: Number,
    default: null  // null = unlimited
  },
  usedCount: {
    type: Number,
    default: 0
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

// Indexes
promotionSchema.index({ startDate: 1, endDate: 1, isActive: 1 });
promotionSchema.index({ targetType: 1 });
promotionSchema.index({ priority: -1 });

// Virtual to check if currently active
promotionSchema.virtual("isCurrentlyActive").get(function() {
  if (!this.isActive) return false;

  const now = new Date();
  const startValid = now >= new Date(this.startDate);
  const endValid = now <= new Date(this.endDate);
  const hasUsage = this.usageLimit === null || this.usedCount < this.usageLimit;

  return startValid && endValid && hasUsage;
});

// Virtual for days remaining
promotionSchema.virtual("daysRemaining").get(function() {
  const now = new Date();
  const end = new Date(this.endDate);
  const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
});

// Static method to get active promotions
promotionSchema.statics.getActivePromotions = async function() {
  const now = new Date();
  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $or: [
      { usageLimit: null },
      { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
    ]
  })
    .sort({ priority: -1 })
    .populate("targetCategories", "name")
    .populate("createdBy", "username");
};

// Static method to find promotions applicable to a product
promotionSchema.statics.findForProduct = async function(productId, categoryId) {
  const now = new Date();
  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    $and: [
      {
        $or: [
          { usageLimit: null },
          { $expr: { $lt: ["$usedCount", "$usageLimit"] } }
        ]
      },
      {
        $or: [
          { targetType: TARGET_TYPES.ALL },
          { targetType: TARGET_TYPES.PRODUCT, targetProducts: productId },
          { targetType: TARGET_TYPES.CATEGORY, targetCategories: categoryId }
        ]
      }
    ]
  })
    .sort({ priority: -1 });
};

// Instance method to calculate discount for an amount
promotionSchema.methods.calculateDiscount = function(amount, quantity = 1) {
  if (!this.isCurrentlyActive) return 0;

  // Check minimum purchase
  if (amount < this.minPurchase) return 0;

  let discount = 0;

  switch (this.type) {
    case PROMOTION_TYPES.PERCENTAGE:
      discount = amount * (this.value / 100);
      break;
    case PROMOTION_TYPES.FIXED:
      discount = this.value;
      break;
    case PROMOTION_TYPES.BUY_X_GET_Y:
      if (this.buyQuantity && this.getQuantity) {
        const freeItems = Math.floor(quantity / this.buyQuantity) * this.getQuantity;
        discount = (amount / quantity) * freeItems;
      }
      break;
  }

  // Apply max discount cap
  if (this.maxDiscount !== null && discount > this.maxDiscount) {
    discount = this.maxDiscount;
  }

  return Math.round(discount * 100) / 100;
};

export default mongoose.model("Promotion", promotionSchema);
