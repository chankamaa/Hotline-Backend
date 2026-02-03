/**
 * Bulk Import Controller
 * Handles CSV template download and bulk product import
 */

import multer from "multer";
import Product from "../../models/product/productModel.js";
import Category from "../../models/product/categoryModel.js";
import Stock from "../../models/inventory/stockModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";
import { 
  generateTemplate, 
  parseAndValidateCSV 
} from "../../utils/csvParser.js";

// Configure multer for file upload (memory storage for CSV)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || 
        file.originalname.endsWith(".csv") ||
        file.mimetype === "application/vnd.ms-excel") {
      cb(null, true);
    } else {
      cb(new AppError("Only CSV files are allowed", 400), false);
    }
  }
});

export const uploadCSV = upload.single("file");

/**
 * Download CSV template
 * GET /api/v1/products/bulk/template
 */
export const downloadTemplate = catchAsync(async (req, res) => {
  const template = generateTemplate();
  
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=product_import_template.csv");
  res.send(template);
});

/**
 * Get or create category by name
 */
const getOrCreateCategory = async (categoryName, parentId = null) => {
  if (!categoryName) return null;
  
  const query = { name: { $regex: new RegExp(`^${categoryName}$`, "i") } };
  if (parentId) {
    query.parent = parentId;
  } else {
    query.parent = { $exists: false };
  }
  
  let category = await Category.findOne(query);
  
  if (!category) {
    category = await Category.create({
      name: categoryName,
      parent: parentId || undefined,
      isActive: true
    });
  }
  
  return category;
};

/**
 * Process a single product row
 */
const processProductRow = async (rowData, mode, stockMode, createdBy) => {
  const {
    name, sku, barcode, category: categoryName, subcategory: subcategoryName,
    costPrice, sellingPrice, wholesalePrice, stockQuantity, unit,
    taxRate, minStockLevel, warrantyMonths, warrantyType,
    offerType, offerValue, offerEndDate, description
  } = rowData;

  // Get or create category
  const category = await getOrCreateCategory(categoryName);
  if (!category) {
    throw new Error("Failed to create category");
  }

  // Get or create subcategory if provided
  let subcategory = null;
  if (subcategoryName) {
    subcategory = await getOrCreateCategory(subcategoryName, category._id);
  }

  // Check if product exists (by SKU)
  let product = await Product.findOne({ sku });
  let isNew = false;
  let stockUpdated = false;

  if (product) {
    // Product exists
    if (mode === "create") {
      // Skip existing products in create mode
      return { 
        action: "skipped", 
        reason: "Product with this SKU already exists",
        sku 
      };
    }

    // Update existing product
    product.name = name;
    product.description = description || product.description;
    product.costPrice = costPrice;
    product.sellingPrice = sellingPrice;
    if (wholesalePrice) product.wholesalePrice = wholesalePrice;
    product.category = category._id;
    if (subcategory) product.subcategory = subcategory._id;
    if (barcode) product.barcode = barcode;
    if (unit) product.unit = unit;
    if (taxRate !== undefined) product.taxRate = taxRate;
    if (minStockLevel !== undefined) product.minStockLevel = minStockLevel;
    if (warrantyMonths) product.warrantyDuration = warrantyMonths;
    if (warrantyType) product.warrantyType = warrantyType;

    // Handle offer
    if (offerType && offerValue) {
      product.offer = {
        isActive: true,
        type: offerType,
        value: offerValue,
        endDate: offerEndDate || null,
        description: `${offerValue}${offerType === "PERCENTAGE" ? "%" : " Rs"} off`
      };
    }

    await product.save();

  } else {
    // Create new product
    isNew = true;
    const productData = {
      name,
      sku,
      barcode: barcode || undefined,
      category: category._id,
      subcategory: subcategory?._id,
      costPrice,
      sellingPrice,
      wholesalePrice: wholesalePrice || undefined,
      unit: unit || "pcs",
      taxRate: taxRate || 0,
      minStockLevel: minStockLevel || 5,
      warrantyDuration: warrantyMonths || undefined,
      warrantyType: warrantyType || undefined,
      description: description || undefined,
      isActive: true
    };

    // Add offer if provided
    if (offerType && offerValue) {
      productData.offer = {
        isActive: true,
        type: offerType,
        value: offerValue,
        endDate: offerEndDate || null,
        description: `${offerValue}${offerType === "PERCENTAGE" ? "%" : " Rs"} off`
      };
    }

    product = await Product.create(productData);
  }

  // Handle stock
  if (stockQuantity !== undefined && stockQuantity !== null) {
    let stock = await Stock.findOne({ product: product._id });

    if (stock) {
      if (stockMode === "add") {
        stock.currentStock += stockQuantity;
      } else {
        // replace mode
        stock.currentStock = stockQuantity;
      }
      stock.lastRestockDate = new Date();
      stock.lastRestockBy = createdBy;
      await stock.save();
      stockUpdated = true;
    } else {
      // Create new stock record
      await Stock.create({
        product: product._id,
        currentStock: stockQuantity,
        lastRestockDate: new Date(),
        lastRestockBy: createdBy
      });
      stockUpdated = true;
    }
  }

  return {
    action: isNew ? "created" : "updated",
    productId: product._id,
    sku: product.sku,
    name: product.name,
    stockUpdated,
    categoryCreated: !await Category.findOne({ name: categoryName, createdAt: { $lt: new Date(Date.now() - 1000) } })
  };
};

