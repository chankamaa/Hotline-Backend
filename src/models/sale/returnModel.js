import mongoose from "mongoose";

// Return types
export const RETURN_TYPES = {
  REFUND: "REFUND",     // Full/partial refund with cash back
  EXCHANGE: "EXCHANGE"  // Return old item + buy new item
};

// Return status
export const RETURN_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED"
};

// Return item subdocument
const returnItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  // Snapshot data at time of return
  productName: {
    type: String,
    required: true
  },
  sku: {
    type: String
  },
  serialNumber: {
    type: String,
    trim: true
  },
  // Quantity being returned
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"]
  },
  // Original unit price from sale
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  // Refund amount for this item
  refundAmount: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: true });

// Main Return schema
const returnSchema = new mongoose.Schema({
  // Auto-generated return number
  returnNumber: {
    type: String,
    unique: true,
    required: true
  },
  // Reference to original sale
  originalSale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sale",
    required: true
  },
  // Type of return
  returnType: {
    type: String,
    enum: Object.values(RETURN_TYPES),
    required: true
  },
  // Items being returned
  items: {
    type: [returnItemSchema],
    required: true,
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: "Return must have at least one item"
    }
  },
  // Total refund amount
  totalRefund: {
    type: Number,
    required: true,
    min: 0
  },
  // For EXCHANGE type: reference to new sale
  exchangeSale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sale",
    default: null
  },
  // For EXCHANGE: amount customer needs to pay (new - refund)
  exchangeAmountDue: {
    type: Number,
    default: 0
  },
  // Reason for return
  reason: {
    type: String,
    required: [true, "Return reason is required"],
    trim: true,
    maxlength: [500, "Reason cannot exceed 500 characters"]
  },
  // How refund was given
  refundMethod: {
    type: String,
    enum: ["CASH", "CARD", "ORIGINAL_METHOD"],
    default: "CASH"
  },
  // Status
  status: {
    type: String,
    enum: Object.values(RETURN_STATUS),
    default: RETURN_STATUS.COMPLETED
  },
  // Notes
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  // User who processed the return
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
returnSchema.index({ returnNumber: 1 });
returnSchema.index({ originalSale: 1 });
returnSchema.index({ returnType: 1, createdAt: -1 });
returnSchema.index({ createdAt: -1 });
returnSchema.index({ createdBy: 1, createdAt: -1 });

// Virtual for total items count
returnSchema.virtual("itemCount").get(function() {
  return this.items.reduce((sum, item) => sum + item.quantity, 0);
});

// Static method to generate return number
returnSchema.statics.generateReturnNumber = async function() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Find the last return number for today
  const lastReturn = await this.findOne({
    returnNumber: { $regex: `^RT-${dateStr}` }
  }).sort({ returnNumber: -1 });

  let sequence = 1;
  if (lastReturn) {
    const lastSequence = parseInt(lastReturn.returnNumber.split("-")[2], 10);
    sequence = lastSequence + 1;
  }

  return `RT-${dateStr}-${sequence.toString().padStart(4, "0")}`;
};

// Static method to get return summary for a date range
returnSchema.statics.getReturnSummary = async function(startDate, endDate) {
  const result = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: RETURN_STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: "$returnType",
        count: { $sum: 1 },
        totalRefund: { $sum: "$totalRefund" },
        totalItems: { $sum: { $size: "$items" } }
      }
    }
  ]);

  return result;
};

export default mongoose.model("Return", returnSchema);
