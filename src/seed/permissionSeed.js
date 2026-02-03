import { configDotenv } from "dotenv";
configDotenv();
import { connectDB } from "../config/db.js";
import Permission from "../models/auth/permissionModel.js";
import { PERMISSIONS, PERMISSION_CATEGORIES } from "../constants/permission.js";
import mongoose from "mongoose";

await connectDB();

// Permission descriptions
const PERMISSION_DESCRIPTIONS = {
  CREATE_SALE: "Create new sales transactions",
  VOID_SALE: "Void/cancel existing sales",
  VIEW_SALES: "View sales history and details",
  APPLY_DISCOUNT: "Apply discounts to sales",
  CREATE_RETURN: "Create product returns and refunds",
  VIEW_RETURNS: "View return history and details",
  VIEW_PROFIT_REPORT: "View profit reports",
  VIEW_SALES_REPORT: "View sales reports",
  EXPORT_REPORTS: "Export reports to file",
  CREATE_USER: "Create new users",
  VIEW_USERS: "View user list and details",
  UPDATE_USER: "Update user information",
  DELETE_USER: "Delete/deactivate users",
  UPDATE_OWN_PROFILE: "Update own profile (username, password)",
  MANAGE_ROLES: "Create, update, delete roles",
  ASSIGN_ROLES: "Assign roles to users",
  MANAGE_PERMISSIONS: "View and manage permissions",
  ASSIGN_PERMISSIONS: "Assign direct permissions to users",
  CREATE_CATEGORY: "Create new product categories",
  VIEW_CATEGORIES: "View product categories",
  UPDATE_CATEGORY: "Update product categories",
  DELETE_CATEGORY: "Delete/deactivate product categories",
  CREATE_PRODUCT: "Create new products",
  VIEW_PRODUCTS: "View product catalog",
  UPDATE_PRODUCT: "Update product details and pricing",
  DELETE_PRODUCT: "Delete/deactivate products",
  BULK_IMPORT_PRODUCTS: "Bulk import products from CSV file",
  MANAGE_INVENTORY: "Add, update, delete inventory items",
  VIEW_INVENTORY: "View inventory list",
  CREATE_REPAIR: "Create new repair jobs",
  VIEW_REPAIRS: "View all repair jobs",
  VIEW_OWN_REPAIRS: "View own assigned repair jobs",
  ASSIGN_REPAIR: "Assign repair jobs to technicians",
  UPDATE_REPAIR: "Update repair job status and details",
  COMPLETE_REPAIR: "Mark repair job as completed",
  COLLECT_REPAIR_PAYMENT: "Collect payment for repairs",
  CANCEL_REPAIR: "Cancel repair jobs",
  CREATE_WARRANTY: "Create new warranty records",
  VIEW_WARRANTIES: "View warranty list and details",
  UPDATE_WARRANTY: "Update warranty information",
  VOID_WARRANTY: "Void warranties",
  CREATE_WARRANTY_CLAIM: "Create warranty claims",
  VIEW_WARRANTY_REPORTS: "View warranty reports and statistics",
  MANAGE_SETTINGS: "Manage system settings",
  MANAGE_PROMOTIONS: "Create, update, delete promotional offers",
  VIEW_PROMOTIONS: "View promotions and offers",
};

// Get category for a permission
const getCategory = (permCode) => {
  for (const [category, perms] of Object.entries(PERMISSION_CATEGORIES)) {
    if (perms.includes(permCode)) {
      return category;
    }
  }
  return "SETTINGS"; // Default category
};

console.log("Seeding permissions...");

const perms = Object.values(PERMISSIONS);
for (const code of perms) {
  await Permission.updateOne(
    { code },
    {
      $setOnInsert: {
        code,
        description: PERMISSION_DESCRIPTIONS[code] || "",
        category: getCategory(code),
      },
    },
    { upsert: true }
  );
  console.log(`  ✓ ${code}`);
}

console.log(`\n✅ Seeded ${perms.length} permissions successfully!`);

await mongoose.disconnect();
