import crypto from "node:crypto";
import { createUploadUrl, isConfigured } from "../utils/s3.js";

const ALLOWED = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

/**
 * Generates a presigned S3 PUT URL scoped to the authenticated user.
 * Body: { contentType, folder? } where folder is e.g. "projects" | "profile".
 */
async function getUploadUrl(req, res) {
  if (!isConfigured()) {
    return res.status(503).json({
      message: "Image uploads are not configured. Set the AWS_* and S3_BUCKET env vars.",
    });
  }

  const { contentType, folder } = req.body || {};
  const ext = ALLOWED[contentType];
  if (!ext) {
    return res.status(400).json({
      message: "Unsupported file type. Allowed: PNG, JPG, WEBP, GIF, SVG, PDF.",
    });
  }

  const safeFolder = String(folder || "misc").replace(/[^a-z0-9-]/gi, "").slice(0, 30) || "misc";
  const id = crypto.randomBytes(8).toString("hex");
  const key = `uploads/${req.userId}/${safeFolder}/${id}.${ext}`;

  const { uploadUrl, publicUrl } = await createUploadUrl({ key, contentType });
  res.json({ uploadUrl, publicUrl, key });
}

export { getUploadUrl };
