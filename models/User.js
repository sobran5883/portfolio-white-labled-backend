import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    // Admins are promoted manually (in the DB); signup always creates customers.
    userType: { type: String, enum: ["admin", "customer"], default: "customer" },
    totpEnabled: { type: Boolean, default: false },
    totpSecretEnc: { type: String, default: null },
    backupCodeHashes: { type: [String], default: [] },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(plain, salt);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    userType: this.userType || "customer",
    totpEnabled: this.totpEnabled,
  };
};

export default mongoose.model("User", userSchema);
