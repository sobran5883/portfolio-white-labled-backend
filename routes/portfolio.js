import express from "express";
import requireAuth, { requireFreshAuth } from "../middleware/auth.js";
import {
  getMyPortfolio,
  updateMyPortfolio,
  setSlug,
  checkSlug,
  setPublished,
} from "../controllers/portfolioController.js";

const router = express.Router();

// All routes here require authentication.
router.use(requireAuth);

router.get("/", getMyPortfolio);
router.put("/", updateMyPortfolio);
router.put("/slug", setSlug);
router.get("/slug-available/:slug", checkSlug);
// Step-up: publishing/unpublishing requires credentials proved < 10 min ago.
router.put("/publish", requireFreshAuth, setPublished);

export default router;
