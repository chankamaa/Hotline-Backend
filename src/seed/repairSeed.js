import { configDotenv } from "dotenv";
configDotenv();

import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import RepairJob, { REPAIR_STATUS, REPAIR_PRIORITY, DEVICE_TYPES, PAYMENT_STATUS } from "../models/repair/repairJobModel.js";
import Product from "../models/product/productModel.js";
import User from "../models/auth/userModel.js";

await connectDB();

console.log("\n🔧 Seeding REPAIR JOBS...\n");

// Get users
const admin = await User.findOne({ username: "admin" });
if (!admin) {
  console.log("❌ No admin user found. Run adminSeed.js first.");
  process.exit(1);
}

// Clear old repairs
await RepairJob.deleteMany({});

// Get repair parts products
const iphoneBattery = await Product.findOne({ sku: "IP-BATT" });
const samsungDisplay = await Product.findOne({ sku: "SAM-DISP" });
const chargingPort = await Product.findOne({ sku: "CHG-PORT" });

const today = new Date();
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

const repairs = [
  // 1. RECEIVED - Just received, not yet started
  {
    customer: {
      name: "Saman Perera",
      phone: "+94771111111",
      email: "saman@email.com"
    },
    device: {
      type: DEVICE_TYPES.MOBILE_PHONE,
      brand: "Apple",
      model: "iPhone 13 Pro",
      imei: "123456789012345",
      color: "Graphite",
      accessories: ["Charging cable"],
      condition: "Minor scratches on screen"
    },
    problemDescription: "Battery draining fast, shuts down at 30%",
    status: REPAIR_STATUS.RECEIVED,
    priority: REPAIR_PRIORITY.NORMAL,
    estimatedCost: 5000,
    advancePayment: 2000,
    receivedBy: admin._id,
    receivedAt: today,
    createdBy: admin._id,
    createdAt: today
  },

  // 2. IN_PROGRESS - Technician working on it
  {
    customer: {
      name: "Nimali Silva",
      phone: "+94772222222",
      email: "nimali@email.com"
    },
    device: {
      type: DEVICE_TYPES.MOBILE_PHONE,
      brand: "Samsung",
      model: "Galaxy S23",
      imei: "987654321098765",
      color: "Black",
      condition: "Cracked screen"
    },
    problemDescription: "Screen completely cracked, touch not working",
    diagnosisNotes: "Screen replacement needed. Original Samsung display required.",
    status: REPAIR_STATUS.IN_PROGRESS,
    priority: REPAIR_PRIORITY.HIGH,
    estimatedCost: 18000,
    advancePayment: 8000,
    partsUsed: samsungDisplay ? [{
      product: samsungDisplay._id,
      productName: samsungDisplay.name,
      sku: samsungDisplay.sku,
      quantity: 1,
      unitPrice: samsungDisplay.sellingPrice,
      total: samsungDisplay.sellingPrice
    }] : [],
    laborCost: 2000,
    assignedTo: admin._id,
    assignedBy: admin._id,
    assignedAt: yesterday,
    receivedBy: admin._id,
    receivedAt: twoDaysAgo,
    createdBy: admin._id,
    createdAt: twoDaysAgo
  },

  // 3. READY - Waiting for customer pickup
  {
    customer: {
      name: "Kamal Jayawardena",
      phone: "+94773333333"
    },
    device: {
      type: DEVICE_TYPES.MOBILE_PHONE,
      brand: "Apple",
      model: "iPhone 12",
      imei: "456789012345678",
      color: "Blue"
    },
    problemDescription: "Phone not charging",
    diagnosisNotes: "Charging port damaged. Replaced with new flex cable.",
    repairNotes: "Repair completed. Tested charging with multiple cables. Working fine.",
    status: REPAIR_STATUS.READY,
    priority: REPAIR_PRIORITY.NORMAL,
    estimatedCost: 2500,
    advancePayment: 1000,
    partsUsed: chargingPort ? [{
      product: chargingPort._id,
      productName: chargingPort.name,
      sku: chargingPort.sku,
      quantity: 1,
      unitPrice: chargingPort.sellingPrice,
      total: chargingPort.sellingPrice
    }] : [],
    laborCost: 1000,
    assignedTo: admin._id,
    assignedBy: admin._id,
    assignedAt: twoDaysAgo,
    actualCompletionDate: yesterday,
    receivedBy: admin._id,
    receivedAt: oneWeekAgo,
    completedBy: admin._id,
    createdBy: admin._id,
    createdAt: oneWeekAgo
  },

  // 4. COMPLETED - Paid and collected
  {
    customer: {
      name: "Priya Fernando",
      phone: "+94774444444",
      email: "priya.f@email.com"
    },
    device: {
      type: DEVICE_TYPES.MOBILE_PHONE,
      brand: "Apple",
      model: "iPhone 14",
      imei: "111222333444555"
    },
    problemDescription: "Battery replacement requested",
    diagnosisNotes: "Battery health at 75%. Replacement recommended.",
    repairNotes: "Battery replaced. Health now at 100%.",
    status: REPAIR_STATUS.COMPLETED,
    priority: REPAIR_PRIORITY.LOW,
    estimatedCost: 5500,
    advancePayment: 2000,
    partsUsed: iphoneBattery ? [{
      product: iphoneBattery._id,
      productName: iphoneBattery.name,
      sku: iphoneBattery.sku,
      quantity: 1,
      unitPrice: iphoneBattery.sellingPrice,
      total: iphoneBattery.sellingPrice
    }] : [],
    laborCost: 1500,
    finalPayment: 3500,
    paymentStatus: PAYMENT_STATUS.PAID,
    assignedTo: admin._id,
    assignedBy: admin._id,
    assignedAt: oneWeekAgo,
    actualCompletionDate: twoDaysAgo,
    pickupDate: yesterday,
    receivedBy: admin._id,
    receivedAt: oneWeekAgo,
    completedBy: admin._id,
    createdBy: admin._id,
    createdAt: oneWeekAgo
  },

  // 5. CANCELLED - Customer cancelled
  {
    customer: {
      name: "Ranjith Kumar",
      phone: "+94775555555"
    },
    device: {
      type: DEVICE_TYPES.MOBILE_PHONE,
      brand: "OnePlus",
      model: "OnePlus 9",
      color: "Morning Mist"
    },
    problemDescription: "Water damage - phone fell in water",
    diagnosisNotes: "Severe water damage. Motherboard affected. Repair not cost-effective.",
    status: REPAIR_STATUS.CANCELLED,
    priority: REPAIR_PRIORITY.URGENT,
    estimatedCost: 50000,
    cancelledBy: admin._id,
    cancelReason: "Customer decided not to proceed due to high repair cost",
    receivedBy: admin._id,
    receivedAt: oneWeekAgo,
    createdBy: admin._id,
    createdAt: oneWeekAgo
  },

  // 6. URGENT repair - Screen cracked, customer waiting
  {
    customer: {
      name: "Dilshan Perera",
      phone: "+94776666666"
    },
    device: {
      type: DEVICE_TYPES.TABLET,
      brand: "Apple",
      model: "iPad Pro 12.9",
      serialNumber: "DLXXX12345",
      color: "Space Gray"
    },
    problemDescription: "Screen cracked, touch working but display has dead pixels",
    status: REPAIR_STATUS.RECEIVED,
    priority: REPAIR_PRIORITY.URGENT,
    estimatedCost: 35000,
    advancePayment: 15000,
    receivedBy: admin._id,
    receivedAt: today,
    expectedCompletionDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    createdBy: admin._id,
    createdAt: today
  }
];

for (const repair of repairs) {
  const jobNumber = await RepairJob.generateJobNumber();
  await RepairJob.create({
    jobNumber,
    ...repair
  });
  console.log(`✓ Repair ${jobNumber}: ${repair.device.brand} ${repair.device.model} - ${repair.status}`);
}

console.log("\n✅ Created 6 repair jobs with various statuses");

await mongoose.disconnect();
console.log("🔌 DB disconnected\n");
