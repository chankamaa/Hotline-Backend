import express from "express";
import {
  getSalesSummary,
  getProfitReport,
  getSalesByCategory,
  getSalesByCashier,
  getTopProducts,
  getReturnAnalytics,
  getRepairSummary
} from "../../controllers/report/reportController.js";
import { authenticate } from "../../middlewares/auth/authenticate.js";
import { authorize } from "../../middlewares/auth/authorize.js";
import { PERMISSIONS } from "../../constants/permission.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Sales summary (daily/weekly/monthly/yearly)
router.get("/sales-summary", authorize(PERMISSIONS.VIEW_SALES_REPORT), getSalesSummary);

// Profit report
router.get("/profit", authorize(PERMISSIONS.VIEW_PROFIT_REPORT), getProfitReport);

// Sales by category
router.get("/by-category", authorize(PERMISSIONS.VIEW_SALES_REPORT), getSalesByCategory);

// Sales by cashier
router.get("/by-cashier", authorize(PERMISSIONS.VIEW_SALES_REPORT), getSalesByCashier);

// Top selling products
router.get("/top-products", authorize(PERMISSIONS.VIEW_SALES_REPORT), getTopProducts);

// Return analytics
router.get("/returns", authorize(PERMISSIONS.VIEW_SALES_REPORT), getReturnAnalytics);

// Repair summary
router.get("/repairs", authorize(PERMISSIONS.VIEW_REPAIRS), getRepairSummary);

export default router;
