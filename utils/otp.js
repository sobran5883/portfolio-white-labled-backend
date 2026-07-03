import crypto from "node:crypto";

/** Random 6-digit code as a string, zero-padded so the full space is used. */
function generateOtp() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** OTPs are never stored in plaintext; HMAC keyed by JWT_SECRET and bound to the email. */
function hashOtp(email, otp) {
  return crypto
    .createHmac("sha256", process.env.JWT_SECRET)
    .update(`${email.toLowerCase()}:${otp}`)
    .digest("hex");
}

function verifyOtpHash(email, otp, expectedHash) {
  const actual = hashOtp(email, otp);
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expectedHash));
}

export { generateOtp, hashOtp, verifyOtpHash };
