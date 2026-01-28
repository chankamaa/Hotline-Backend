import { configDotenv } from "dotenv";
configDotenv();

import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Return, { RETURN_TYPES, RETURN_STATUS } from "../models/sale/returnModel.js";
import Sale from "../models/sale/saleModel.js";
import User from "../models/auth/userModel.js";

await connectDB();

console.log("\n↩️ Seeding RETURNS...\n");

// Get admin user
const admin = await User.findOne({ username: "admin" });
if (!admin) {
  console.log("❌ No admin user found. Run adminSeed.js first.");
  process.exit(1);
}

// Clear old returns
await Return.deleteMany({});

// Get some sales to create returns from
const sales = await Sale.find({ status: "COMPLETED" }).limit(3);

if (sales.length === 0) {
  console.log("⚠️ No sales found. Run saleSeed.js first.");
  await mongoose.disconnect();
  process.exit(0);
}

const today = new Date();
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

// 1. Simple refund return
if (sales[0] && sales[0].items.length > 0) {
  const sale = sales[0];
  const item = sale.items[0];

  const returnNumber = await Return.generateReturnNumber();

  await Return.create({
    returnNumber,
    originalSale: sale._id,
    returnType: RETURN_TYPES.REFUND,
    items: [{
      product: item.product,
      productName: item.productName,
      sku: item.sku,
      quantity: 1,
      unitPrice: item.unitPrice,
      refundAmount: item.unitPrice
    }],
    totalRefund: item.unitPrice,
    reason: "Customer changed their mind",
    refundMethod: "CASH",
    status: RETURN_STATUS.COMPLETED,
    createdBy: admin._id,
    createdAt: today
  });

  console.log(`✓ Return ${returnNumber}: REFUND - Rs.${item.unitPrice} (${item.productName})`);
}

// 2. Partial refund (returning less than bought)
if (sales[1] && sales[1].items.length > 0) {
  const sale = sales[1];
  const item = sale.items[0];

  const returnNumber = await Return.generateReturnNumber();
  const returnQty = Math.min(2, item.quantity);
  const refundAmount = item.unitPrice * returnQty;

  await Return.create({
    returnNumber,
    originalSale: sale._id,
    returnType: RETURN_TYPES.REFUND,
    items: [{
      product: item.product,
      productName: item.productName,
      sku: item.sku,
      quantity: returnQty,
      unitPrice: item.unitPrice,
      refundAmount
    }],
    totalRefund: refundAmount,
    reason: "Product defective",
    refundMethod: "CASH",
    status: RETURN_STATUS.COMPLETED,
    createdBy: admin._id,
    createdAt: yesterday
  });

  console.log(`✓ Return ${returnNumber}: PARTIAL REFUND - ${returnQty}x ${item.productName}`);
}

// 3. Exchange scenario (recorded as return reference)
if (sales[2] && sales[2].items.length > 0) {
  const sale = sales[2];
  const item = sale.items[0];

  const returnNumber = await Return.generateReturnNumber();

  await Return.create({
    returnNumber,
    originalSale: sale._id,
    returnType: RETURN_TYPES.EXCHANGE,
    items: [{
      product: item.product,
      productName: item.productName,
      sku: item.sku,
      quantity: 1,
      unitPrice: item.unitPrice,
      refundAmount: item.unitPrice
    }],
    totalRefund: item.unitPrice,
    exchangeAmountDue: 5000, // Customer paid extra for upgraded item
    reason: "Customer wants different color/model",
    notes: "Exchanged for different variant. Customer paid Rs.5000 extra.",
    status: RETURN_STATUS.COMPLETED,
    createdBy: admin._id,
    createdAt: yesterday
  });

  console.log(`✓ Return ${returnNumber}: EXCHANGE - ${item.productName} (Customer paid Rs.5000 extra)`);
}

console.log("\n✅ Created 3 return scenarios");

await mongoose.disconnect();
console.log("🔌 DB disconnected\n");
