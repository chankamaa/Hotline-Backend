import Role from "../../models/auth/roleModel.js";
import Permission from "../../models/auth/permissionModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Create new role
 * POST /api/roles
 */
export const createRole = catchAsync(async (req, res, next) => {
  const { name, description, permissions } = req.body;

  if (!name) {
    return next(new AppError("Role name is required", 400));
  }

  // Check if role already exists
  const existingRole = await Role.findOne({ name: name.toUpperCase() });
  if (existingRole) {
    return next(new AppError("Role already exists", 400));
  }

  // Validate permissions if provided
  let permissionIds = [];
  if (permissions && permissions.length > 0) {
    const foundPerms = await Permission.find({ _id: { $in: permissions } });
    if (foundPerms.length !== permissions.length) {
      return next(new AppError("One or more invalid permission IDs", 400));
    }
    permissionIds = foundPerms.map(p => p._id);
  }

  const role = await Role.create({
    name: name.toUpperCase(),
    description,
    permissions: permissionIds
  });

  await role.populate("permissions");

  res.status(201).json({
    status: "success",
    data: { role }
  });
});

/**
 * Get all roles
 * GET /api/roles
 */
export const getRoles = catchAsync(async (req, res, next) => {
  const roles = await Role.find().populate("permissions", "code description category");

  res.json({
    status: "success",
    results: roles.length,
    data: { roles }
  });
});

/**
 * Get role by ID
 * GET /api/roles/:id
 */
export const getRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id).populate("permissions");

  if (!role) {
    return next(new AppError("Role not found", 404));
  }

  res.json({
    status: "success",
    data: { role }
  });
});

/**
 * Update role
 * PUT /api/roles/:id
 */
export const updateRole = catchAsync(async (req, res, next) => {
  const { name, description, permissions } = req.body;

  const role = await Role.findById(req.params.id);
  if (!role) {
    return next(new AppError("Role not found", 404));
  }

  // Prevent renaming default roles
  if (role.isDefault && name && name.toUpperCase() !== role.name) {
    return next(new AppError("Cannot rename default system roles", 403));
  }

  // Update fields
  if (name) role.name = name.toUpperCase();
  if (description !== undefined) role.description = description;

  // Update permissions if provided
  if (permissions !== undefined) {
    if (permissions.length > 0) {
      const foundPerms = await Permission.find({ _id: { $in: permissions } });
      if (foundPerms.length !== permissions.length) {
        return next(new AppError("One or more invalid permission IDs", 400));
      }
    }
    role.permissions = permissions;
  }

  await role.save();
  await role.populate("permissions");

  res.json({
    status: "success",
    data: { role }
  });
});

/**
 * Delete role
 * DELETE /api/roles/:id
 */
export const deleteRole = catchAsync(async (req, res, next) => {
  const role = await Role.findById(req.params.id);

  if (!role) {
    return next(new AppError("Role not found", 404));
  }

  if (role.isDefault) {
    return next(new AppError("Cannot delete default system roles", 403));
  }

  await Role.findByIdAndDelete(req.params.id);

  res.json({
    status: "success",
    message: "Role deleted successfully"
  });
});

/**
 * Assign permissions to role
 * PUT /api/roles/:id/permissions
 */
export const assignPermissionsToRole = catchAsync(async (req, res, next) => {
  const { permissions } = req.body;

  if (!permissions || !Array.isArray(permissions)) {
    return next(new AppError("Permissions array is required", 400));
  }

  const role = await Role.findById(req.params.id);
  if (!role) {
    return next(new AppError("Role not found", 404));
  }

  // Validate all permission IDs
  if (permissions.length > 0) {
    const foundPerms = await Permission.find({ _id: { $in: permissions } });
    if (foundPerms.length !== permissions.length) {
      return next(new AppError("One or more invalid permission IDs", 400));
    }
  }

  role.permissions = permissions;
  await role.save();
  await role.populate("permissions");

  res.json({
    status: "success",
    data: { role }
  });
});
