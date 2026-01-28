import mongoose from "mongoose";

const permissionSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ["SALES", "REPORTS", "USERS", "ROLES", "PERMISSIONS", "INVENTORY", "DEVICES", "SETTINGS"],
    required: true
  }
}, {
  timestamps: true
});

export default mongoose.model("Permission", permissionSchema);
