import express from "express";
import requireAuth from "../middleware/auth.js";
import {
  getSubscriptionStatus,
  createSubscription,
  cancelSubscription,
} from "../controllers/billingController.js";

// NOTE: the webhook route is NOT here — it needs the raw request body for
// signature verification and is mounted directly in server.js before the JSON
// body parser. These routes are the authenticated, JSON-bodied endpoints.
const router = express.Router();

router.use(requireAuth);

router.get("/status", getSubscriptionStatus);
router.post("/subscription", createSubscription);
router.post("/cancel", cancelSubscription);

export default router;
