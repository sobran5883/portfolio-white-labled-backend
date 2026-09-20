import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import connectDB from "./config/db.js";
import errorHandler from "./middleware/errorHandler.js";
import { generalLimiter } from "./middleware/rateLimit.js";

import authRoutes from "./routes/auth.js";
import portfolioRoutes from "./routes/portfolio.js";
import publicRoutes from "./routes/public.js";
import uploadRoutes from "./routes/upload.js";
import adminRoutes from "./routes/admin.js";
import billingRoutes from "./routes/billing.js";
import { handleWebhook } from "./controllers/billingController.js";

const app = express();

// Behind a reverse proxy (nginx, Render, etc.) set TRUST_PROXY=1 (or the hop
// count) so req.ip — and therefore rate limiting — sees the real client IP.
if (process.env.TRUST_PROXY) {
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);
}

// CORS: allow the configured frontend origin(s).
const origins = (process.env.CLIENT_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
app.use(cors({ origin: origins, credentials: true }));

// Razorpay webhook: mounted BEFORE express.json() and the rate limiter because
// signature verification needs the exact raw bytes, and Razorpay's own retries
// must never be throttled. The handler verifies the HMAC signature itself.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "*/*", limit: "1mb" }),
  handleWebhook
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Registered before the limiter so monitoring pings are never throttled.
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api", generalLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/portfolio", portfolioRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/billing", billingRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`[server] listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error("[server] failed to start:", err.message);
    process.exit(1);
  });
