import Permission from "../../models/auth/permissionModel.js";
import catchAsync from "../../utils/catchAsync.js";
import AppError from "../../utils/appError.js";

/**
 * Get all permissions
 * GET /api/permissions
 */
export const getPermissions = catchAsync(async (req, res, next) => {
  const { category } = req.query;

  // Filter by category if provided
  const filter = category ? { category: category.toUpperCase() } : {};

  const permissions = await Permission.find(filter).sort({ category: 1, code: 1 });

  // Group permissions by category
  const groupedPermissions = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {});

  res.json({
    status: "success",
    results: permissions.length,
    data: {
      permissions,
      grouped: groupedPermissions
    }
  });
});

/**
 * Get permission by ID
 * GET /api/permissions/:id
 */
export const getPermission = catchAsync(async (req, res, next) => {
  const permission = await Permission.findById(req.params.id);

  if (!permission) {
    return next(new AppError("Permission not found", 404));
  }

  res.json({
    status: "success",
    data: { permission }
  });
});
