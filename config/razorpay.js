import Razorpay from "razorpay";

// Razorpay client, initialized from env. Kept lazy so the app can still boot
// (and non-billing routes work) if keys are missing in local dev — the billing
// controller surfaces a clear 503 instead of crashing at import time.
let client = null;

export function getRazorpay() {
  if (client) return client;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error("Razorpay is not configured (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET).");
  }

  client = new Razorpay({ key_id, key_secret });
  return client;
}

export function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
