import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client = null;
function getClient() {
  if (_client) return _client;
  _client = new S3Client({
    region: process.env.AWS_REGION,
    // Local dev against LocalStack/MinIO: set S3_ENDPOINT (e.g. http://localhost:4566).
    // Path-style is required there because virtual-hosted DNS doesn't resolve locally.
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: Boolean(process.env.S3_ENDPOINT),
    // Presigned URLs must not include a checksum computed from the (empty) command
    // body — the browser uploads the real file and S3 would reject it with BadDigest.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

function isConfigured() {
  return Boolean(
    process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.S3_BUCKET
  );
}

function publicUrlFor(key) {
  const base = process.env.S3_PUBLIC_BASE_URL;
  if (base) return `${base.replace(/\/$/, "")}/${key}`;
  return `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

/**
 * Returns a presigned PUT URL the browser can upload to directly,
 * plus the eventual public URL of the object.
 */
async function createUploadUrl({ key, contentType }) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, { expiresIn: 60 });
  return { uploadUrl, publicUrl: publicUrlFor(key) };
}

export { createUploadUrl, isConfigured };
