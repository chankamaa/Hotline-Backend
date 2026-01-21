import express from "express";
import { authenticate } from "../../middlewares/auth/authenticate.js";
import { authorize } from "../../middlewares/auth/authorize.js";
import { PERMISSIONS } from "../../constants/permission.js";
import {
  createWarranty,
  getWarranties,
  getWarranty,
  getWarrantyByNumber,
  searchByCustomer,
  checkWarrantyStatus,
  createClaim,
  updateClaim,
  voidWarranty,
  getExpiringSoon,
  getWarrantyStats,
  getWarrantyTypes
} from "../../controllers/warranty/warrantyController.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Static routes (must be before dynamic :id routes)
router.get("/types", getWarrantyTypes);
router.get("/expiring", authorize(PERMISSIONS.VIEW_WARRANTY_REPORTS), getExpiringSoon);
router.get("/stats", authorize(PERMISSIONS.VIEW_WARRANTY_REPORTS), getWarrantyStats);
router.get("/number/:warrantyNumber", authorize(PERMISSIONS.VIEW_WARRANTIES), getWarrantyByNumber);
router.get("/customer/:phone", authorize(PERMISSIONS.VIEW_WARRANTIES), searchByCustomer);

// Main CRUD routes
router.route("/")
  .get(authorize(PERMISSIONS.VIEW_WARRANTIES), getWarranties)
  .post(authorize(PERMISSIONS.CREATE_WARRANTY), createWarranty);

// Single warranty routes
router.route("/:id")
  .get(authorize(PERMISSIONS.VIEW_WARRANTIES), getWarranty);

// Warranty status check
router.get("/:id/status", authorize(PERMISSIONS.VIEW_WARRANTIES), checkWarrantyStatus);

// Warranty claims
router.post("/:id/claims", authorize(PERMISSIONS.CREATE_WARRANTY_CLAIM), createClaim);
router.put("/:id/claims/:claimId", authorize(PERMISSIONS.UPDATE_WARRANTY), updateClaim);

// Void warranty
router.post("/:id/void", authorize(PERMISSIONS.VOID_WARRANTY), voidWarranty);

export default router;
