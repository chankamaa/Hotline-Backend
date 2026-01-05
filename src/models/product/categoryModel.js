import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Category name is required"],
    trim: true,
    maxlength: [100, "Category name cannot exceed 100 characters"]
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, "Description cannot exceed 500 characters"]
  },
  // Parent category for hierarchical structure
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    default: null
  },
  // Category image URL
  image: {
    type: String,
    trim: true
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

// Virtual for subcategories
categorySchema.virtual("subcategories", {
  ref: "Category",
  localField: "_id",
  foreignField: "parent"
});

// Compound index to ensure unique name within same parent
categorySchema.index({ name: 1, parent: 1 }, { unique: true });

// Instance method to get full category path (e.g., "Electronics > Phones > Smartphones")
categorySchema.methods.getFullPath = async function() {
  const path = [this.name];
  let current = this;

  while (current.parent) {
    current = await mongoose.model("Category").findById(current.parent);
    if (current) {
      path.unshift(current.name);
    } else {
      break;
    }
  }

  return path.join(" > ");
};

// Static method to get category tree
categorySchema.statics.getTree = async function(parentId = null) {
  const categories = await this.find({ parent: parentId, isActive: true })
    .sort({ name: 1 });

  const tree = [];
  for (const category of categories) {
    const children = await this.getTree(category._id);
    tree.push({
      _id: category._id,
      name: category.name,
      description: category.description,
      image: category.image,
      subcategories: children
    });
  }

  return tree;
};

export default mongoose.model("Category", categorySchema);
