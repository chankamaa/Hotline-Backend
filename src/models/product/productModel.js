import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Product name is required"],
    trim: true,
    maxlength: [200, "Product name cannot exceed 200 characters"]
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, "Description cannot exceed 2000 characters"]
  },
  // Stock Keeping Unit - unique identifier for inventory
  sku: {
    type: String,
    unique: true,
    sparse: true, // Allows null values while maintaining uniqueness
    uppercase: true,
    trim: true,
    maxlength: [50, "SKU cannot exceed 50 characters"]
  },
  // Barcode for POS scanning
  barcode: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    maxlength: [50, "Barcode cannot exceed 50 characters"]
  },
  // Category reference (main category)
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    required: [true, "Product category is required"]
  },
  // Subcategory reference (optional)
  subcategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    default: null
  },
  // Pricing
  costPrice: {
    type: Number,
    required: [true, "Cost price is required"],
    min: [0, "Cost price cannot be negative"]
  },
  sellingPrice: {
    type: Number,
    required: [true, "Selling price is required"],
    min: [0, "Selling price cannot be negative"]
  },
  wholesalePrice: {
    type: Number,
    min: [0, "Wholesale price cannot be negative"],
    default: null
  },
  // Unit of measure
  unit: {
    type: String,
    enum: ["piece", "kg", "g", "liter", "ml", "meter", "cm", "box", "pack", "dozen"],
    default: "piece"
  },
  // Tax rate percentage
  taxRate: {
    type: Number,
    min: [0, "Tax rate cannot be negative"],
    max: [100, "Tax rate cannot exceed 100%"],
    default: 0
  },
  // Warranty information (default for this product)
  warrantyDuration: {
    type: Number,
    default: 0,
    min: [0, "Warranty duration cannot be negative"]
    // Duration in MONTHS (0 = no warranty)
  },
  warrantyType: {
    type: String,
    enum: ["NONE", "MANUFACTURER", "SHOP", "BOTH"],
    default: "NONE"
  },
  warrantyDescription: {
    type: String,
    trim: true,
    maxlength: [500, "Warranty description cannot exceed 500 characters"]
    // E.g., "Covers manufacturing defects only"
  },
  // Supplier information (for admin reference)
  supplier: {
    name: {
      type: String,
      trim: true,
      maxlength: [100, "Supplier name cannot exceed 100 characters"]
    },
    contact: {
      type: String,
      trim: true,
      maxlength: [100, "Contact person name cannot exceed 100 characters"]
    },
    phone: {
      type: String,
      trim: true,
      maxlength: [20, "Phone number cannot exceed 20 characters"]
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    }
  },
  // Minimum stock level for alerts
  minStockLevel: {
    type: Number,
    min: [0, "Minimum stock level cannot be negative"],
    default: 0
  },
  // Product-level offer/discount
  offer: {
    isActive: {
      type: Boolean,
      default: false
    },
    type: {
      type: String,
      enum: ["PERCENTAGE", "FIXED"],
      default: "PERCENTAGE"
    },
    value: {
      type: Number,
      min: [0, "Offer value cannot be negative"],
      default: 0
    },
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Offer description cannot exceed 200 characters"]
    }
  },
  // Soft delete
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Text index for search functionality
productSchema.index({ name: "text", description: "text", sku: "text" });

// Compound index for category filtering
productSchema.index({ category: 1, isActive: 1 });

// Index for barcode lookup (POS scanning)
productSchema.index({ barcode: 1 });

// Virtual to check if offer is currently active
productSchema.virtual("hasActiveOffer").get(function() {
  if (!this.offer || !this.offer.isActive) return false;

  const now = new Date();
  const startValid = !this.offer.startDate || now >= new Date(this.offer.startDate);
  const endValid = !this.offer.endDate || now <= new Date(this.offer.endDate);

  return startValid && endValid && this.offer.value > 0;
});

// Virtual for effective price (with offer applied)
productSchema.virtual("effectivePrice").get(function() {
  if (!this.hasActiveOffer) {
    return this.sellingPrice;
  }

  if (this.offer.type === "PERCENTAGE") {
    const discount = this.sellingPrice * (this.offer.value / 100);
    return Math.round((this.sellingPrice - discount) * 100) / 100;
  } else {
    // FIXED discount
    return Math.max(0, Math.round((this.sellingPrice - this.offer.value) * 100) / 100);
  }
});

// Virtual for discount amount
productSchema.virtual("discountAmount").get(function() {
  if (!this.hasActiveOffer) return 0;
  return Math.round((this.sellingPrice - this.effectivePrice) * 100) / 100;
});

// Virtual for profit margin
productSchema.virtual("profitMargin").get(function() {
  if (this.costPrice && this.sellingPrice && this.costPrice > 0) {
    return ((this.sellingPrice - this.costPrice) / this.costPrice * 100).toFixed(2);
  }
  return 0;
});

// Virtual for price with tax
productSchema.virtual("sellingPriceWithTax").get(function() {
  if (this.sellingPrice && this.taxRate) {
    return (this.sellingPrice * (1 + this.taxRate / 100)).toFixed(2);
  }
  return this.sellingPrice;
});

// Pre-save hook to generate SKU if not provided
productSchema.pre("save", async function() {
  if (!this.sku && this.isNew) {
    // Generate SKU from category and timestamp
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.sku = `PRD-${timestamp}-${random}`;
  }
});

// Static method for quick search (POS lookup)
productSchema.statics.quickSearch = async function(query) {
  if (!query || query.length < 1) {
    return [];
  }

  // Search by exact barcode first
  const byBarcode = await this.findOne({
    barcode: query,
    isActive: true
  }).populate(["category", "subcategory"]);

  if (byBarcode) {
    return [byBarcode];
  }

  // Search by exact SKU
  const bySku = await this.findOne({
    sku: query.toUpperCase(),
    isActive: true
  }).populate(["category", "subcategory"]);

  if (bySku) {
    return [bySku];
  }

  // Text search on name/description
  const results = await this.find({
    $and: [
      { isActive: true },
      {
        $or: [
          { name: { $regex: query, $options: "i" } },
          { sku: { $regex: query, $options: "i" } }
        ]
      }
    ]
  })
    .populate(["category", "subcategory"])
    .limit(10);

  return results;
};

export default mongoose.model("Product", productSchema);
