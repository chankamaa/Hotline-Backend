import { configDotenv } from "dotenv";
configDotenv();

import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Product from "../models/product/productModel.js";
import Stock from "../models/inventory/stockModel.js";
import StockAdjustment, { ADJUSTMENT_TYPES } from "../models/inventory/stockAdjustmentModel.js";
import User from "../models/auth/userModel.js";

await connectDB();

console.log("\n📦 Seeding INVENTORY data...\n");

// Get admin user for createdBy field
const adminUser = await User.findOne({ username: "admin" });
if (!adminUser) {
  console.log("❌ Admin user not found. Please run adminSeed first.");
  await mongoose.disconnect();
  process.exit(1);
}

// Clear old inventory data
await Stock.deleteMany({});
await StockAdjustment.deleteMany({});
console.log("🗑️  Cleared old inventory data\n");

// Stock quantities for each product
// High-value items get lower stock, accessories get higher stock
const stockQuantities = {
  // Mobile Phones - Low stock (expensive)
  "IP15PRO": 5,
  "SGS24": 8,
  "OP12": 10,
  
  // Accessories - High stock
  "IP-COVER": 100,
  "TEMP-GLASS": 200,
  "CAR-HOLDER": 50,
  
  // Audio
  "AIRPODS2": 15,
  "WIRED-EAR": 150,
  "JBLGO3": 20,
  
  // Chargers & Power
  "20W-CHARGER": 80,
  "USBC-CABLE": 300,
  "PB-10000": 40,
  
  // Repair Parts
  "IP-BATT": 30,
  "SAM-DISP": 10,
  "CHG-PORT": 50,
};

// Get all products
const products = await Product.find({ isActive: true });

console.log("Adding stock for products:\n");

let stockCount = 0;
let totalItems = 0;

for (const product of products) {
  // Get quantity from mapping, or random between 20-100
  const quantity = stockQuantities[product.sku] || Math.floor(Math.random() * 80) + 20;
  
  // Create stock record
  const stock = await Stock.create({
    product: product._id,
    quantity: quantity,
    lastUpdated: new Date()
  });
  
  // Create initial stock adjustment record
  await StockAdjustment.create({
    product: product._id,
    type: ADJUSTMENT_TYPES.PURCHASE,
    quantity: quantity,
    previousQuantity: 0,
    newQuantity: quantity,
    reason: "Initial stock - Seed data",
    referenceType: "Manual",
    createdBy: adminUser._id
  });
  
  console.log(`✓ ${product.name.padEnd(25)} | SKU: ${product.sku.padEnd(12)} | Stock: ${quantity}`);
  stockCount++;
  totalItems += quantity;
}

// Calculate total inventory value
const inventoryValue = await products.reduce(async (accPromise, product) => {
  const acc = await accPromise;
  const stock = await Stock.findOne({ product: product._id });
  const qty = stock ? stock.quantity : 0;
  return acc + (qty * product.costPrice);
}, Promise.resolve(0));

console.log("\n" + "═".repeat(60));
console.log(`✅ Inventory Seed Complete!`);
console.log("═".repeat(60));
console.log(`📦 Products with stock: ${stockCount}`);
console.log(`📊 Total items in stock: ${totalItems}`);
console.log(`💰 Total inventory value: ₹${inventoryValue.toLocaleString()}`);
console.log("═".repeat(60) + "\n");

await mongoose.disconnect();
console.log("🔌 DB disconnected\n");
