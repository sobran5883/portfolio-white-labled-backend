import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Portfolio from "../models/Portfolio.js";
import buildDefaultPortfolio from "../config/defaultPortfolio.js";
import { signToken } from "../utils/jwt.js";
import { getRedis } from "../utils/redis.js";
import { generateOtp, hashOtp, verifyOtpHash } from "../utils/otp.js";
import { sendOtpEmail } from "../utils/mailer.js";
import {
  createSession,
  rotateSession,
  touchCredentialProof,
  revokeSession,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from "../utils/session.js";
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  otpauthUrl,
  qrDataUri,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
} from "../utils/totp.js";

const ACCESS_TTL_SECONDS = 15 * 60;
const OTP_TTL_SECONDS = 10 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const TOTP_CHALLENGE_TTL_SECONDS = 5 * 60;
const TOTP_ENROLL_TTL_SECONDS = 10 * 60;

const pendingKey = (email) => `otp:register:${email}`;
const cooldownKey = (email) => `otp:resend:${email}`;
const totpChallengeKey = (id) => `totp:login:${id}`;
const totpEnrollKey = (userId) => `totp:enroll:${userId}`;

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function fail(res, status, error, message, extra = {}) {
  return res.status(status).json({ error, message, ...extra });
}

/**
 * Mints the session: refresh cookie (httpOnly, rotated) + short-lived access
 * token for memory. TOTP is mandatory, so the response always tells the
 * client whether enrollment is still owed.
 */
async function issueTokens(res, user, status = 200) {
  const { sid, cookieValue } = await createSession(user._id);
  setRefreshCookie(res, cookieValue);
  const token = signToken({ sub: user._id.toString(), sid }, `${ACCESS_TTL_SECONDS}s`);
  return res.status(status).json({
    token,
    expires_in: ACCESS_TTL_SECONDS,
    user: user.toSafeJSON(),
    totp_enrollment_required: !user.totpEnabled,
  });
}

/* ------------------------------------------------------------------ */
/* Registration (email OTP)                                            */
/* ------------------------------------------------------------------ */

/**
 * Step 1 of signup: no account is created yet. The registration data and a
 * hashed OTP are parked in Redis for 10 minutes while the email is verified.
 */
async function register(req, res) {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return fail(res, 400, "validation_error", "Name, email and password are required.");
  }
  if (!isValidEmail(email)) {
    return fail(res, 400, "validation_error", "Please provide a valid email address.");
  }
  if (password.length < 6) {
    return fail(res, 400, "validation_error", "Password must be at least 6 characters.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return fail(res, 409, "email_taken", "An account with that email already exists.");
  }

  const redis = await getRedis();
  const otp = generateOtp();
  const pending = {
    name,
    email: normalizedEmail,
    passwordHash: await bcrypt.hash(password, 10),
    otpHash: hashOtp(normalizedEmail, otp),
    attempts: 0,
  };
  await redis.set(pendingKey(normalizedEmail), JSON.stringify(pending), {
    EX: OTP_TTL_SECONDS,
  });
  await redis.set(cooldownKey(normalizedEmail), "1", {
    EX: OTP_RESEND_COOLDOWN_SECONDS,
  });

  await sendOtpEmail(normalizedEmail, otp);

  res.json({
    pending: true,
    email: normalizedEmail,
    message: "We sent a verification code to your email.",
  });
}

/** Step 2 of signup: a correct OTP creates the account and signs the user in. */
async function verifyOtp(req, res) {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return fail(res, 400, "validation_error", "Email and verification code are required.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const redis = await getRedis();
  const key = pendingKey(normalizedEmail);
  const raw = await redis.get(key);
  if (!raw) {
    return fail(res, 400, "otp_expired", "Verification code expired. Please register again.");
  }

  const pending = JSON.parse(raw);
  if (!verifyOtpHash(normalizedEmail, String(otp).trim(), pending.otpHash)) {
    pending.attempts += 1;
    if (pending.attempts >= OTP_MAX_ATTEMPTS) {
      await redis.del(key);
      return fail(res, 429, "otp_expired", "Too many incorrect attempts. Please register again.");
    }
    await redis.set(key, JSON.stringify(pending), { KEEPTTL: true });
    return fail(
      res,
      400,
      "invalid_otp",
      `Incorrect code. ${OTP_MAX_ATTEMPTS - pending.attempts} attempts left.`
    );
  }

  await redis.del(key);
  await redis.del(cooldownKey(normalizedEmail));

  // The pending window is short, but the email could have been registered
  // through a parallel flow in the meantime.
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return fail(res, 409, "email_taken", "An account with that email already exists.");
  }

  const user = new User({
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash,
  });
  await user.save();

  // Seed the user's portfolio with the default template content.
  await Portfolio.create({ user: user._id, ...buildDefaultPortfolio(pending.name) });

  return issueTokens(res, user, 201);
}

