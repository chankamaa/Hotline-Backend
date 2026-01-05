import express from "express";
import {
  createCategory,
  getCategories,
  getCategory,
  updateCategory,
  deleteCategory
} from "../../controllers/product/categoryController.js";
import { authenticate } from "../../middlewares/auth/authenticate.js";
import { authorize } from "../../middlewares/auth/authorize.js";
import { PERMISSIONS } from "../../constants/permission.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Category CRUD
router.post("/", authorize(PERMISSIONS.CREATE_CATEGORY), createCategory);
router.get("/", authorize(PERMISSIONS.VIEW_CATEGORIES), getCategories);
router.get("/:id", authorize(PERMISSIONS.VIEW_CATEGORIES), getCategory);
router.put("/:id", authorize(PERMISSIONS.UPDATE_CATEGORY), updateCategory);
router.delete("/:id", authorize(PERMISSIONS.DELETE_CATEGORY), deleteCategory);

export default router;
