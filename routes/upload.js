import express from "express";
import requireAuth from "../middleware/auth.js";
import { getUploadUrl } from "../controllers/uploadController.js";

const router = express.Router();

router.post("/sign", requireAuth, getUploadUrl);

export default router;
