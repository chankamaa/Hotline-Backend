import mongoose from "mongoose";

// Payment methods
export const PAYMENT_METHODS = {
  CASH: "CASH",
  CARD: "CARD",
  OTHER: "OTHER"
};

// Sale status
export const SALE_STATUS = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  VOIDED: "VOIDED"
};

// Discount types
export const DISCOUNT_TYPES = {
  PERCENTAGE: "PERCENTAGE",
  FIXED: "FIXED"
};

// Sale Item subdocument schema
const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  // Snapshot data at time of sale (for historical accuracy)
  productName: {
    type: String,
    required: true
  },
  sku: {
    type: String
  },
  // Serial number/IMEI for warranty tracking
  serialNumber: {
    type: String,
    trim: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"]
  },
  unitPrice: {
    type: Number,
    required: true,
    min: [0, "Unit price cannot be negative"]
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true
  }
}, { _id: true });

// Payment subdocument schema
const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: Object.values(PAYMENT_METHODS),
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: [0.01, "Payment amount must be positive"]
  },
  reference: {
    type: String,
    trim: true
  },
  paidAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

// Main Sale schema
const saleSchema = new mongoose.Schema({
  // Auto-generated sale number
  saleNumber: {
    type: String,
    unique: true,
    required: true
  },
  // Customer info (optional, required for warranty generation)
  customer: {
    name: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    }
  },
  // Sale items
  items: {
    type: [saleItemSchema],
    required: true,
    validate: {
      validator: function(items) {
        return items && items.length > 0;
      },
      message: "Sale must have at least one item"
    }
  },
  // Payments
  payments: {
    type: [paymentSchema],
    default: []
  },
  // Totals
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  // Discount
  discountType: {
    type: String,
    enum: Object.values(DISCOUNT_TYPES),
    default: null
  },
  discountValue: {
    type: Number,
    default: 0,
    min: 0
  },
  discountTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  // Final total
  grandTotal: {
    type: Number,
    required: true,
    min: 0
  },
  // Amount paid
  amountPaid: {
    type: Number,
    default: 0,
    min: 0
  },
  // Change given
  changeGiven: {
    type: Number,
    default: 0,
    min: 0
  },
  // Status
  status: {
    type: String,
    enum: Object.values(SALE_STATUS),
    default: SALE_STATUS.COMPLETED
  },
  // Notes
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  // Cashier who created the sale
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  // Void information
  voidedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  voidedAt: {
    type: Date
  },
  voidReason: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for querying
saleSchema.index({ saleNumber: 1 });
saleSchema.index({ status: 1, createdAt: -1 });
saleSchema.index({ createdBy: 1, createdAt: -1 });
saleSchema.index({ createdAt: -1 });

// Virtual for total items count
saleSchema.virtual("itemCount").get(function() {
  return (this.items || []).reduce((sum, item) => sum + item.quantity, 0);
});

// Virtual for payment status
saleSchema.virtual("paymentStatus").get(function() {
  if ((this.amountPaid || 0) >= (this.grandTotal || 0)) return "PAID";
  if ((this.amountPaid || 0) > 0) return "PARTIAL";
  return "UNPAID";
});

// Static method to generate sale number
saleSchema.statics.generateSaleNumber = async function() {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  // Find the last sale number for today
  const lastSale = await this.findOne({
    saleNumber: { $regex: `^SL-${dateStr}` }
  }).sort({ saleNumber: -1 });

  let sequence = 1;
  if (lastSale) {
    const lastSequence = parseInt(lastSale.saleNumber.split("-")[2], 10);
    sequence = lastSequence + 1;
  }

  return `SL-${dateStr}-${sequence.toString().padStart(4, "0")}`;
};

// Static method to get daily summary
saleSchema.statics.getDailySummary = async function(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        status: SALE_STATUS.COMPLETED
      }
    },
    {
      $group: {
        _id: null,
        totalSales: { $sum: 1 },
        totalRevenue: { $sum: "$grandTotal" },
        totalDiscount: { $sum: "$discountTotal" },
        totalItems: { $sum: { $size: "$items" } },
        cashTotal: {
          $sum: {
            $reduce: {
              input: {
                $filter: {
                  input: "$payments",
                  as: "p",
                  cond: { $eq: ["$$p.method", "CASH"] }
                }
              },
              initialValue: 0,
              in: { $add: ["$$value", "$$this.amount"] }
            }
          }
        },
        cardTotal: {
          $sum: {
            $reduce: {
              input: {
                $filter: {
                  input: "$payments",
                  as: "p",
                  cond: { $eq: ["$$p.method", "CARD"] }
                }
              },
              initialValue: 0,
              in: { $add: ["$$value", "$$this.amount"] }
            }
          }
        }
      }
    }
  ]);

  // Get voided sales count
  const voidedCount = await this.countDocuments({
    createdAt: { $gte: startOfDay, $lte: endOfDay },
    status: SALE_STATUS.VOIDED
  });

  const summary = result[0] || {
    totalSales: 0,
    totalRevenue: 0,
    totalDiscount: 0,
    totalItems: 0,
    cashTotal: 0,
    cardTotal: 0
  };

  return {
    date: date.toISOString().slice(0, 10),
    ...summary,
    voidedSales: voidedCount
  };
};

export default mongoose.model("Sale", saleSchema);
