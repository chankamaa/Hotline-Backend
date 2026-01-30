import { configDotenv } from "dotenv";
configDotenv();
import { connectDB } from "../config/db.js";

import Role from "../models/auth/roleModel.js";
import Permission from "../models/auth/permissionModel.js";
import { ROLES } from "../constants/role.js";
import { PERMISSIONS } from "../constants/permission.js";
import mongoose from "mongoose";

await connectDB();

// Role-Permission mappings
const ROLE_PERMISSIONS = {
  ADMIN: Object.values(PERMISSIONS), // Admin gets ALL permissions

  MANAGER: [
    PERMISSIONS.CREATE_SALE,
    PERMISSIONS.VOID_SALE,
    PERMISSIONS.VIEW_SALES,
    PERMISSIONS.APPLY_DISCOUNT,
    PERMISSIONS.VIEW_PROFIT_REPORT,
    PERMISSIONS.VIEW_SALES_REPORT,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.ASSIGN_ROLES,
    PERMISSIONS.UPDATE_OWN_PROFILE,
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.MANAGE_INVENTORY,
    PERMISSIONS.CREATE_CATEGORY,
    PERMISSIONS.VIEW_CATEGORIES,
    PERMISSIONS.UPDATE_CATEGORY,
    PERMISSIONS.DELETE_CATEGORY,
    PERMISSIONS.CREATE_PRODUCT,
    PERMISSIONS.VIEW_PRODUCTS,
    PERMISSIONS.UPDATE_PRODUCT,
    PERMISSIONS.DELETE_PRODUCT,
    // Repair permissions for Manager
    PERMISSIONS.CREATE_REPAIR,
    PERMISSIONS.VIEW_REPAIRS,
    PERMISSIONS.ASSIGN_REPAIR,
    PERMISSIONS.COLLECT_REPAIR_PAYMENT,
    PERMISSIONS.CANCEL_REPAIR,
    // Warranty permissions for Manager
    PERMISSIONS.VIEW_WARRANTIES,
    PERMISSIONS.CREATE_WARRANTY_CLAIM,
    PERMISSIONS.VIEW_WARRANTY_REPORTS,
    // Return permissions for Manager
    PERMISSIONS.CREATE_RETURN,
    PERMISSIONS.VIEW_RETURNS,
    // Promotion permissions for Manager
    PERMISSIONS.MANAGE_PROMOTIONS,
    PERMISSIONS.VIEW_PROMOTIONS,
  ],

  CASHIER: [
    PERMISSIONS.CREATE_SALE,
    PERMISSIONS.VIEW_SALES,
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.VIEW_CATEGORIES,
    PERMISSIONS.VIEW_PRODUCTS,
    // Repair permissions for Cashier (view and collect payment only)
    PERMISSIONS.VIEW_REPAIRS,
    PERMISSIONS.COLLECT_REPAIR_PAYMENT,
    // Warranty permissions for Cashier
    PERMISSIONS.VIEW_WARRANTIES,
    PERMISSIONS.CREATE_WARRANTY_CLAIM,
    // Return permissions for Cashier
    PERMISSIONS.CREATE_RETURN,
    PERMISSIONS.VIEW_RETURNS,
    // Promotion permissions for Cashier (view only)
    PERMISSIONS.VIEW_PROMOTIONS,
    // Discount permissions for Cashier
    PERMISSIONS.APPLY_DISCOUNT,
  ],

  TECHNICIAN: [
    PERMISSIONS.VIEW_INVENTORY,
    PERMISSIONS.VIEW_CATEGORIES,
    PERMISSIONS.VIEW_PRODUCTS,
    // Repair permissions for Technician
    PERMISSIONS.VIEW_OWN_REPAIRS,
    PERMISSIONS.UPDATE_REPAIR,
    PERMISSIONS.COMPLETE_REPAIR,
    PERMISSIONS.CREATE_REPAIR,
    // Warranty permissions for Technician
    PERMISSIONS.VIEW_WARRANTIES,
  ],
};

// Role descriptions
const ROLE_DESCRIPTIONS = {
  ADMIN: "Full system access with all permissions",
  MANAGER: "Manage sales, reports, inventory and assign roles",
  CASHIER: "Process sales transactions",
  TECHNICIAN: "Handle device repairs and view inventory",
};

console.log("Seeding roles...");

for (const roleName of Object.values(ROLES)) {
  // Get permission IDs for this role
  const permCodes = ROLE_PERMISSIONS[roleName] || [];
  const permissions = await Permission.find({ code: { $in: permCodes } });
  const permissionIds = permissions.map((p) => p._id);

  // Create or update role
  const existingRole = await Role.findOne({ name: roleName });

  if (existingRole) {
    existingRole.permissions = permissionIds;
    existingRole.description = ROLE_DESCRIPTIONS[roleName];
    existingRole.isDefault = true;
    await existingRole.save();
    console.log(
      `  ✓ Updated ${roleName} role with ${permissionIds.length} permissions`
    );
  } else {
    await Role.create({
      name: roleName,
      description: ROLE_DESCRIPTIONS[roleName],
      permissions: permissionIds,
      isDefault: true,
    });
    console.log(
      `  ✓ Created ${roleName} role with ${permissionIds.length} permissions`
    );
  }
}

console.log("\n Seeded all roles successfully!");

await mongoose.disconnect();
