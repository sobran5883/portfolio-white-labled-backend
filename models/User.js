import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Razorpay subscription state, kept per user. `status` mirrors the Razorpay
// subscription lifecycle and is driven authoritatively by webhooks.
// Publishing is gated on ENTITLED_SUB_STATUSES (see hasActiveSubscription).
const subscriptionSchema = new mongoose.Schema(
  {
    provider: { type: String, default: "razorpay" },
    subscriptionId: { type: String, default: null, index: true },
    customerId: { type: String, default: null },
    planId: { type: String, default: null },
    // none | created | authenticated | active | pending | halted | cancelled | completed | expired
    status: { type: String, default: "none" },
    // End of the currently paid-for period (from subscription.charged webhook).
    currentEnd: { type: Date, default: null },
    lastEventAt: { type: Date, default: null },
  },
  { _id: false }
);

// Statuses that entitle a user to keep their portfolio published. `authenticated`
// is included because the mandate is set up and the first charge is imminent;
// `active` is the steady state after a successful charge.
export const ENTITLED_SUB_STATUSES = new Set(["authenticated", "active"]);

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
    subscription: { type: subscriptionSchema, default: () => ({}) },
  },
  { timestamps: true }
);

/**
 * True when the user is entitled to publish: an entitled status and, if we know
 * the paid-through date, it hasn't passed. Webhooks flip status to halted/
 * cancelled on lapse, so the date check is just a safety net.
 */
userSchema.methods.hasActiveSubscription = function hasActiveSubscription() {
  const sub = this.subscription;
  if (!sub || !ENTITLED_SUB_STATUSES.has(sub.status)) return false;
  if (sub.currentEnd && sub.currentEnd.getTime() < Date.now()) return false;
  return true;
};

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
    subscription: {
      status: this.subscription?.status || "none",
      active: this.hasActiveSubscription(),
      currentEnd: this.subscription?.currentEnd || null,
    },
  };
};

export default mongoose.model("User", userSchema);
