import { configDotenv } from "dotenv";
configDotenv();

import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Category from "../models/product/categoryModel.js";
import Product from "../models/product/productModel.js";

await connectDB();

console.log("\n📱 Seeding PHONE SHOP data...\n");

// Clear old data
await Category.deleteMany({});
await Product.deleteMany({});

// ===================================================
// 1️⃣ CATEGORIES (5 MAIN + SUBCATEGORIES)
// ===================================================

const categoriesData = [
  {
    name: "Mobile Phones",
    subcategories: ["Apple iPhone", "Samsung Phones", "Android Phones"],
  },
  {
    name: "Accessories",
    subcategories: ["Cases & Covers", "Screen Protectors", "Phone Holders"],
  },
  {
    name: "Audio",
    subcategories: ["TWS Earbuds", "Wired Earphones", "Bluetooth Speakers"],
  },
  {
    name: "Chargers & Power",
    subcategories: ["Wall Chargers", "Charging Cables", "Power Banks"],
  },
  {
    name: "Repair & Parts",
    subcategories: ["Batteries", "Displays", "Charging Ports"],
  },
];

const categoryMap = {};

// Create categories
for (const cat of categoriesData) {
  const parent = await Category.create({
    name: cat.name,
    parent: null,
    isActive: true,
  });

  categoryMap[cat.name] = parent._id;
  console.log(`✓ Category: ${cat.name}`);

  for (const sub of cat.subcategories) {
    const subCat = await Category.create({
      name: sub,
      parent: parent._id,
      isActive: true,
    });

    categoryMap[sub] = subCat._id;
    console.log(`  └─ Subcategory: ${sub}`);
  }
}

// ===================================================
// 2️⃣ PRODUCTS (EVERY SUBCATEGORY HAS PRODUCTS)
// ===================================================

const productsData = [
  // 📱 Mobile Phones
  {
    name: "iPhone 15 Pro",
    sku: "IP15PRO",
    barcode: "900000001",
    category: "Apple iPhone",
    costPrice: 180000,
    sellingPrice: 220000,
  },
  {
    name: "Samsung Galaxy S24",
    sku: "SGS24",
    barcode: "900000002",
    category: "Samsung Phones",
    costPrice: 150000,
    sellingPrice: 185000,
  },
  {
    name: "OnePlus 12",
    sku: "OP12",
    barcode: "900000003",
    category: "Android Phones",
    costPrice: 85000,
    sellingPrice: 99999,
  },

  // 🛡 Accessories
  {
    name: "iPhone Back Cover",
    sku: "IP-COVER",
    barcode: "900000010",
    category: "Cases & Covers",
    costPrice: 500,
    sellingPrice: 900,
  },
  {
    name: "Tempered Glass",
    sku: "TEMP-GLASS",
    barcode: "900000011",
    category: "Screen Protectors",
    costPrice: 200,
    sellingPrice: 500,
  },
  {
    name: "Car Phone Holder",
    sku: "CAR-HOLDER",
    barcode: "900000012",
    category: "Phone Holders",
    costPrice: 600,
    sellingPrice: 1200,
  },

  // 🎧 Audio
  {
    name: "AirPods Pro 2",
    sku: "AIRPODS2",
    barcode: "900000020",
    category: "TWS Earbuds",
    costPrice: 28000,
    sellingPrice: 35000,
  },
  {
    name: "Wired Earphones",
    sku: "WIRED-EAR",
    barcode: "900000021",
    category: "Wired Earphones",
    costPrice: 500,
    sellingPrice: 1000,
  },
  {
    name: "JBL Go 3",
    sku: "JBLGO3",
    barcode: "900000022",
    category: "Bluetooth Speakers",
    costPrice: 8500,
    sellingPrice: 11000,
  },

  // 🔌 Chargers & Power
  {
    name: "20W Fast Charger",
    sku: "20W-CHARGER",
    barcode: "900000030",
    category: "Wall Chargers",
    costPrice: 1200,
    sellingPrice: 1800,
  },
  {
    name: "USB-C Cable",
    sku: "USBC-CABLE",
    barcode: "900000031",
    category: "Charging Cables",
    costPrice: 300,
    sellingPrice: 700,
  },
  {
    name: "10000mAh Power Bank",
    sku: "PB-10000",
    barcode: "900000032",
    category: "Power Banks",
    costPrice: 2500,
    sellingPrice: 3500,
  },

  // 🔧 Repair & Parts
  {
    name: "iPhone Battery",
    sku: "IP-BATT",
    barcode: "900000040",
    category: "Batteries",
    costPrice: 2500,
    sellingPrice: 4000,
  },
  {
    name: "Samsung Display",
    sku: "SAM-DISP",
    barcode: "900000041",
    category: "Displays",
    costPrice: 12000,
    sellingPrice: 16000,
  },
  {
    name: "Charging Port Flex",
    sku: "CHG-PORT",
    barcode: "900000042",
    category: "Charging Ports",
    costPrice: 800,
    sellingPrice: 1500,
  },
];

// Insert products
let count = 0;

for (const p of productsData) {
  const categoryId = categoryMap[p.category];
  if (!categoryId) continue;

  await Product.create({
    ...p,
    category: categoryId,
    unit: "piece",
    taxRate: 12,
    isActive: true,
  });

  count++;
}

console.log(`\n✅ Seed completed`);
console.log(`📂 Categories: 5`);
console.log(`📦 Products: ${count}`);

await mongoose.disconnect();
console.log("🔌 DB disconnected\n");
