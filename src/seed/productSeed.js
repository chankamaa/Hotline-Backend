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

// Maps to store category references
const mainCategoryMap = {};  // Main category name -> { id, name }
const subcategoryMap = {};   // Subcategory name -> { id, parentId, parentName }

// Create categories
for (const cat of categoriesData) {
  const parent = await Category.create({
    name: cat.name,
    parent: null,
    isActive: true,
  });

  mainCategoryMap[cat.name] = { id: parent._id, name: cat.name };
  console.log(`✓ Category: ${cat.name}`);

  for (const sub of cat.subcategories) {
    const subCat = await Category.create({
      name: sub,
      parent: parent._id,
      isActive: true,
    });

    subcategoryMap[sub] = {
      id: subCat._id,
      parentId: parent._id,
      parentName: cat.name
    };
    console.log(`  └─ Subcategory: ${sub}`);
  }
}

// ===================================================
// 2️⃣ SUPPLIERS
// ===================================================

const suppliers = {
  apple: {
    name: "Apple Authorized Distributor",
    contact: "Rajesh Kumar",
    phone: "+94771234567",
    email: "rajesh@appledist.lk"
  },
  samsung: {
    name: "Samsung Electronics Lanka",
    contact: "Priya Silva",
    phone: "+94772345678",
    email: "priya@samsung.lk"
  },
  accessories: {
    name: "Mobile Accessories Wholesale",
    contact: "Dinesh Fernando",
    phone: "+94773456789",
    email: "dinesh@accessorieswholesale.lk"
  },
  audio: {
    name: "Audio Hub Lanka",
    contact: "Nimal Perera",
    phone: "+94774567890",
    email: "nimal@audiohub.lk"
  },
  parts: {
    name: "Phone Parts & Repair Supplies",
    contact: "Kamal Jayawardena",
    phone: "+94775678901",
    email: "kamal@phoneparts.lk"
  }
};

// ===================================================
// 3️⃣ PRODUCTS (WITH SUBCATEGORY AND SUPPLIER)
// ===================================================

