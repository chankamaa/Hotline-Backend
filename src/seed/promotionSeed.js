import { configDotenv } from "dotenv";
configDotenv();

import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Promotion, { PROMOTION_TYPES, TARGET_TYPES } from "../models/promotion/promotionModel.js";
import Category from "../models/product/categoryModel.js";
import Product from "../models/product/productModel.js";
import User from "../models/auth/userModel.js";

await connectDB();

console.log("\n🎁 Seeding PROMOTIONS...\n");

// Get admin user
const admin = await User.findOne({ username: "admin" });
if (!admin) {
  console.log("❌ No admin user found. Run adminSeed.js first.");
  process.exit(1);
}

// Clear old promotions
await Promotion.deleteMany({});

// Get categories for targeting
const mobileCategory = await Category.findOne({ name: "Mobile Phones" });
const accessoriesCategory = await Category.findOne({ name: "Accessories" });

// Get some products
const iphone = await Product.findOne({ sku: "IP15PRO" });
const samsung = await Product.findOne({ sku: "SGS24" });
const airpods = await Product.findOne({ sku: "AIRPODS2" });

const now = new Date();
const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
const oneMonthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

const promotions = [
  // 1. Active store-wide promotion
  {
    name: "New Year Sale",
    description: "5% off on all products!",
    type: PROMOTION_TYPES.PERCENTAGE,
    value: 5,
    startDate: oneWeekAgo,
    endDate: oneMonthFromNow,
    targetType: TARGET_TYPES.ALL,
    isActive: true,
    priority: 1,
    createdBy: admin._id
  },
  // 2. Category-specific promotion (Mobile Phones)
  {
    name: "Mobile Mania",
    description: "Rs.5000 off on all mobile phones",
    type: PROMOTION_TYPES.FIXED,
    value: 5000,
    minPurchase: 50000,
    startDate: oneWeekAgo,
    endDate: oneWeekFromNow,
    targetType: TARGET_TYPES.CATEGORY,
    targetCategories: mobileCategory ? [mobileCategory._id] : [],
    isActive: true,
    priority: 2,
    createdBy: admin._id
  },
  // 3. Product-specific promotion
  {
    name: "AirPods Special",
    description: "10% off on AirPods Pro 2",
    type: PROMOTION_TYPES.PERCENTAGE,
    value: 10,
    startDate: oneWeekAgo,
    endDate: oneMonthFromNow,
    targetType: TARGET_TYPES.PRODUCT,
    targetProducts: airpods ? [airpods._id] : [],
    isActive: true,
    priority: 3,
    createdBy: admin._id
  },
  // 4. Buy X Get Y promotion
  {
    name: "Bundle Deal - Accessories",
    description: "Buy 3, Get 1 Free on accessories",
    type: PROMOTION_TYPES.BUY_X_GET_Y,
    value: 0,
    buyQuantity: 3,
    getQuantity: 1,
    startDate: oneWeekAgo,
    endDate: oneMonthFromNow,
    targetType: TARGET_TYPES.CATEGORY,
    targetCategories: accessoriesCategory ? [accessoriesCategory._id] : [],
    isActive: true,
    priority: 1,
    createdBy: admin._id
  },
  // 5. Future promotion (not yet active)
  {
    name: "Independence Day Sale",
    description: "15% off on everything",
    type: PROMOTION_TYPES.PERCENTAGE,
    value: 15,
    startDate: new Date("2026-02-04"),
    endDate: new Date("2026-02-05"),
    targetType: TARGET_TYPES.ALL,
    isActive: true,
    priority: 10,
    createdBy: admin._id
  },
  // 6. Expired promotion (for history)
  {
    name: "Christmas Sale",
    description: "20% off for Christmas",
    type: PROMOTION_TYPES.PERCENTAGE,
    value: 20,
    startDate: new Date("2025-12-20"),
    endDate: new Date("2025-12-26"),
    targetType: TARGET_TYPES.ALL,
    isActive: false,
    priority: 5,
    createdBy: admin._id
  }
];

for (const promo of promotions) {
  if (promo.targetCategories?.length === 0) delete promo.targetCategories;
  if (promo.targetProducts?.length === 0) delete promo.targetProducts;

  await Promotion.create(promo);
  console.log(`✓ Promotion: ${promo.name} (${promo.type})`);
}

// Update some products with direct offers
console.log("\n🏷️ Adding product-level offers...\n");

if (iphone) {
  iphone.offer = {
    isActive: true,
    type: "PERCENTAGE",
    value: 5,
    startDate: oneWeekAgo,
    endDate: oneMonthFromNow,
    description: "Launch Offer"
  };
  await iphone.save();
  console.log("✓ iPhone 15 Pro: 5% off (Launch Offer)");
}

if (samsung) {
  samsung.offer = {
    isActive: true,
    type: "FIXED",
    value: 10000,
    startDate: oneWeekAgo,
    endDate: oneWeekFromNow,
    description: "Flash Sale"
  };
  await samsung.save();
  console.log("✓ Samsung Galaxy S24: Rs.10000 off (Flash Sale)");
}

console.log(`\n✅ Seeded ${promotions.length} promotions + 2 product offers`);

await mongoose.disconnect();
console.log("🔌 DB disconnected\n");