/**
 * Bulk import products from CSV
 * POST /api/v1/products/bulk/import
 * Query params:
 *   - mode: "create" (only new) or "update" (create + update existing) - default: "update"
 *   - stockMode: "add" (add to existing) or "replace" (replace stock) - default: "replace"
 */
export const bulkImportProducts = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError("Please upload a CSV file", 400));
  }

  const mode = req.query.mode || "update";
  const stockMode = req.query.stockMode || "replace";

  if (!["create", "update"].includes(mode)) {
    return next(new AppError("mode must be 'create' or 'update'", 400));
  }
  if (!["add", "replace"].includes(stockMode)) {
    return next(new AppError("stockMode must be 'add' or 'replace'", 400));
  }

  const csvContent = req.file.buffer.toString("utf-8");
  
  // Parse and validate CSV
  const { valid, invalid, totalRows } = parseAndValidateCSV(csvContent);

  if (totalRows === 0) {
    return next(new AppError("CSV file is empty or has no valid rows", 400));
  }

  // Track results
  const summary = {
    totalRows,
    productsCreated: 0,
    productsUpdated: 0,
    productsSkipped: 0,
    productsFailed: invalid.length,
    categoriesCreated: 0,
    stockUpdated: 0
  };

  const imported = [];
  const errors = [...invalid.map(i => ({
    row: i.row,
    sku: i.sku,
    errors: i.errors
  }))];

  // Track categories created during this import
  const categoriesBeforeImport = await Category.countDocuments();

  // Process valid rows
  for (const item of valid) {
    try {
      const result = await processProductRow(
        item.data, 
        mode, 
        stockMode, 
        req.user._id
      );

      if (result.action === "created") {
        summary.productsCreated++;
      } else if (result.action === "updated") {
        summary.productsUpdated++;
      } else if (result.action === "skipped") {
        summary.productsSkipped++;
      }

      if (result.stockUpdated) {
        summary.stockUpdated++;
      }

      imported.push({
        row: item.row,
        sku: result.sku,
        name: result.name,
        action: result.action
      });

    } catch (err) {
      summary.productsFailed++;
      errors.push({
        row: item.row,
        sku: item.data.sku,
        errors: [err.message]
      });
    }
  }

  // Count categories created
  const categoriesAfterImport = await Category.countDocuments();
  summary.categoriesCreated = categoriesAfterImport - categoriesBeforeImport;

  res.status(200).json({
    status: "success",
    data: {
      summary,
      imported,
      errors: errors.length > 0 ? errors : undefined
    }
  });
});
