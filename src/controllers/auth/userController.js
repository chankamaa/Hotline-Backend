import User from "../../models/auth/userModel.js";
import Role from "../../models/auth/roleModel.js";
import Permission from "../../models/auth/permissionModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create new user
 * POST /api/users
 */
export const createUser = catchAsync(async (req, res, next) => {
  const { username, email, password, passwordConfirm, roles } = req.body;

  // Validate required fields
  if (!username || !password || !passwordConfirm || !roles) {
    return next(new AppError("Please provide all required fields", 400));
  }

  // Check if username already exists
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return next(new AppError("Username already exists", 400));
  }

  // Validate roles if provided
  let roleIds = [];
  if (roles) {
    // Handle both single string and array of role IDs
    const roleArray = Array.isArray(roles) ? roles : [roles];

    if (roleArray.length > 0) {
      const foundRoles = await Role.find({ _id: { $in: roleArray } });
      if (foundRoles.length !== roleArray.length) {
        return next(new AppError("One or more invalid role IDs", 400));
      }
      roleIds = foundRoles.map(r => r._id);
    }
  }

  const user = await User.create({
    username,
    email,
    password,
    passwordConfirm,
    roles: roleIds
  });

  res.status(201).json({
    status: "success",
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: roleIds
      }
    }
  });
});

/**
 * Get all users
 * GET /api/users
 */
export const getUsers = catchAsync(async (req, res, next) => {
  const users = await User.find()
    .select("-password -refreshToken")
    .populate("roles", "name description");

  res.json({
    status: "success",
    results: users.length,
    data: { users }
  });
});

/**
 * Get user by ID
 * GET /api/users/:id
 */
export const getUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select("-password -refreshToken")
    .populate({
      path: "roles",
      populate: { path: "permissions" }
    })
    .populate("directPermissions.permission");

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  res.json({
    status: "success",
    data: { user }
  });
});

/**
 * Update user
 * PUT /api/users/:id
 */
export const updateUser = catchAsync(async (req, res, next) => {
  const { username, email, isActive, password, passwordConfirm } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Prevent modifying super admin status through this endpoint
  if (user.isSuperAdmin && req.body.isSuperAdmin === false) {
    return next(new AppError("Cannot remove super admin status through this endpoint", 403));
  }

  // Update fields
  if (username) user.username = username;
  if (email) user.email = email;
  if (typeof isActive === "boolean") user.isActive = isActive;

  // Handle password update - let the model's pre-save hook do the hashing
  if (password) {
    if (!passwordConfirm) {
      return next(new AppError("Please provide password confirmation when updating password", 400));
    }
    user.password = password;  // Don't hash here - the pre-save hook will do it
    user.passwordConfirm = passwordConfirm;
  }

  await user.save();

  res.json({
    status: "success",
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        isActive: user.isActive
      }
    }
  });
});


/**
 * Delete user (soft delete)
 * DELETE /api/users/:id
 */
export const deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  if (user.isSuperAdmin) {
    return next(new AppError("Cannot delete super admin", 403));
  }

  // Soft delete
  user.isActive = false;
  await user.save();

  res.json({
    status: "success",
    message: "User deactivated successfully"
  });
});

/**
 * Assign roles to user
 * PUT /api/users/:id/roles
 */
export const assignRoles = catchAsync(async (req, res, next) => {
  const { roles } = req.body;

  if (!roles || !Array.isArray(roles)) {
    return next(new AppError("Roles array is required", 400));
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Validate all role IDs
  const foundRoles = await Role.find({ _id: { $in: roles } });
  if (foundRoles.length !== roles.length) {
    return next(new AppError("One or more invalid role IDs", 400));
  }

  user.roles = roles;
  await user.save();

  await user.populate("roles", "name description");

  res.json({
    status: "success",
    data: {
      user: {
        id: user._id,
        username: user.username,
        roles: user.roles
      }
    }
  });
});

/**
 * Assign direct permissions to user (Admin override feature)
 * PUT /api/users/:id/permissions
 */
export const assignDirectPermissions = catchAsync(async (req, res, next) => {
  const { permissions } = req.body;

  // Expected format: [{ permissionId: "...", type: "ALLOW" | "DENY" }]
  if (!permissions || !Array.isArray(permissions)) {
    return next(new AppError("Permissions array is required", 400));
  }

  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Validate permissions
  const permIds = permissions.map(p => p.permissionId);
  const foundPerms = await Permission.find({ _id: { $in: permIds } });

  if (foundPerms.length !== permIds.length) {
    return next(new AppError("One or more invalid permission IDs", 400));
  }

  // Validate types
  for (const perm of permissions) {
    if (!["ALLOW", "DENY"].includes(perm.type)) {
      return next(new AppError("Permission type must be ALLOW or DENY", 400));
    }
  }

  // Update direct permissions
  user.directPermissions = permissions.map(p => ({
    permission: p.permissionId,
    type: p.type
  }));

  await user.save();
  await user.populate("directPermissions.permission");

  res.json({
    status: "success",
    data: {
      user: {
        id: user._id,
        username: user.username,
        directPermissions: user.directPermissions
      }
    }
  });
});

/**
 * Get user's effective permissions
 * GET /api/users/:id/permissions
 */
export const getUserPermissions = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .populate({
      path: "roles",
      populate: { path: "permissions" }
    })
    .populate("directPermissions.permission");

  if (!user) {
    return next(new AppError("User not found", 404));
  }

  const permissions = await user.getEffectivePermissions();

  res.json({
    status: "success",
    data: {
      userId: user._id,
      username: user.username,
      ...permissions
    }
  });
});

/**
 * Update own profile (requires UPDATE_OWN_PROFILE permission)
 * PUT /api/users/me
 * Only managers and super admins can update their own profiles
 */
export const updateMyProfile = catchAsync(async (req, res, next) => {
  const { username, email, password, passwordConfirm } = req.body;

  const user = await User.findById(req.userId);
  if (!user) {
    return next(new AppError("User not found", 404));
  }

  // Update allowed fields only
  if (username) user.username = username;
  if (email) user.email = email;

  // Handle password update
  if (password) {
    if (!passwordConfirm) {
      return next(new AppError("Please provide password confirmation when updating password", 400));
    }
    user.password = password;
    user.passwordConfirm = passwordConfirm;
  }

  await user.save();

  res.json({
    status: "success",
    message: "Profile updated successfully",
    data: {
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    }
  });
});
