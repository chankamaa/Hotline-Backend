import express from "express";
import {
  createProduct,
  getProducts,
  searchProducts,
  getProduct,
  getProductByBarcode,
  updateProduct,
  deleteProduct,
  getProductsByCategory
} from "../../controllers/product/productController.js";
import {
  downloadTemplate,
  uploadCSV,
  bulkImportProducts
} from "../../controllers/product/bulkImportController.js";
import { authenticate } from "../../middlewares/auth/authenticate.js";
import { authorize } from "../../middlewares/auth/authorize.js";
import { PERMISSIONS } from "../../constants/permission.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Bulk import routes (must come before /:id to avoid conflicts)
router.get("/bulk/template", authorize(PERMISSIONS.BULK_IMPORT_PRODUCTS), downloadTemplate);
router.post("/bulk/import", authorize(PERMISSIONS.BULK_IMPORT_PRODUCTS), uploadCSV, bulkImportProducts);

// Search routes (must come before /:id to avoid conflicts)
router.get("/search", authorize(PERMISSIONS.VIEW_PRODUCTS), searchProducts);
router.get("/barcode/:barcode", authorize(PERMISSIONS.VIEW_PRODUCTS), getProductByBarcode);
router.get("/category/:categoryId", authorize(PERMISSIONS.VIEW_PRODUCTS), getProductsByCategory);

// Product CRUD
router.post("/", authorize(PERMISSIONS.CREATE_PRODUCT), createProduct);
router.get("/", authorize(PERMISSIONS.VIEW_PRODUCTS), getProducts);
router.get("/:id", authorize(PERMISSIONS.VIEW_PRODUCTS), getProduct);
router.put("/:id", authorize(PERMISSIONS.UPDATE_PRODUCT), updateProduct);
router.delete("/:id", authorize(PERMISSIONS.DELETE_PRODUCT), deleteProduct);

export default router;

