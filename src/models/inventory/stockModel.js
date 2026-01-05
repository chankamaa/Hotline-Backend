import mongoose from "mongoose";

const stockSchema = new mongoose.Schema({
  // Reference to product (one stock record per product)
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
    unique: true
  },
  // Current stock quantity
  quantity: {
    type: Number,
    required: true,
    default: 0,
    min: [0, "Stock quantity cannot be negative"]
  },
  // Last time stock was updated
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for quick lookups
stockSchema.index({ product: 1 });
stockSchema.index({ quantity: 1 }); // For low stock queries

// Virtual to get stock value (quantity × product cost price)
stockSchema.virtual("stockValue", {
  ref: "Product",
  localField: "product",
  foreignField: "_id",
  justOne: true
});

// Method to calculate stock value
stockSchema.methods.getStockValue = async function() {
  if (!this.populated("product")) {
    await this.populate("product", "costPrice sellingPrice name");
  }
  
  if (this.product && this.product.costPrice) {
    return {
      costValue: this.quantity * this.product.costPrice,
      retailValue: this.quantity * this.product.sellingPrice
    };
  }
  return { costValue: 0, retailValue: 0 };
};

// Static method to get low stock products
stockSchema.statics.getLowStock = async function() {
  const Product = mongoose.model("Product");
  
  // Get all products with their min stock levels
  const products = await Product.find({ isActive: true }).select("_id minStockLevel name");
  
  const lowStockItems = [];
  
  for (const product of products) {
    const stock = await this.findOne({ product: product._id });
    const currentQty = stock ? stock.quantity : 0;
    
    if (currentQty <= product.minStockLevel) {
      lowStockItems.push({
        product: {
          _id: product._id,
          name: product.name
        },
        currentQuantity: currentQty,
        minStockLevel: product.minStockLevel,
        shortfall: product.minStockLevel - currentQty
      });
    }
  }
  
  return lowStockItems.sort((a, b) => b.shortfall - a.shortfall);
};

// Static method to get or create stock for a product
stockSchema.statics.getOrCreate = async function(productId) {
  let stock = await this.findOne({ product: productId });
  
  if (!stock) {
    stock = await this.create({
      product: productId,
      quantity: 0
    });
  }
  
  return stock;
};

export default mongoose.model("Stock", stockSchema);
