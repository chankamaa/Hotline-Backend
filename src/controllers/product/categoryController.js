import Category from "../../models/product/categoryModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create new category
 * POST /api/v1/categories
 */
export const createCategory = catchAsync(async (req, res, next) => {
  const { name, description, parent } = req.body;

  // Validate required fields
  if (!name) {
    return next(new AppError("Category name is required", 400));
  }

  // If parent is provided, verify it exists
  if (parent) {
    const parentCategory = await Category.findById(parent);
    if (!parentCategory) {
      return next(new AppError("Parent category not found", 404));
    }
    if (!parentCategory.isActive) {
      return next(new AppError("Cannot add subcategory to an inactive parent", 400));
    }
  }

  // Check for duplicate name under same parent
  const existingCategory = await Category.findOne({
    name: { $regex: new RegExp(`^${name}$`, "i") },
    parent: parent || null
  });

  if (existingCategory) {
    return next(new AppError("Category with this name already exists at this level", 400));
  }

  const category = await Category.create({
    name,
    description,
    parent: parent || null
  });

  // Populate parent if exists
  await category.populate("parent", "name");

  res.status(201).json({
    status: "success",
    data: { category }
  });
});

/**
 * Get all categories
 * GET /api/v1/categories
 * Query params:
 *   - tree=true: Returns hierarchical tree structure
 *   - rootOnly=true: Returns only main/root categories (no parent)
 *   - parent=id: Returns only subcategories of specified parent
 *   - includeInactive=true: Include inactive categories
 */
export const getCategories = catchAsync(async (req, res, next) => {
  const { tree, parent, rootOnly, includeInactive } = req.query;

  // Return tree structure
  if (tree === "true") {
    const categoryTree = await Category.getTree();
    return res.json({
      status: "success",
      data: { categories: categoryTree }
    });
  }

  // Build query
  const query = {};

  if (!includeInactive || includeInactive !== "true") {
    query.isActive = true;
  }

  // Filter: only root/main categories (no parent)
  if (rootOnly === "true") {
    query.parent = null;
  }
  // Filter: subcategories of a specific parent
  else if (parent) {
    query.parent = parent;
  }

  const categories = await Category.find(query)
    .populate("parent", "name")
    .sort({ name: 1 });

  res.json({
    status: "success",
    results: categories.length,
    data: { categories }
  });
});

/**
 * Get category by ID
 * GET /api/v1/categories/:id
 */
export const getCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findById(req.params.id)
    .populate("parent", "name")
    .populate({
      path: "subcategories",
      match: { isActive: true },
      select: "name description image"
    });

  if (!category) {
    return next(new AppError("Category not found", 404));
  }

  // Get full path
  const fullPath = await category.getFullPath();

  res.json({
    status: "success",
    data: {
      category: {
        ...category.toObject(),
        fullPath
      }
    }
  });
});

/**
 * Update category
 * PUT /api/v1/categories/:id
 */
export const updateCategory = catchAsync(async (req, res, next) => {
  const { name, description, parent, isActive } = req.body;

  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new AppError("Category not found", 404));
  }

  // If changing name, check for duplicates under same parent
  if (name && name !== category.name) {
    const targetParent = parent !== undefined ? parent : category.parent;
    const existingCategory = await Category.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      parent: targetParent,
      _id: { $ne: category._id }
    });

    if (existingCategory) {
      return next(new AppError("Category with this name already exists at this level", 400));
    }
  }

  // If changing parent, validate
  if (parent !== undefined && parent !== null) {
    // Cannot set parent to itself
    if (parent === req.params.id) {
      return next(new AppError("Category cannot be its own parent", 400));
    }

    // Verify parent exists
    const parentCategory = await Category.findById(parent);
    if (!parentCategory) {
      return next(new AppError("Parent category not found", 404));
    }

    // Check for circular reference (parent cannot be a child of this category)
    let currentParent = parentCategory;
    while (currentParent.parent) {
      if (currentParent.parent.toString() === req.params.id) {
        return next(new AppError("Cannot create circular category reference", 400));
      }
      currentParent = await Category.findById(currentParent.parent);
      if (!currentParent) break;
    }
  }

  // Update fields
  if (name) category.name = name;
  if (description !== undefined) category.description = description;
  if (parent !== undefined) category.parent = parent;
  if (typeof isActive === "boolean") category.isActive = isActive;

  await category.save();
  await category.populate("parent", "name");

  res.json({
    status: "success",
    data: { category }
  });
});

/**
 * Delete category (soft delete)
 * DELETE /api/v1/categories/:id
 */
export const deleteCategory = catchAsync(async (req, res, next) => {
  const category = await Category.findById(req.params.id);

  if (!category) {
    return next(new AppError("Category not found", 404));
  }

  // Check for subcategories
  const subcategories = await Category.find({ parent: category._id, isActive: true });
  if (subcategories.length > 0) {
    return next(new AppError(
      `Cannot delete category with ${subcategories.length} active subcategories. Delete or move subcategories first.`,
      400
    ));
  }

  // Soft delete
  category.isActive = false;
  await category.save();

  res.json({
    status: "success",
    message: "Category deactivated successfully"
  });
});
