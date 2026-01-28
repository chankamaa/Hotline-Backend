import { configDotenv } from "dotenv";
configDotenv();

import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import Sale, { SALE_STATUS, DISCOUNT_TYPES, PAYMENT_METHODS } from "../models/sale/saleModel.js";
import Product from "../models/product/productModel.js";
import Stock from "../models/inventory/stockModel.js";
import StockAdjustment, { ADJUSTMENT_TYPES } from "../models/inventory/stockAdjustmentModel.js";
import User from "../models/auth/userModel.js";

await connectDB();

console.log("\n🛒 Seeding SALES data...\n");

// Get users
const admin = await User.findOne({ username: "admin" });
if (!admin) {
  console.log("❌ No admin user found. Run adminSeed.js first.");
  process.exit(1);
}

// Clear old sales (not warranties - we want to keep them linked)
await Sale.deleteMany({});

// Get products
const products = await Product.find({ isActive: true });
const productMap = {};
for (const p of products) {
  productMap[p.sku] = p;
}

// Helper to create sale
async function createSale(saleData) {
  const saleNumber = await Sale.generateSaleNumber();

  const items = [];
  let subtotal = 0;
  let taxTotal = 0;

  for (const item of saleData.items) {
    const product = productMap[item.sku];
    if (!product) continue;

    const unitPrice = product.effectivePrice || product.sellingPrice;
    const qty = item.quantity;
    const taxRate = product.taxRate || 0;
    const itemSubtotal = unitPrice * qty;
    const discount = item.discount || 0;
    const taxAmount = (itemSubtotal - discount) * (taxRate / 100);
    const total = itemSubtotal - discount + taxAmount;

    items.push({
      product: product._id,
      productName: product.name,
      sku: product.sku,
      serialNumber: item.serialNumber || null,
      quantity: qty,
      unitPrice,
      taxRate,
      taxAmount: Math.round(taxAmount * 100) / 100,
      discount,
      total: Math.round(total * 100) / 100
    });

    subtotal += itemSubtotal;
    taxTotal += taxAmount;

    // Deduct stock
    const stock = await Stock.findOne({ product: product._id });
    if (stock) {
      const prev = stock.quantity;
      stock.quantity = Math.max(0, prev - qty);
      await stock.save();

      await StockAdjustment.create({
        product: product._id,
        type: ADJUSTMENT_TYPES.SALE,
        quantity: qty,
        previousQuantity: prev,
        newQuantity: stock.quantity,
        reason: `Sale: ${saleNumber}`,
        reference: saleNumber,
        referenceType: "Sale",
        createdBy: admin._id
      });
    }
  }

  // Apply sale-level discount
  let discountTotal = 0;
  if (saleData.discountValue) {
    if (saleData.discountType === DISCOUNT_TYPES.PERCENTAGE) {
      discountTotal = subtotal * (saleData.discountValue / 100);
    } else {
      discountTotal = saleData.discountValue;
    }
  }

  const grandTotal = Math.round((subtotal - discountTotal + taxTotal) * 100) / 100;

  const sale = await Sale.create({
    saleNumber,
    items,
    payments: saleData.payments.map(p => ({
      method: p.method,
      amount: p.amount,
      reference: p.reference || null
    })),
    customer: saleData.customer || null,
    subtotal: Math.round(subtotal * 100) / 100,
    discountType: saleData.discountType || null,
    discountValue: saleData.discountValue || 0,
    discountTotal: Math.round(discountTotal * 100) / 100,
    taxTotal: Math.round(taxTotal * 100) / 100,
    grandTotal,
    amountPaid: saleData.payments.reduce((sum, p) => sum + p.amount, 0),
    changeGiven: Math.max(0, saleData.payments.reduce((sum, p) => sum + p.amount, 0) - grandTotal),
    status: saleData.status || SALE_STATUS.COMPLETED,
    notes: saleData.notes || null,
    createdBy: admin._id,
    createdAt: saleData.createdAt || new Date()
  });

  return sale;
}

// ===================================================
// SALES SCENARIOS
// ===================================================

const today = new Date();
const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

// 1. Simple cash sale
const sale1 = await createSale({
  items: [
    { sku: "TEMP-GLASS", quantity: 2 },
    { sku: "USBC-CABLE", quantity: 1 }
  ],
  payments: [{ method: PAYMENT_METHODS.CASH, amount: 2000 }],
  customer: { name: "Walk-in Customer", phone: "" },
  createdAt: today
});
console.log(`✓ Sale ${sale1.saleNumber}: Simple cash sale (Rs.${sale1.grandTotal})`);

