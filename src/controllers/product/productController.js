import Product from "../../models/product/productModel.js";
import Category from "../../models/product/categoryModel.js";
import Stock from "../../models/inventory/stockModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create new product
 * POST /api/v1/products
 */
export const createProduct = catchAsync(async (req, res, next) => {
  const {
    name, description, sku, barcode, category, subcategory,
    costPrice, sellingPrice, wholesalePrice,
    unit, taxRate, minStockLevel,
    warrantyDuration, warrantyType, warrantyDescription,
    supplier, offer
  } = req.body;

  // Validate required fields
  if (!name || !category || costPrice === undefined || sellingPrice === undefined) {
    return next(new AppError("Name, category, cost price, and selling price are required", 400));
  }

  // Verify category exists and is active
  const categoryExists = await Category.findById(category);
  if (!categoryExists) {
    return next(new AppError("Category not found", 404));
  }
  if (!categoryExists.isActive) {
    return next(new AppError("Cannot add product to an inactive category", 400));
  }

  // Check for duplicate SKU
  if (sku) {
    const existingSku = await Product.findOne({ sku: sku.toUpperCase() });
    if (existingSku) {
      return next(new AppError("Product with this SKU already exists", 400));
    }
  }

  // Check for duplicate barcode
  if (barcode) {
    const existingBarcode = await Product.findOne({ barcode });
    if (existingBarcode) {
      return next(new AppError("Product with this barcode already exists", 400));
    }
  }

  // If subcategory is provided, verify it exists and is a child of the main category
  if (subcategory) {
    const subcategoryExists = await Category.findById(subcategory);
    if (!subcategoryExists) {
      return next(new AppError("Subcategory not found", 404));
    }
    if (!subcategoryExists.isActive) {
      return next(new AppError("Cannot add product to an inactive subcategory", 400));
    }
    // Verify subcategory is a child of the main category
    if (!subcategoryExists.parent || subcategoryExists.parent.toString() !== category) {
      return next(new AppError("Subcategory must be a child of the selected main category", 400));
    }
  }

  const product = await Product.create({
    name,
    description,
    sku: sku ? sku.toUpperCase() : undefined,
    barcode,
    category,
    subcategory: subcategory || null,
    costPrice,
    sellingPrice,
    wholesalePrice,
    unit,
    taxRate,
    minStockLevel,
    warrantyDuration,
    warrantyType,
    warrantyDescription,
    supplier,
    offer: offer ? {
      isActive: offer.isActive || false,
      type: offer.type || "PERCENTAGE",
      value: offer.value || 0,
      startDate: offer.startDate || null,
      endDate: offer.endDate || null,
      description: offer.description || null
    } : undefined
  });

  await product.populate(["category", "subcategory"]);

  res.status(201).json({
    status: "success",
    data: { product }
  });
});

/**
 * Get all products with filtering and pagination
 * GET /api/v1/products
 * Query params:
 *   - category: Filter by category ID
 *   - search: Search in name, SKU
 *   - minPrice, maxPrice: Price range filter
 *   - isActive: Filter by active status
 *   - page, limit: Pagination
 *   - sort: Sort field (e.g., "name", "-sellingPrice")
 *   - includeStock: Include stock data (default: true for POS)
 */
export const getProducts = catchAsync(async (req, res, next) => {
  const {
    category, search, minPrice, maxPrice,
    isActive, page = 1, limit = 20, sort = "name",
    includeStock = "true"
  } = req.query;

  // Build query
  const query = {};

  // Category filter
  if (category) {
    query.category = category;
  }

  // Search filter
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { sku: { $regex: search, $options: "i" } },
      { barcode: search }
    ];
  }

  // Price range filter
  if (minPrice || maxPrice) {
    query.sellingPrice = {};
    if (minPrice) query.sellingPrice.$gte = Number(minPrice);
    if (maxPrice) query.sellingPrice.$lte = Number(maxPrice);
  }

  // Active status filter (default to active only)
  if (isActive !== undefined) {
    query.isActive = isActive === "true";
  } else {
    query.isActive = true;
  }

  // Pagination
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = parseInt(limit, 10) || 20;
  const skip = (pageNum - 1) * limitNum;

  // Execute query
  const [products, total] = await Promise.all([
    Product.find(query)
      .populate(["category", "subcategory"])
      .sort(sort)
      .skip(skip)
      .limit(limitNum),
    Product.countDocuments(query)
  ]);

  // Include stock data if requested
  let productsWithStock = products;
  if (includeStock === "true") {
    // Get all stock records for these products in one query
    const productIds = products.map(p => p._id);
    const stockRecords = await Stock.find({ product: { $in: productIds } });

    // Create a map for quick lookup
    const stockMap = new Map();
    stockRecords.forEach(s => {
      stockMap.set(s.product.toString(), s.quantity);
    });

    // Add stock to each product
    productsWithStock = products.map(p => {
      const productObj = p.toObject();
      const stockQty = stockMap.get(p._id.toString()) ?? 0;

      return {
        ...productObj,
        stock: stockQty,
        stockStatus: stockQty === 0
          ? "OUT_OF_STOCK"
          : stockQty <= (p.minStockLevel || 5)
            ? "LOW_STOCK"
            : "IN_STOCK"
      };
    });
  }

  res.json({
    status: "success",
    results: productsWithStock.length,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    },
    data: { products: productsWithStock }
  });
});

/**
 * Quick search for POS
 * GET /api/v1/products/search?q=query
 */
