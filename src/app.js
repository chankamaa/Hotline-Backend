import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";

import AppError from "./utils/appError.js";
import { errorController } from "./controllers/errorController.js";

// Routes
import authRoutes from "./routes/auth/authRoutes.js";
import userRoutes from "./routes/auth/userRoutes.js";
import roleRoutes from "./routes/auth/roleRoutes.js";
import permissionRoutes from "./routes/auth/permissionRoutes.js";
import categoryRoutes from "./routes/product/categoryRoutes.js";
import productRoutes from "./routes/product/productRoutes.js";
import inventoryRoutes from "./routes/inventory/inventoryRoutes.js";
import saleRoutes from "./routes/sale/saleRoutes.js";
import repairRoutes from "./routes/repair/repairRoutes.js";
import warrantyRoutes from "./routes/warranty/warrantyRoutes.js";
import returnRoutes from "./routes/sale/returnRoutes.js";
import reportRoutes from "./routes/report/reportRoutes.js";
import promotionRoutes from "./routes/promotion/promotionRoutes.js";

const app = express();

// CORS Configuration - MUST be FIRST before any other middleware
const allowedOrigins = [
  'https://hotline-admin.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  // Add additional origins from env variable if provided
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [])
];

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

app.use(cors(corsOptions));

// Handle preflight requests explicitly for all routes
app.options('/*', cors(corsOptions));

// Security Middleware - AFTER CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting - prevent brute force attacks
const limiter = rateLimit({
  max: 500, // 500 requests per window (increased for testing)
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: "Too many requests from this IP, please try again after 15 minutes",
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "development" || req.method === "OPTIONS", // Skip OPTIONS
});
app.use("/api", limiter);

// Request logging
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Body parsers
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/permissions", permissionRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/inventory", inventoryRoutes);
app.use("/api/v1/sales", saleRoutes);
app.use("/api/v1/repairs", repairRoutes);
app.use("/api/v1/warranties", warrantyRoutes);
app.use("/api/v1/returns", returnRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/promotions", promotionRoutes);

// Health check endpoints
const healthResponse = (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};
app.get("/health", healthResponse);
app.get("/api/v1/health", healthResponse);

// 404 handler - undefined routes handler
app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

// Global error handler
app.use(errorController);

export default app;