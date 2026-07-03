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
  refresh,
  logout,
  reauth,
  me,
} from "../controllers/authController.js";
import requireAuth from "../middleware/auth.js";
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

// TOTP enrollment (authenticated, forced on first login)
router.post("/totp/enroll/begin", requireAuth, totpEnrollBegin);
router.post("/totp/enroll/confirm", requireAuth, otpVerifyLimiter, totpEnrollConfirm);

// Session lifecycle
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/reauth", requireAuth, loginLimiter, reauth);
router.get("/me", requireAuth, me);

export default router;
