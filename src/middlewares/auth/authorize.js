import User from "../../models/auth/userModel.js";

/**
 * Authorization middleware
 * Checks if user has required permission(s)
 *
 * @param {string|string[]} permissionCode - Required permission code(s)
 * @param {object} options - Options for authorization
 * @param {boolean} options.requireAll - If true and multiple permissions, require ALL. Default: false (any)
 */
export const authorize = (permissionCode, options = {}) => {
  const { requireAll = false } = options;
  const requiredPermissions = Array.isArray(permissionCode) ? permissionCode : [permissionCode];

  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId)
        .populate({
          path: "roles",
          populate: { path: "permissions" }
        })
        .populate("directPermissions.permission");

      if (!user) {
        return res.status(401).json({
          status: "error",
          message: "User not found"
        });
      }

      // Super admin bypasses all permission checks
      if (user.isSuperAdmin) {
        return next();
      }

      // Check each required permission
      const permissionResults = [];

      for (const permCode of requiredPermissions) {
        // 1. Check direct permission override first
        const directPerm = user.directPermissions.find(
          dp => dp.permission && dp.permission.code === permCode
        );

        if (directPerm) {
          if (directPerm.type === "DENY") {
            permissionResults.push({ code: permCode, allowed: false, reason: "denied" });
          } else {
            permissionResults.push({ code: permCode, allowed: true, reason: "direct" });
          }
          continue;
        }

        // 2. Check role permissions
        const rolePerms = user.roles.flatMap(r =>
          r.permissions ? r.permissions.map(p => p.code) : []
        );

        if (rolePerms.includes(permCode)) {
          permissionResults.push({ code: permCode, allowed: true, reason: "role" });
        } else {
          permissionResults.push({ code: permCode, allowed: false, reason: "missing" });
        }
      }

      // Determine if access should be granted
      const allowedCount = permissionResults.filter(r => r.allowed).length;
      const accessGranted = requireAll
        ? allowedCount === requiredPermissions.length
        : allowedCount > 0;

      if (!accessGranted) {
        const missingPerms = permissionResults
          .filter(r => !r.allowed)
          .map(r => r.code);

        return res.status(403).json({
          status: "error",
          message: "Access denied",
          required: requiredPermissions,
          missing: missingPerms
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Role-based authorization middleware
 * Checks if user has one of the required roles
 *
 * @param {string|string[]} roleName - Required role name(s)
 */
export const authorizeRole = (roleName) => {
  const requiredRoles = Array.isArray(roleName) ? roleName : [roleName];

  return async (req, res, next) => {
    try {
      const user = await User.findById(req.userId).populate("roles");

      if (!user) {
        return res.status(401).json({
          status: "error",
          message: "User not found"
        });
      }

      // Super admin bypasses all checks
      if (user.isSuperAdmin) {
        return next();
      }

      const userRoles = user.roles.map(r => r.name);
      const hasRole = requiredRoles.some(role => userRoles.includes(role));

      if (!hasRole) {
        return res.status(403).json({
          status: "error",
          message: "Access denied",
          required: requiredRoles,
          userRoles
        });
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Super admin only middleware
 */
export const superAdminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);

    if (!user || !user.isSuperAdmin) {
      return res.status(403).json({
        status: "error",
        message: "Super admin access required"
      });
    }

    next();
  } catch (err) {
    next(err);
  }
};