/** Re-sends a fresh code for a pending registration, at most once a minute. */
async function resendOtp(req, res) {
  const { email } = req.body || {};
  if (!email) {
    return fail(res, 400, "validation_error", "Email is required.");
  }

  const normalizedEmail = email.toLowerCase().trim();
  const redis = await getRedis();
  const key = pendingKey(normalizedEmail);
  const raw = await redis.get(key);
  if (!raw) {
    return fail(res, 400, "otp_expired", "Registration session expired. Please register again.");
  }

  const wait = await redis.ttl(cooldownKey(normalizedEmail));
  if (wait > 0) {
    return fail(res, 429, "rate_limited", `Please wait ${wait}s before requesting a new code.`);
  }

  const pending = JSON.parse(raw);
  const otp = generateOtp();
  pending.otpHash = hashOtp(normalizedEmail, otp);
  pending.attempts = 0;
  await redis.set(key, JSON.stringify(pending), { EX: OTP_TTL_SECONDS });
  await redis.set(cooldownKey(normalizedEmail), "1", {
    EX: OTP_RESEND_COOLDOWN_SECONDS,
  });

  await sendOtpEmail(normalizedEmail, otp);

  res.json({
    pending: true,
    email: normalizedEmail,
    message: "We sent a new verification code to your email.",
  });
}

/* ------------------------------------------------------------------ */
/* Login (TOTP-gated once enrolled)                                    */
/* ------------------------------------------------------------------ */

async function login(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return fail(res, 400, "validation_error", "Email and password are required.");
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await user.verifyPassword(password))) {
    return fail(res, 401, "invalid_credentials", "Invalid email or password.");
  }

  // Enrolled users owe a TOTP code before any tokens are minted.
  if (user.totpEnabled) {
    const redis = await getRedis();
    const challenge = crypto.randomBytes(24).toString("hex");
    await redis.set(totpChallengeKey(challenge), user._id.toString(), {
      EX: TOTP_CHALLENGE_TTL_SECONDS,
    });
    return res.json({
      totp_required: true,
      totp_challenge: challenge,
      challenge_expires_in: TOTP_CHALLENGE_TTL_SECONDS,
    });
  }

  return issueTokens(res, user);
}

/** Resolves a login TOTP challenge into a user, or responds with the error. */
async function resolveChallenge(req, res) {
  const { challenge } = req.body || {};
  if (!challenge) {
    fail(res, 400, "validation_error", "Challenge and code are required.");
    return null;
  }
  const redis = await getRedis();
  const userId = await redis.get(totpChallengeKey(String(challenge)));
  if (!userId) {
    fail(res, 401, "challenge_expired", "Login session expired. Please enter your password again.");
    return null;
  }
  const user = await User.findById(userId);
  if (!user) {
    fail(res, 401, "challenge_expired", "Login session expired. Please enter your password again.");
    return null;
  }
  return user;
}

async function totpVerify(req, res) {
  const user = await resolveChallenge(req, res);
  if (!user) return;

  const { challenge, code } = req.body;
  if (!user.totpSecretEnc || !verifyTotpCode(decryptSecret(user.totpSecretEnc), code)) {
    return fail(res, 401, "invalid_totp", "Invalid code. Please try again.");
  }

  const redis = await getRedis();
  await redis.del(totpChallengeKey(String(challenge)));
  return issueTokens(res, user);
}

async function totpBackupVerify(req, res) {
  const user = await resolveChallenge(req, res);
  if (!user) return;

  const { challenge, code } = req.body;
  const remaining = consumeBackupCode(user.backupCodeHashes, code);
  if (remaining === null) {
    // Same code as a bad TOTP on purpose — don't reveal which factor failed.
    return fail(res, 401, "invalid_totp", "Invalid code. Please try again.");
  }
  user.backupCodeHashes = remaining;
  await user.save();

  const redis = await getRedis();
  await redis.del(totpChallengeKey(String(challenge)));
  return issueTokens(res, user);
}

