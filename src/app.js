import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import AppError from './utils/appError.js';
import { errorController } from './controllers/errorController.js';

// Routes
import authRoutes from './routes/auth/authRoutes.js';
import userRoutes from './routes/auth/userRoutes.js';
import roleRoutes from './routes/auth/roleRoutes.js';
import permissionRoutes from './routes/auth/permissionRoutes.js';
import categoryRoutes from './routes/product/categoryRoutes.js';
import productRoutes from './routes/product/productRoutes.js';
import inventoryRoutes from './routes/inventory/inventoryRoutes.js';

const app = express();

// Security Middleware
app.use(helmet()); // Set security HTTP headers

// Rate limiting - prevent brute force attacks
const limiter = rateLimit({
  max: 100, // 100 requests per window
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,
});
app.use('/api', limiter);

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Body parser and CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10kb' })); // Limit body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// API Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/permissions", permissionRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/inventory", inventoryRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler - undefined routes handler
app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server`, 404));
});

// Global error handler
app.use(errorController);

export default app;