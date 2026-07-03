import { verifyToken } from "../utils/jwt.js";
import { getSession } from "../utils/session.js";
import User from "../models/User.js";

const STEP_UP_WINDOW_MS = 10 * 60 * 1000;

/**
 * Requires a valid `Authorization: Bearer <token>` header whose session is
 * still alive in Redis (so logout/revocation takes effect immediately).
 * Attaches `req.userId` and `req.sessionId` on success.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "invalid_token", message: "Authentication required." });
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return res.status(401).json({ error: "invalid_token", message: "Invalid or expired token." });
  }

  const session = payload.sid ? await getSession(payload.sid) : null;
  if (!session || session.userId !== payload.sub) {
    return res.status(401).json({ error: "invalid_token", message: "Session has ended. Please log in again." });
  }

  req.userId = payload.sub;
  req.sessionId = payload.sid;
  req.session = session;
  next();
}

/**
 * Step-up gate for sensitive writes: credentials must have been proved
 * (login, TOTP verify, or re-auth) within the last 10 minutes.
 * Must run after requireAuth.
 */
function requireFreshAuth(req, res, next) {
  const provedAt = req.session?.credentialProvedAt || 0;
  if (Date.now() - provedAt > STEP_UP_WINDOW_MS) {
    return res.status(401).json({
      error: "reauth_required",
      message: "Please confirm your credentials to continue.",
    });
  }
  next();
}

/**
 * Restricts a route to admin accounts. Checked against the DB (not the
 * token) so a demotion takes effect immediately. Must run after requireAuth.
 */
async function requireAdmin(req, res, next) {
  const user = await User.findById(req.userId).select("userType");
  if (!user || user.userType !== "admin") {
    return res.status(403).json({ error: "forbidden", message: "Admin access required." });
  }
  next();
}

export default requireAuth;
export { requireFreshAuth, requireAdmin };