/* ------------------------------------------------------------------ */
/* TOTP enrollment (mandatory, right after first login)                */
/* ------------------------------------------------------------------ */

async function totpEnrollBegin(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return fail(res, 404, "not_found", "User not found.");
  if (user.totpEnabled) {
    return fail(res, 400, "already_enrolled", "Two-factor authentication is already set up.");
  }

  const secret = generateTotpSecret();
  const redis = await getRedis();
  await redis.set(totpEnrollKey(req.userId), secret, { EX: TOTP_ENROLL_TTL_SECONDS });

  res.json({
    secret,
    otpauth_url: otpauthUrl(user.email, secret),
    qr_data_uri: await qrDataUri(user.email, secret),
    expires_in: TOTP_ENROLL_TTL_SECONDS,
  });
}

async function totpEnrollConfirm(req, res) {
  const { code } = req.body || {};
  const user = await User.findById(req.userId);
  if (!user) return fail(res, 404, "not_found", "User not found.");
  if (user.totpEnabled) {
    return fail(res, 400, "already_enrolled", "Two-factor authentication is already set up.");
  }

  const redis = await getRedis();
  const secret = await redis.get(totpEnrollKey(req.userId));
  if (!secret) {
    return fail(res, 400, "enrollment_expired", "Setup session expired. Please scan a fresh QR code.");
  }
  if (!verifyTotpCode(secret, code)) {
    return fail(res, 400, "invalid_totp", "Invalid code. Please try again.");
  }

  const { codes, hashes } = generateBackupCodes();
  user.totpSecretEnc = encryptSecret(secret);
  user.totpEnabled = true;
  user.backupCodeHashes = hashes;
  await user.save();
  await redis.del(totpEnrollKey(req.userId));

  // Shown exactly once — only hashes are kept server-side.
  res.json({ backup_codes: codes, user: user.toSafeJSON() });
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

/** Cookie-only. Rotates the refresh token and mints a fresh access token. */
async function refresh(req, res) {
  const cookie = readRefreshCookie(req);
  if (!cookie) {
    return fail(res, 401, "invalid_token", "No session.");
  }

  const rotated = await rotateSession(cookie);
  if (!rotated) {
    clearRefreshCookie(res);
    return fail(res, 401, "invalid_token", "Session has ended. Please log in again.");
  }

  const user = await User.findById(rotated.userId);
  if (!user) {
    await revokeSession(rotated.sid);
    clearRefreshCookie(res);
    return fail(res, 401, "invalid_token", "Session has ended. Please log in again.");
  }

  setRefreshCookie(res, rotated.cookieValue);
  const token = signToken({ sub: rotated.userId, sid: rotated.sid }, `${ACCESS_TTL_SECONDS}s`);
  res.json({
    token,
    expires_in: ACCESS_TTL_SECONDS,
    user: user.toSafeJSON(),
    totp_enrollment_required: !user.totpEnabled,
  });
}

/** Idempotent: revokes the session behind the cookie and clears it. */
async function logout(req, res) {
  const cookie = readRefreshCookie(req);
  const sid = String(cookie || "").split(".")[0];
  if (sid) await revokeSession(sid);
  clearRefreshCookie(res);
  res.status(204).end();
}

/**
 * Step-up re-auth: re-prove password (+ TOTP once enrolled) to reopen the
 * 10-minute fresh-credentials window on the current session.
 */
async function reauth(req, res) {
  const { password, code } = req.body || {};
  if (!password) {
    return fail(res, 400, "validation_error", "Password is required.");
  }

  const user = await User.findById(req.userId);
  if (!user || !(await user.verifyPassword(password))) {
    return fail(res, 401, "invalid_credentials", "Incorrect password.");
  }

  if (user.totpEnabled) {
    if (!code || !verifyTotpCode(decryptSecret(user.totpSecretEnc), code)) {
      return fail(res, 401, "invalid_totp", "Invalid code. Please try again.");
    }
  }

  await touchCredentialProof(req.sessionId);
  res.json({ ok: true });
}

async function me(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return fail(res, 404, "not_found", "User not found.");
  res.json({ user: user.toSafeJSON(), totp_enrollment_required: !user.totpEnabled });
}

export {
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
};
