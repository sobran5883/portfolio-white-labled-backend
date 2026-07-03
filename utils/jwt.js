import jwt from "jsonwebtoken";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set.");
  return secret;
}

function signToken(payload, expiresIn) {
  return jwt.sign(payload, getSecret(), {
    expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || "7d",
  });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

export { signToken, verifyToken };
