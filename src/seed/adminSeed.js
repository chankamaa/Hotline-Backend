import { configDotenv } from "dotenv";
configDotenv();
import { connectDB } from "../config/db.js";

import User from "../models/auth/userModel.js";
import Role from "../models/auth/roleModel.js";
import bcrypt from "bcrypt";
import mongoose from "mongoose";

await connectDB();

console.log("Seeding super admin...");

// Get or create admin role
let adminRole = await Role.findOne({ name: "ADMIN" });
if (!adminRole) {
  console.log("  ⚠ ADMIN role not found. Please run roleSeed.js first.");
  await mongoose.disconnect();
  process.exit(1);
}

// Create super admin user
const existingAdmin = await User.findOne({ username: "admin" });

if (!existingAdmin) {
  const hashedPassword = await bcrypt.hash("admin@123", 10);

  await User.create({
    username: "admin",
    email: "admin@hotline.com",
    password: hashedPassword,
    roles: [adminRole._id],
    isSuperAdmin: true, // Bypass all permission checks
    isActive: true,
  });

  console.log("  ✓ Created super admin user");
  console.log("    Username: admin");
  console.log("    Password: admin@123");
  console.log("    ⚠ Please change this password immediately!");
} else {
  // Update existing admin to be super admin (skip validation)
  existingAdmin.isSuperAdmin = true;
  existingAdmin.roles = [adminRole._id];
  await existingAdmin.save({ validateBeforeSave: false });
  console.log("  ✓ Updated existing admin as super admin");
}

console.log("\n✅ Super admin seeded successfully!");

await mongoose.disconnect();
