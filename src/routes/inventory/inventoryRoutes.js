import express from "express";
import {
  getStock,
  getProductStock,
  adjustStock,
  getLowStock,
  getStockHistory,
  getInventoryValue,
  getAdjustmentTypes
} from "../../controllers/inventory/inventoryController.js";
import { authenticate } from "../../middlewares/auth/authenticate.js";
import { authorize } from "../../middlewares/auth/authorize.js";
import { PERMISSIONS } from "../../constants/permission.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Read-only routes (VIEW_INVENTORY permission)
router.get("/", authorize(PERMISSIONS.VIEW_INVENTORY), getStock);
router.get("/low-stock", authorize(PERMISSIONS.VIEW_INVENTORY), getLowStock);
router.get("/value", authorize(PERMISSIONS.VIEW_INVENTORY), getInventoryValue);
router.get("/adjustment-types", authorize(PERMISSIONS.VIEW_INVENTORY), getAdjustmentTypes);
router.get("/:productId", authorize(PERMISSIONS.VIEW_INVENTORY), getProductStock);
router.get("/:productId/history", authorize(PERMISSIONS.VIEW_INVENTORY), getStockHistory);

// Write routes (MANAGE_INVENTORY permission)
router.post("/adjust", authorize(PERMISSIONS.MANAGE_INVENTORY), adjustStock);

export default router;
