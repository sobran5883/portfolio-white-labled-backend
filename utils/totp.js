import crypto from "node:crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";

const APP_NAME = "Folionce";
const BACKUP_CODE_COUNT = 8;

// Accept ±30s so slight clock drift doesn't reject codes.
const EPOCH_TOLERANCE_SECONDS = 30;

function encryptionKey() {
  return crypto.createHash("sha256").update(`${process.env.JWT_SECRET}:totp`).digest();
}

/** AES-256-GCM so a DB dump alone doesn't expose authenticator secrets. */
function encryptSecret(secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

function decryptSecret(payload) {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

function generateTotpSecret() {
  return generateSecret();
}

function otpauthUrl(email, secret) {
  return generateURI({ issuer: APP_NAME, label: email, secret });
}

async function qrDataUri(email, secret) {
  return QRCode.toDataURL(otpauthUrl(email, secret), { margin: 1, width: 240 });
}

function verifyTotpCode(secret, code) {
  const token = String(code || "").trim();
  if (!/^\d{6}$/.test(token)) return false;
  return verifySync({ secret, token, epochTolerance: EPOCH_TOLERANCE_SECONDS }).valid;
}

function hashBackupCode(code) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(code.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .digest("hex");
}

/** 8 one-time codes like "K3F9C-A72QX" — shown once, stored only as hashes. */
function generateBackupCodes() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const codes = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    let raw = "";
    for (let j = 0; j < 10; j++) raw += alphabet[crypto.randomInt(alphabet.length)];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { codes, hashes: codes.map(hashBackupCode) };
}

/** Returns the remaining hashes if the code matched (consuming it), else null. */
function consumeBackupCode(hashes, code) {
  const target = hashBackupCode(String(code || ""));
  const idx = (hashes || []).indexOf(target);
  if (idx === -1) return null;
  return hashes.filter((_, i) => i !== idx);
}

export {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  otpauthUrl,
  qrDataUri,
  verifyTotpCode,
  generateBackupCodes,
  consumeBackupCode,
};