export const searchProducts = catchAsync(async (req, res, next) => {
  const { q } = req.query;

  if (!q || q.length < 1) {
    return res.json({
      status: "success",
      results: 0,
      data: { products: [] }
    });
  }

  const products = await Product.quickSearch(q);

  res.json({
    status: "success",
    results: products.length,
    data: { products }
  });
});

/**
 * Get product by ID
 * GET /api/v1/products/:id
 */
export const getProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.params.id)
    .populate(["category", "subcategory"]);

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  res.json({
    status: "success",
    data: { product }
  });
});

/**
 * Get product by barcode (for POS scanning)
 * GET /api/v1/products/barcode/:barcode
 */
export const getProductByBarcode = catchAsync(async (req, res, next) => {
  const product = await Product.findOne({
    barcode: req.params.barcode,
    isActive: true
  }).populate(["category", "subcategory"]);

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  res.json({
    status: "success",
    data: { product }
  });
});

/**
 * Update product
 * PUT /api/v1/products/:id
 */
export const updateProduct = catchAsync(async (req, res, next) => {
  const {
    name, description, sku, barcode, category, subcategory,
    costPrice, sellingPrice, wholesalePrice,
    unit, taxRate, minStockLevel, isActive,
    warrantyDuration, warrantyType, warrantyDescription,
    supplier, offer
  } = req.body;

  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  // If changing category, verify it exists
  if (category && category !== product.category.toString()) {
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      return next(new AppError("Category not found", 404));
    }
    if (!categoryExists.isActive) {
      return next(new AppError("Cannot move product to an inactive category", 400));
    }
  }

  // If changing SKU, check for duplicates
  if (sku && sku.toUpperCase() !== product.sku) {
    const existingSku = await Product.findOne({
      sku: sku.toUpperCase(),
      _id: { $ne: product._id }
    });
    if (existingSku) {
      return next(new AppError("Product with this SKU already exists", 400));
    }
  }

  // If changing barcode, check for duplicates
  if (barcode && barcode !== product.barcode) {
    const existingBarcode = await Product.findOne({
      barcode,
      _id: { $ne: product._id }
    });
    if (existingBarcode) {
      return next(new AppError("Product with this barcode already exists", 400));
    }
  }

  // If changing subcategory, validate it
  if (subcategory !== undefined) {
    if (subcategory) {
      const subcategoryExists = await Category.findById(subcategory);
      if (!subcategoryExists) {
        return next(new AppError("Subcategory not found", 404));
      }
      // Use the new category if provided, otherwise use existing
      const parentCatId = category || product.category.toString();
      if (!subcategoryExists.parent || subcategoryExists.parent.toString() !== parentCatId) {
        return next(new AppError("Subcategory must be a child of the selected main category", 400));
      }
    }
    product.subcategory = subcategory;
  }

  // Update fields
  if (name) product.name = name;
  if (description !== undefined) product.description = description;
  if (sku) product.sku = sku.toUpperCase();
  if (barcode !== undefined) product.barcode = barcode;
  if (category) product.category = category;
  if (costPrice !== undefined) product.costPrice = costPrice;
  if (sellingPrice !== undefined) product.sellingPrice = sellingPrice;
  if (wholesalePrice !== undefined) product.wholesalePrice = wholesalePrice;
  if (unit) product.unit = unit;
  if (taxRate !== undefined) product.taxRate = taxRate;
  if (minStockLevel !== undefined) product.minStockLevel = minStockLevel;
  if (warrantyDuration !== undefined) product.warrantyDuration = warrantyDuration;
  if (warrantyType !== undefined) product.warrantyType = warrantyType;
  if (warrantyDescription !== undefined) product.warrantyDescription = warrantyDescription;
  if (supplier !== undefined) product.supplier = supplier;
  if (typeof isActive === "boolean") product.isActive = isActive;
  // Handle offer updates
  if (offer !== undefined) {
    if (offer === null) {
      product.offer = { isActive: false, type: "PERCENTAGE", value: 0 };
    } else {
      product.offer = {
        isActive: offer.isActive !== undefined ? offer.isActive : (product.offer?.isActive || false),
        type: offer.type || product.offer?.type || "PERCENTAGE",
        value: offer.value !== undefined ? offer.value : (product.offer?.value || 0),
        startDate: offer.startDate !== undefined ? offer.startDate : product.offer?.startDate,
        endDate: offer.endDate !== undefined ? offer.endDate : product.offer?.endDate,
        description: offer.description !== undefined ? offer.description : product.offer?.description
      };
    }
  }

  await product.save();
  await product.populate(["category", "subcategory"]);

  res.json({
    status: "success",
    data: { product }
  });
});

/**
 * Delete product (soft delete)
 * DELETE /api/v1/products/:id
 */
export const deleteProduct = catchAsync(async (req, res, next) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return next(new AppError("Product not found", 404));
  }

  // Soft delete
  product.isActive = false;
  await product.save();

  res.json({
    status: "success",
    message: "Product deactivated successfully"
  });
});

/**
 * Get products by category
 * GET /api/v1/products/category/:categoryId
 */
export const getProductsByCategory = catchAsync(async (req, res, next) => {
  const products = await Product.find({
    category: req.params.categoryId,
    isActive: true
  })
    .populate(["category", "subcategory"])
    .sort("name");

  res.json({
    status: "success",
    results: products.length,
    data: { products }
  });
});
