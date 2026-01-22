import express from "express";
import {
  createRepair,
  getRepairs,
  getMyRepairs,
  getRepair,
  getRepairByNumber,
  assignTechnician,
  startRepair,
  completeRepair,
  collectPayment,
  updateAdvancePayment,
  cancelRepair,
  getAvailableTechnicians,
  getDashboard
} from "../../controllers/repair/repairController.js";
import { authenticate } from "../../middlewares/auth/authenticate.js";
import { authorize } from "../../middlewares/auth/authorize.js";
import { PERMISSIONS } from "../../constants/permission.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Dashboard and utility routes
router.get("/dashboard", authorize(PERMISSIONS.VIEW_REPAIRS), getDashboard);
router.get("/technicians", authorize(PERMISSIONS.ASSIGN_REPAIR), getAvailableTechnicians);
router.get("/my-jobs", authorize(PERMISSIONS.VIEW_OWN_REPAIRS), getMyRepairs);
router.get("/number/:jobNumber", authorize(PERMISSIONS.VIEW_REPAIRS, PERMISSIONS.VIEW_OWN_REPAIRS), getRepairByNumber);

// CRUD routes
router.post("/", authorize(PERMISSIONS.CREATE_REPAIR), createRepair);
router.get("/", authorize(PERMISSIONS.VIEW_REPAIRS), getRepairs);
router.get("/:id", authorize(PERMISSIONS.VIEW_REPAIRS, PERMISSIONS.VIEW_OWN_REPAIRS), getRepair);

// Workflow routes
router.put("/:id/assign", authorize(PERMISSIONS.ASSIGN_REPAIR), assignTechnician);
router.put("/:id/start", authorize(PERMISSIONS.UPDATE_REPAIR), startRepair);
router.put("/:id/complete", authorize(PERMISSIONS.COMPLETE_REPAIR), completeRepair);
router.put("/:id/advance", authorize(PERMISSIONS.COLLECT_REPAIR_PAYMENT), updateAdvancePayment);
router.put("/:id/payment", authorize(PERMISSIONS.COLLECT_REPAIR_PAYMENT), collectPayment);
router.put("/:id/cancel", authorize(PERMISSIONS.CANCEL_REPAIR), cancelRepair);

export default router;
