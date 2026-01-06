import express from "express";
import {
  createSale,
  getSales,
  getSale,
  getSaleByNumber,
  voidSale,
  getDailySummary,
  getSalesReport
} from "../../controllers/sale/saleController.js";
import { authenticate } from "../../middlewares/auth/authenticate.js";
import { authorize } from "../../middlewares/auth/authorize.js";
import { PERMISSIONS } from "../../constants/permission.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Summary/Report routes (must come before /:id)
router.get("/daily", authorize(PERMISSIONS.VIEW_SALES), getDailySummary);
router.get("/report", authorize(PERMISSIONS.VIEW_SALES_REPORT), getSalesReport);
router.get("/number/:saleNumber", authorize(PERMISSIONS.VIEW_SALES), getSaleByNumber);

// Sale CRUD
router.post("/", authorize(PERMISSIONS.CREATE_SALE), createSale);
router.get("/", authorize(PERMISSIONS.VIEW_SALES), getSales);
router.get("/:id", authorize(PERMISSIONS.VIEW_SALES), getSale);
router.post("/:id/void", authorize(PERMISSIONS.VOID_SALE), voidSale);

export default router;