const productsData = [
  // 📱 Mobile Phones
  {
    name: "iPhone 15 Pro",
    sku: "IP15PRO",
    barcode: "900000001",
    mainCategory: "Mobile Phones",
    subcategory: "Apple iPhone",
    costPrice: 180000,
    sellingPrice: 220000,
    warrantyDuration: 12,
    warrantyType: "MANUFACTURER",
    warrantyDescription: "Apple 1 year international warranty",
    supplier: suppliers.apple
  },
  {
    name: "Samsung Galaxy S24",
    sku: "SGS24",
    barcode: "900000002",
    mainCategory: "Mobile Phones",
    subcategory: "Samsung Phones",
    costPrice: 150000,
    sellingPrice: 185000,
    warrantyDuration: 12,
    warrantyType: "MANUFACTURER",
    warrantyDescription: "Samsung 1 year warranty",
    supplier: suppliers.samsung
  },
  {
    name: "OnePlus 12",
    sku: "OP12",
    barcode: "900000003",
    mainCategory: "Mobile Phones",
    subcategory: "Android Phones",
    costPrice: 85000,
    sellingPrice: 99999,
    warrantyDuration: 12,
    warrantyType: "SHOP",
    warrantyDescription: "Shop warranty for 1 year",
    supplier: suppliers.accessories
  },

  // 🛡 Accessories
  {
    name: "iPhone Back Cover",
    sku: "IP-COVER",
    barcode: "900000010",
    mainCategory: "Accessories",
    subcategory: "Cases & Covers",
    costPrice: 500,
    sellingPrice: 900,
    warrantyDuration: 0,
    warrantyType: "NONE",
    supplier: suppliers.accessories
  },
  {
    name: "Tempered Glass",
    sku: "TEMP-GLASS",
    barcode: "900000011",
    mainCategory: "Accessories",
    subcategory: "Screen Protectors",
    costPrice: 200,
    sellingPrice: 500,
    warrantyDuration: 1,
    warrantyType: "SHOP",
    warrantyDescription: "1 month replacement warranty",
    supplier: suppliers.accessories
  },
  {
    name: "Car Phone Holder",
    sku: "CAR-HOLDER",
    barcode: "900000012",
    mainCategory: "Accessories",
    subcategory: "Phone Holders",
    costPrice: 600,
    sellingPrice: 1200,
    warrantyDuration: 3,
    warrantyType: "SHOP",
    supplier: suppliers.accessories
  },

  // 🎧 Audio
  {
    name: "AirPods Pro 2",
    sku: "AIRPODS2",
    barcode: "900000020",
    mainCategory: "Audio",
    subcategory: "TWS Earbuds",
    costPrice: 28000,
    sellingPrice: 35000,
    warrantyDuration: 12,
    warrantyType: "MANUFACTURER",
    warrantyDescription: "Apple 1 year warranty",
    supplier: suppliers.apple
  },
  {
    name: "Wired Earphones",
    sku: "WIRED-EAR",
    barcode: "900000021",
    mainCategory: "Audio",
    subcategory: "Wired Earphones",
    costPrice: 500,
    sellingPrice: 1000,
    warrantyDuration: 0,
    warrantyType: "NONE",
    supplier: suppliers.audio
  },
  {
    name: "JBL Go 3",
    sku: "JBLGO3",
    barcode: "900000022",
    mainCategory: "Audio",
    subcategory: "Bluetooth Speakers",
    costPrice: 8500,
    sellingPrice: 11000,
    warrantyDuration: 12,
    warrantyType: "MANUFACTURER",
    warrantyDescription: "JBL 1 year warranty",
    supplier: suppliers.audio
  },

  // 🔌 Chargers & Power
  {
    name: "20W Fast Charger",
    sku: "20W-CHARGER",
    barcode: "900000030",
    mainCategory: "Chargers & Power",
    subcategory: "Wall Chargers",
    costPrice: 1200,
    sellingPrice: 1800,
    warrantyDuration: 6,
    warrantyType: "SHOP",
    supplier: suppliers.accessories
  },
  {
    name: "USB-C Cable",
    sku: "USBC-CABLE",
    barcode: "900000031",
    mainCategory: "Chargers & Power",
    subcategory: "Charging Cables",
    costPrice: 300,
    sellingPrice: 700,
    warrantyDuration: 3,
    warrantyType: "SHOP",
    supplier: suppliers.accessories
  },
  {
    name: "10000mAh Power Bank",
    sku: "PB-10000",
    barcode: "900000032",
    mainCategory: "Chargers & Power",
    subcategory: "Power Banks",
    costPrice: 2500,
    sellingPrice: 3500,
    warrantyDuration: 6,
    warrantyType: "SHOP",
    supplier: suppliers.accessories
  },

  // 🔧 Repair & Parts
  {
    name: "iPhone Battery",
    sku: "IP-BATT",
    barcode: "900000040",
    mainCategory: "Repair & Parts",
    subcategory: "Batteries",
    costPrice: 2500,
    sellingPrice: 4000,
    warrantyDuration: 3,
    warrantyType: "SHOP",
    warrantyDescription: "3 months shop warranty",
    supplier: suppliers.parts
  },
  {
    name: "Samsung Display",
    sku: "SAM-DISP",
    barcode: "900000041",
    mainCategory: "Repair & Parts",
    subcategory: "Displays",
    costPrice: 12000,
    sellingPrice: 16000,
    warrantyDuration: 3,
    warrantyType: "SHOP",
    warrantyDescription: "3 months shop warranty",
    supplier: suppliers.parts
  },
  {
    name: "Charging Port Flex",
    sku: "CHG-PORT",
    barcode: "900000042",
    mainCategory: "Repair & Parts",
    subcategory: "Charging Ports",
    costPrice: 800,
    sellingPrice: 1500,
    warrantyDuration: 1,
    warrantyType: "SHOP",
    supplier: suppliers.parts
  },
];

// Insert products
let count = 0;

for (const p of productsData) {
  const subcatInfo = subcategoryMap[p.subcategory];
  if (!subcatInfo) {
    console.log(`⚠️  Skipped: ${p.name} - Subcategory not found`);
    continue;
  }

  await Product.create({
    name: p.name,
    sku: p.sku,
    barcode: p.barcode,
    category: subcatInfo.parentId,      // Main category
    subcategory: subcatInfo.id,          // Subcategory
    costPrice: p.costPrice,
    sellingPrice: p.sellingPrice,
    unit: "piece",
    taxRate: 12,
    warrantyDuration: p.warrantyDuration || 0,
    warrantyType: p.warrantyType || "NONE",
    warrantyDescription: p.warrantyDescription || "",
    supplier: p.supplier || null,
    minStockLevel: 5,
    isActive: true,
  });

  console.log(`✓ Product: ${p.name} (${p.mainCategory} > ${p.subcategory})`);
  count++;
}

console.log("\n✅ Seed completed");
console.log("📂 Main Categories: 5");
console.log("📂 Subcategories: 15");
console.log(`📦 Products: ${count}`);

await mongoose.disconnect();
console.log("🔌 DB disconnected\n");

