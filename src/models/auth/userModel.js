import mongoose from "mongoose";
import validator from "validator";

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: [true,'Please provide a unique username'],
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    unique: [true,'Please provide a unique email'],
    sparse: true, // Allows null values while maintaining uniqueness
    lowercase: true,
    trim: true,
    validate: {
      validator: validator.isEmail,
      message: "Please provide a valid email address"
    }
  },
  password: { 
    type: String, 
    required: [true,'Please provide a password'],  
    minlength: [8,'Please provide a password with minimum length of 8 characters'],
    select: false // Don't include password in queries by default
  },

  passwordConfirm: {
    type: String,
    required: [true,'Please provide a password confirmation '],
    validate: {
      validator: function(v) {
        return this.password === v;
      },
      message: "Passwords do not match"
    }
  },

 // Roles assigned to this user
roles: {
  type: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Role"
  }],
  validate: {
    validator: function(v) {
      return v && v.length > 0;
    },
    message: 'Please provide at least one role'
  }
},
  // Direct permission overrides (Admin can assign extra permissions or deny specific ones)
  directPermissions: [{
    permission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Permission"
    },
    type: { 
      type: String, 
      enum: ["ALLOW", "DENY"],
      required: true
    }
  }],

  // Super admin bypasses all permission checks
  isSuperAdmin: {
    type: Boolean,
    default: false
  },

  // Account status
  isActive: {
    type: Boolean,
    default: true
  },

  refreshToken: {
    type: String,
    select: false
  }

}, {
  timestamps: true
});

// works on create and save methods
userSchema.pre('save', async function(next) {
   if(!this.isModified('password')) return next();

    this.password=await bcrypt.hash(this.password,12);
    this.passwordConfirm=undefined;
    next();

});

// Method to check if user has a specific permission
userSchema.methods.hasPermission = async function(permissionCode) {
  // Super admin has all permissions
  if (this.isSuperAdmin) return true;

  // Populate if not already populated
  if (!this.populated('roles')) {
    await this.populate({
      path: 'roles',
      populate: { path: 'permissions' }
    });
  }
  if (!this.populated('directPermissions.permission')) {
    await this.populate('directPermissions.permission');
  }

  // Check direct permission override first
  const directPerm = this.directPermissions.find(
    dp => dp.permission && dp.permission.code === permissionCode
  );

  if (directPerm) {
    return directPerm.type === "ALLOW";
  }

  // Check role permissions
  const rolePerms = this.roles.flatMap(r => 
    r.permissions ? r.permissions.map(p => p.code) : []
  );

  return rolePerms.includes(permissionCode);
};

// Method to get all effective permissions
userSchema.methods.getEffectivePermissions = async function() {
  if (this.isSuperAdmin) {
    return { isSuperAdmin: true, permissions: "ALL" };
  }

  // Populate if needed
  if (!this.populated('roles')) {
    await this.populate({
      path: 'roles',
      populate: { path: 'permissions' }
    });
  }
  if (!this.populated('directPermissions.permission')) {
    await this.populate('directPermissions.permission');
  }

  // Get all role permissions
  const rolePerms = new Set();
  this.roles.forEach(role => {
    if (role.permissions) {
      role.permissions.forEach(p => rolePerms.add(p.code));
    }
  });

  // Apply direct permission overrides
  const allowedPerms = new Set(rolePerms);
  const deniedPerms = new Set();

  this.directPermissions.forEach(dp => {
    if (dp.permission) {
      if (dp.type === "ALLOW") {
        allowedPerms.add(dp.permission.code);
      } else if (dp.type === "DENY") {
        allowedPerms.delete(dp.permission.code);
        deniedPerms.add(dp.permission.code);
      }
    }
  });

  return {
    isSuperAdmin: false,
    rolePermissions: Array.from(rolePerms),
    directAllowed: this.directPermissions
      .filter(dp => dp.type === "ALLOW" && dp.permission)
      .map(dp => dp.permission.code),
    directDenied: this.directPermissions
      .filter(dp => dp.type === "DENY" && dp.permission)
      .map(dp => dp.permission.code),
    effectivePermissions: Array.from(allowedPerms)
  };
};

export default mongoose.model("User", userSchema);
