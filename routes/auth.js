import express from "express";
import {
  register,
  verifyOtp,
  resendOtp,
  login,
  totpVerify,
  totpBackupVerify,
  totpEnrollBegin,
  totpEnrollConfirm,
  totpDisable,
  totpRegenerateBackupCodes,
  refresh,
  logout,
  reauth,
  me,
  updateProfile,
  changePassword,
  requestPasswordReset,
  resetPassword,
} from "../controllers/authController.js";
import requireAuth, { requireFreshAuth } from "../middleware/auth.js";
import { loginLimiter, otpVerifyLimiter, emailSendLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

// Signup (email OTP)
router.post("/register", emailSendLimiter, register);
router.post("/verify-otp", otpVerifyLimiter, verifyOtp);
router.post("/resend-otp", emailSendLimiter, resendOtp);

// Login (+ TOTP second factor)
router.post("/login", loginLimiter, login);
router.post("/totp/verify", otpVerifyLimiter, totpVerify);
router.post("/totp/backup/verify", otpVerifyLimiter, totpBackupVerify);

// TOTP enrollment (authenticated, opt-in from Settings)
router.post("/totp/enroll/begin", requireAuth, totpEnrollBegin);
router.post("/totp/enroll/confirm", requireAuth, otpVerifyLimiter, totpEnrollConfirm);

// TOTP management (step-up gated — re-prove credentials before touching 2FA)
router.post("/totp/disable", requireAuth, requireFreshAuth, totpDisable);
router.post("/totp/backup/regenerate", requireAuth, requireFreshAuth, totpRegenerateBackupCodes);

// Password reset (email OTP, unauthenticated)
router.post("/password/forgot", emailSendLimiter, requestPasswordReset);
router.post("/password/reset", otpVerifyLimiter, resetPassword);

// Session lifecycle
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/reauth", requireAuth, loginLimiter, reauth);
router.get("/me", requireAuth, me);

// Account settings (authenticated)
router.patch("/profile", requireAuth, updateProfile);
router.post("/change-password", requireAuth, loginLimiter, changePassword);

export default router;
