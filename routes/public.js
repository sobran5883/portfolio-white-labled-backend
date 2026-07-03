import express from "express";
import { getPublicBySlug } from "../controllers/portfolioController.js";

const router = express.Router();

// Public, unauthenticated read of a published portfolio.
router.get("/:slug", getPublicBySlug);

export default router;
