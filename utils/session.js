import crypto from "node:crypto";
import { getRedis } from "./redis.js";

const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60; // sliding — extended on each refresh
const REFRESH_COOKIE = "wlp_refresh";
// Only sent to the auth routes, so it doesn't ride along on every API call.
const REFRESH_COOKIE_PATH = "/api/auth";

const sessionKey = (sid) => `session:${sid}`;

function hashSecret(secret) {
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(secret).digest("hex");
}

/**
 * Creates a server-side session and returns the refresh cookie value.
 * The cookie is `<sid>.<secret>`; only the HMAC of the secret is stored, so a
 * Redis dump alone can't forge a refresh token.
 */
async function createSession(userId) {
  const redis = await getRedis();
  const sid = crypto.randomBytes(16).toString("hex");
  const secret = crypto.randomBytes(32).toString("hex");
  const session = {
    userId: String(userId),
    refreshHash: hashSecret(secret),
    credentialProvedAt: Date.now(),
    createdAt: Date.now(),
  };
  await redis.set(sessionKey(sid), JSON.stringify(session), { EX: REFRESH_TTL_SECONDS });
  return { sid, cookieValue: `${sid}.${secret}` };
}

async function getSession(sid) {
  const redis = await getRedis();
  const raw = await redis.get(sessionKey(sid));
  return raw ? JSON.parse(raw) : null;
}

/**
 * Validates a refresh cookie and rotates its secret, sliding the TTL.
 * A stale secret (already rotated — i.e. replay) revokes the whole session.
 * Returns { sid, userId, cookieValue } or null when the cookie is invalid.
 */
async function rotateSession(cookieValue) {
  const [sid, secret] = String(cookieValue || "").split(".");
  if (!sid || !secret) return null;

  const redis = await getRedis();
  const session = await getSession(sid);
  if (!session) return null;

  if (!crypto.timingSafeEqual(
    Buffer.from(hashSecret(secret)),
    Buffer.from(session.refreshHash)
  )) {
    // Replayed (already-rotated) token: someone else may hold the live one.
    await redis.del(sessionKey(sid));
    return null;
  }

  const nextSecret = crypto.randomBytes(32).toString("hex");
  session.refreshHash = hashSecret(nextSecret);
  await redis.set(sessionKey(sid), JSON.stringify(session), { EX: REFRESH_TTL_SECONDS });
  return { sid, userId: session.userId, cookieValue: `${sid}.${nextSecret}` };
}

/** Marks credentials as re-proved now (login/TOTP/step-up), keeping the TTL. */
async function touchCredentialProof(sid) {
  const redis = await getRedis();
  const session = await getSession(sid);
  if (!session) return false;
  session.credentialProvedAt = Date.now();
  await redis.set(sessionKey(sid), JSON.stringify(session), { KEEPTTL: true });
  return true;
}

async function revokeSession(sid) {
  const redis = await getRedis();
  await redis.del(sessionKey(sid));
}

function setRefreshCookie(res, cookieValue) {
  res.cookie(REFRESH_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
}

function readRefreshCookie(req) {
  return req.cookies?.[REFRESH_COOKIE] || null;
}

export {
  createSession,
  getSession,
  rotateSession,
  touchCredentialProof,
  revokeSession,
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
};
