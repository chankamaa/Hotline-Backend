import { configDotenv } from "dotenv";
configDotenv();
import { connectDB } from "../config/db.js";
import Warranty from "../models/warranty/warrantyModel.js";
import Product from "../models/product/productModel.js";
import Sale from "../models/sale/saleModel.js";
import User from "../models/auth/userModel.js";
import mongoose from "mongoose";

await connectDB();

console.log("Seeding sample warranties...");

// Get an admin user for createdBy
const adminUser = await User.findOne({ isSuperAdmin: true });
if (!adminUser) {
  console.log("❌ No admin user found. Please run adminSeed.js first.");
  await mongoose.disconnect();
  process.exit(1);
}

// Get some products with warranty
const products = await Product.find({ warrantyDuration: { $gt: 0 } }).limit(5);

if (products.length === 0) {
  console.log("⚠️  No products with warranty duration found. Creating sample warranties with first available products...");
  const anyProducts = await Product.find().limit(3);
  
  if (anyProducts.length === 0) {
    console.log("❌ No products found. Please run productSeed.js first.");
    await mongoose.disconnect();
    process.exit(1);
  }

  // Create sample warranties
  const sampleCustomers = [
    { name: "Kasun Perera", phone: "0771234567", email: "kasun@example.com" },
    { name: "Samantha Fernando", phone: "0762345678", email: "samantha@example.com" },
    { name: "Dilshan Silva", phone: "0753456789", email: "dilshan@example.com" }
  ];

  for (let i = 0; i < Math.min(3, anyProducts.length); i++) {
    const product = anyProducts[i];
    const customer = sampleCustomers[i];
    
    const warrantyNumber = await Warranty.generateWarrantyNumber();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - Math.floor(Math.random() * 6)); // Random start in past 6 months
    
    const durationMonths = 12; // Default 12 months warranty
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);

    await Warranty.create({
      warrantyNumber,
      sourceType: "MANUAL",
      product: product._id,
      productName: product.name,
      serialNumber: `SN${Date.now()}${i}`,
      customer,
      warrantyType: "MANUFACTURER",
      durationMonths,
      startDate,
      endDate,
      status: new Date() > endDate ? "EXPIRED" : "ACTIVE",
      notes: "Sample warranty for testing",
      createdBy: adminUser._id
    });

    console.log(`  ✓ Created warranty for ${product.name} - Customer: ${customer.name}`);
  }
} else {
  // Create warranties for products that have warranty duration set
  const sampleCustomers = [
    { name: "Kasun Perera", phone: "0771234567", email: "kasun@example.com" },
    { name: "Samantha Fernando", phone: "0762345678", email: "samantha@example.com" },
    { name: "Dilshan Silva", phone: "0753456789", email: "dilshan@example.com" },
    { name: "Nuwan Jayawardena", phone: "0784567890", email: "nuwan@example.com" },
    { name: "Tharushi Wijesinghe", phone: "0715678901", email: "tharushi@example.com" }
  ];

  for (let i = 0; i < Math.min(5, products.length); i++) {
    const product = products[i];
    const customer = sampleCustomers[i];
    
    const warrantyNumber = await Warranty.generateWarrantyNumber();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - Math.floor(Math.random() * 6)); // Random start in past 6 months
    
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + product.warrantyDuration);

    await Warranty.create({
      warrantyNumber,
      sourceType: "MANUAL",
      product: product._id,
      productName: product.name,
      serialNumber: `SN${Date.now()}${i}`,
      customer,
      warrantyType: product.warrantyType || "MANUFACTURER",
      durationMonths: product.warrantyDuration,
      startDate,
      endDate,
      status: new Date() > endDate ? "EXPIRED" : "ACTIVE",
      notes: "Sample warranty for testing",
      createdBy: adminUser._id
    });

    console.log(`  ✓ Created warranty for ${product.name} - Customer: ${customer.name} (${product.warrantyDuration} months)`);
  }
}

const count = await Warranty.countDocuments();
console.log(`\n✅ Warranty seeding complete! Total warranties: ${count}`);

await mongoose.disconnect();
