import User from "../../models/auth/userModel.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

// Generate access token
const generateAccessToken = (user) =>
  jwt.sign(
    { userId: user._id },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRE || "15m" }
  );

// Generate refresh token
const generateRefreshToken = (user) =>
  jwt.sign(
    { userId: user._id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.REFRESH_TOKEN_EXPIRE || "7d" }
  );

/**
 * Login user
 * POST /auth/login
 */
export const login = catchAsync(async (req, res, next) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    return next(new AppError("Username and password are required", 400));
  }

  // Find user with password
  const user = await User.findOne({ username, isActive: true }).select("+password");

  if (!user) {
    return next(new AppError("Invalid credentials", 401));
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(password, user.password);

  if (!isPasswordValid) {
    return next(new AppError("Invalid credentials", 401));
  }

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Save refresh token to database
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Send response
  res.json({
    status: "success",
    data: {
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin
      }
    }
  });
});

/**
 * Refresh access token
 * POST /auth/refresh
 */
export const refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken: token } = req.body;

  if (!token) {
    return next(new AppError("Refresh token is required", 400));
  }

  // Verify refresh token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    return next(new AppError("Invalid or expired refresh token", 401));
  }

  // Find user with this refresh token
  const user = await User.findById(decoded.userId).select("+refreshToken");

  if (!user || user.refreshToken !== token) {
    return next(new AppError("Invalid refresh token", 401));
  }

  if (!user.isActive) {
    return next(new AppError("User account is deactivated", 401));
  }

  // Generate new tokens
  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // Update refresh token in database
  user.refreshToken = newRefreshToken;
  await user.save({ validateBeforeSave: false });

  res.json({
    status: "success",
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    }
  });
});

/**
 * Logout user
 * POST /auth/logout
 */
export const logout = catchAsync(async (req, res, next) => {
  // Clear refresh token from database
  await User.findByIdAndUpdate(req.userId, { refreshToken: null });

  res.json({
    status: "success",
    message: "Logged out successfully"
  });
});

/**
 * Get current user info
 * GET /auth/me
 */
export const getMe = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.userId)
    .populate({
      path: "roles",
      populate: { path: "permissions" }
    })
    .populate("directPermissions.permission");

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Get effective permissions
  const permissions = await user.getEffectivePermissions();

  res.json({
    status: "success",
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isSuperAdmin: user.isSuperAdmin,
        isActive: user.isActive,
        roles: user.roles.map(r => ({
          id: r._id,
          name: r.name,
          description: r.description
        })),
        permissions
      }
    }
  });
});
