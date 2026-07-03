import rateLimit, { ipKeyGenerator } from "express-rate-limit";

/** Reads a positive integer from the environment, falling back when unset or invalid. */
function envInt(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const MINUTE = 60 * 1000;

const GENERAL_WINDOW_MIN = envInt("RATE_LIMIT_GENERAL_WINDOW_MIN", 15);
const GENERAL_MAX = envInt("RATE_LIMIT_GENERAL_MAX", 300);
const LOGIN_WINDOW_MIN = envInt("RATE_LIMIT_LOGIN_WINDOW_MIN", 15);
const LOGIN_MAX = envInt("RATE_LIMIT_LOGIN_MAX", 10);
const OTP_WINDOW_MIN = envInt("RATE_LIMIT_OTP_WINDOW_MIN", 15);
const OTP_MAX = envInt("RATE_LIMIT_OTP_MAX", 6);
const EMAIL_WINDOW_MIN = envInt("RATE_LIMIT_EMAIL_WINDOW_MIN", 10);
const EMAIL_MAX = envInt("RATE_LIMIT_EMAIL_MAX", 3);

// Shared defaults: modern RateLimit-* headers, JSON errors matching the API's shape.
const defaults = {
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
};

/**
 * Key by client IP + target email so limits follow the account being acted on.
 * ipKeyGenerator normalizes IPv6 addresses to their /56 subnet, otherwise one
 * IPv6 user could rotate through addresses for a fresh bucket each request.
 */
function ipAndEmailKey(req) {
  const email = (req.body?.email || "").trim().toLowerCase();
  return `${ipKeyGenerator(req.ip)}:${email}`;
}

/** Generous safety net across the whole API. */
const generalLimiter = rateLimit({
  ...defaults,
  windowMs: GENERAL_WINDOW_MIN * MINUTE,
  limit: GENERAL_MAX,
});

/** Login: only failed attempts count, so real users are never locked out by success. */
const loginLimiter = rateLimit({
  ...defaults,
  windowMs: LOGIN_WINDOW_MIN * MINUTE,
  limit: LOGIN_MAX,
  keyGenerator: ipAndEmailKey,
  skipSuccessfulRequests: true,
  message: { message: `Too many login attempts. Please try again in ${LOGIN_WINDOW_MIN} minutes.` },
});

/** OTP verification: 6-digit codes are brute-forceable, so keep this tight. */
const otpVerifyLimiter = rateLimit({
  ...defaults,
  windowMs: OTP_WINDOW_MIN * MINUTE,
  limit: OTP_MAX,
  keyGenerator: ipAndEmailKey,
  skipSuccessfulRequests: true,
  message: { message: "Too many verification attempts. Please request a new code." },
});

/** Register / resend-otp both send an email — strictest, to prevent inbox spam. */
const emailSendLimiter = rateLimit({
  ...defaults,
  windowMs: EMAIL_WINDOW_MIN * MINUTE,
  limit: EMAIL_MAX,
  keyGenerator: ipAndEmailKey,
  message: { message: "Too many requests. Please wait before requesting another email." },
});

export { generalLimiter, loginLimiter, otpVerifyLimiter, emailSendLimiter };
