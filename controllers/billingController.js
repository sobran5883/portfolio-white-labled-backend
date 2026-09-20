import crypto from "crypto";
import User from "../models/User.js";
import Portfolio from "../models/Portfolio.js";
import { getRazorpay, isRazorpayConfigured } from "../config/razorpay.js";

// How many billing cycles the subscription runs before completing. Razorpay
// requires a finite count; 120 months = 10 years is effectively "until cancelled".
const TOTAL_CYCLES = Number(process.env.RAZORPAY_TOTAL_CYCLES || 120);

/**
 * GET /api/billing/status
 * Returns the caller's subscription snapshot for the dashboard UI.
 */
export async function getSubscriptionStatus(req, res) {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found." });

  res.json({
    configured: isRazorpayConfigured(),
    keyId: process.env.RAZORPAY_KEY_ID || null,
    subscription: {
      status: user.subscription?.status || "none",
      active: user.hasActiveSubscription(),
      currentEnd: user.subscription?.currentEnd || null,
      subscriptionId: user.subscription?.subscriptionId || null,
    },
  });
}

/**
 * POST /api/billing/subscription
 * Creates (or reuses) a Razorpay subscription for the caller and returns the
 * subscription id, which the frontend hands to Razorpay Checkout to collect
 * the mandate. Activation itself is confirmed later via webhook.
 */
export async function createSubscription(req, res) {
  if (!isRazorpayConfigured()) {
    return res.status(503).json({ message: "Payments are not configured yet." });
  }
  const planId = process.env.RAZORPAY_PLAN_ID;
  if (!planId) {
    return res.status(503).json({ message: "No billing plan configured (set RAZORPAY_PLAN_ID)." });
  }

  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found." });

  // Already entitled — nothing to buy.
  if (user.hasActiveSubscription()) {
    return res.status(409).json({ message: "You already have an active subscription." });
  }

  const razorpay = getRazorpay();

  // Reuse an in-flight subscription (created but mandate not yet authorized) so
  // repeated clicks don't spawn duplicates in the Razorpay dashboard.
  let subscriptionId = null;
  if (user.subscription?.subscriptionId && user.subscription.status === "created") {
    subscriptionId = user.subscription.subscriptionId;
  } else {
    const sub = await razorpay.subscriptions.create({
      plan_id: planId,
      total_count: TOTAL_CYCLES,
      customer_notify: 1,
      notes: { userId: String(user._id), email: user.email },
    });
    subscriptionId = sub.id;
    user.subscription = {
      ...user.subscription?.toObject?.(),
      provider: "razorpay",
      subscriptionId: sub.id,
      planId,
      status: sub.status || "created",
      lastEventAt: null,
    };
    await user.save();
  }

  res.json({
    subscriptionId,
    keyId: process.env.RAZORPAY_KEY_ID,
    // Prefill for the Razorpay Checkout modal.
    prefill: { name: user.name, email: user.email },
  });
}

/**
 * POST /api/billing/cancel
 * Cancels at the end of the current cycle (user keeps access until currentEnd).
 */
export async function cancelSubscription(req, res) {
  if (!isRazorpayConfigured()) {
    return res.status(503).json({ message: "Payments are not configured yet." });
  }
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found." });

  const subId = user.subscription?.subscriptionId;
  if (!subId) return res.status(400).json({ message: "No subscription to cancel." });

  // cancel_at_cycle_end=1 keeps the portfolio live until the paid period ends.
  await getRazorpay().subscriptions.cancel(subId, { cancel_at_cycle_end: 1 });
  res.json({ message: "Subscription will be cancelled at the end of the current cycle." });
}

// ---- Webhook ------------------------------------------------------------

// Maps a Razorpay subscription entity onto our stored fields.
function applySubscriptionEntity(user, entity) {
  if (!user.subscription) user.subscription = {};
  user.subscription.subscriptionId = entity.id || user.subscription.subscriptionId;
  user.subscription.planId = entity.plan_id || user.subscription.planId;
  user.subscription.customerId = entity.customer_id || user.subscription.customerId;
  if (entity.status) user.subscription.status = entity.status;
  // current_end is a unix timestamp (seconds) marking the paid-through date.
  if (entity.current_end) {
    user.subscription.currentEnd = new Date(entity.current_end * 1000);
  }
  user.subscription.lastEventAt = new Date();
}

/**
 * POST /api/billing/webhook  (raw body, mounted before express.json in server.js)
 * Verifies the Razorpay signature, then updates the owning user's subscription
 * state. This is the authoritative source of truth for entitlement.
 */
export async function handleWebhook(req, res) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing] RAZORPAY_WEBHOOK_SECRET not set; rejecting webhook.");
    return res.status(503).end();
  }

  const signature = req.headers["x-razorpay-signature"];
  // req.body is a Buffer here (express.raw). Verify HMAC over the exact bytes.
  const expected = crypto.createHmac("sha256", secret).update(req.body).digest("hex");

  const sigBuf = Buffer.from(signature || "", "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return res.status(400).json({ message: "Invalid signature." });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Invalid payload." });
  }

  const event = payload.event || "";
  const entity = payload.payload?.subscription?.entity;

  // Only subscription.* events carry a subscription entity we can act on.
  if (entity?.id) {
    // Locate the user: subscriptionId is fastest; notes.userId is the fallback.
    let user = await User.findOne({ "subscription.subscriptionId": entity.id });
    if (!user && entity.notes?.userId) {
      user = await User.findById(entity.notes.userId);
    }

    if (user) {
      applySubscriptionEntity(user, entity);
      await user.save();

      // Auto-unpublish on lapse: once entitlement is gone (halted after failed
      // payment, cancelled/completed/expired, or paid period elapsed), the
      // portfolio must not stay live. Covers all lapse events uniformly and
      // respects the cycle-end grace window baked into hasActiveSubscription.
      if (!user.hasActiveSubscription()) {
        const result = await Portfolio.updateOne(
          { user: user._id, published: true },
          { published: false }
        );
        if (result.modifiedCount) {
          console.log(`[billing] ${event} -> unpublished portfolio for user ${user._id}`);
        }
      }

      console.log(`[billing] ${event} -> user ${user._id} status=${user.subscription.status}`);
    } else {
      console.warn(`[billing] ${event} for unknown subscription ${entity.id}`);
    }
  }

  // Always 200 so Razorpay stops retrying once we've accepted the event.
  res.json({ received: true });
}