// 2. Sale with discount
const sale2 = await createSale({
  items: [
    { sku: "IP-COVER", quantity: 3 },
    { sku: "CAR-HOLDER", quantity: 1 }
  ],
  payments: [{ method: PAYMENT_METHODS.CASH, amount: 4500 }],
  discountType: DISCOUNT_TYPES.PERCENTAGE,
  discountValue: 10,
  customer: { name: "Priya Silva", phone: "+94771234567" },
  createdAt: today
});
console.log(`✓ Sale ${sale2.saleNumber}: Sale with 10% discount (Rs.${sale2.grandTotal})`);

// 3. High-value phone sale with card payment
const sale3 = await createSale({
  items: [
    { sku: "IP15PRO", quantity: 1, serialNumber: "IMEI123456789" }
  ],
  payments: [{ method: PAYMENT_METHODS.CARD, amount: 250000, reference: "VISA-4532" }],
  customer: { name: "Rajesh Kumar", phone: "+94772345678", email: "rajesh@email.com" },
  createdAt: yesterday
});
console.log(`✓ Sale ${sale3.saleNumber}: iPhone sale with card (Rs.${sale3.grandTotal})`);

// 4. Mixed payment (cash + card)
const sale4 = await createSale({
  items: [
    { sku: "SGS24", quantity: 1, serialNumber: "IMEI987654321" },
    { sku: "20W-CHARGER", quantity: 1 }
  ],
  payments: [
    { method: PAYMENT_METHODS.CASH, amount: 100000 },
    { method: PAYMENT_METHODS.CARD, amount: 110000 }
  ],
  customer: { name: "Nimal Perera", phone: "+94773456789" },
  createdAt: yesterday
});
console.log(`✓ Sale ${sale4.saleNumber}: Mixed payment sale (Rs.${sale4.grandTotal})`);

// 5. Audio products sale
const sale5 = await createSale({
  items: [
    { sku: "AIRPODS2", quantity: 1 },
    { sku: "JBLGO3", quantity: 1 }
  ],
  payments: [{ method: PAYMENT_METHODS.CASH, amount: 55000 }],
  customer: { name: "Kamal Jayawardena", phone: "+94774567890" },
  createdAt: twoDaysAgo
});
console.log(`✓ Sale ${sale5.saleNumber}: Audio products (Rs.${sale5.grandTotal})`);

// 6. Power bank and cables
const sale6 = await createSale({
  items: [
    { sku: "PB-10000", quantity: 2 },
    { sku: "USBC-CABLE", quantity: 3 }
  ],
  payments: [{ method: PAYMENT_METHODS.CASH, amount: 10000 }],
  customer: { name: "Dinesh Fernando", phone: "+94775678901" },
  createdAt: oneWeekAgo
});
console.log(`✓ Sale ${sale6.saleNumber}: Power accessories (Rs.${sale6.grandTotal})`);

// 7. Repair parts sale (for technicians)
const sale7 = await createSale({
  items: [
    { sku: "IP-BATT", quantity: 1 },
    { sku: "SAM-DISP", quantity: 1 }
  ],
  payments: [{ method: PAYMENT_METHODS.CASH, amount: 25000 }],
  notes: "For repair job RJ-001",
  createdAt: oneWeekAgo
});
console.log(`✓ Sale ${sale7.saleNumber}: Repair parts (Rs.${sale7.grandTotal})`);

// 8. Small accessories sale
const sale8 = await createSale({
  items: [
    { sku: "WIRED-EAR", quantity: 5 },
    { sku: "TEMP-GLASS", quantity: 10 }
  ],
  payments: [{ method: PAYMENT_METHODS.CASH, amount: 12000 }],
  discountType: DISCOUNT_TYPES.FIXED,
  discountValue: 500,
  customer: { name: "Wholesale Buyer", phone: "+94776789012" },
  notes: "Bulk purchase",
  createdAt: oneWeekAgo
});
console.log(`✓ Sale ${sale8.saleNumber}: Bulk accessories (Rs.${sale8.grandTotal})`);

console.log("\n✅ Created 8 sales with various scenarios");

await mongoose.disconnect();
console.log("🔌 DB disconnected\n");
