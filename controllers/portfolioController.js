import Portfolio from "../models/Portfolio.js";
import buildDefaultPortfolio from "../config/defaultPortfolio.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED_SLUGS = new Set([
  "login",
  "register",
  "dashboard",
  "api",
  "admin",
  "settings",
  "about",
  "_next",
  "public",
]);

// Top-level content sections a user is allowed to edit.
const EDITABLE_SECTIONS = [
  "theme",
  "home",
  "about",
  "experience",
  "education",
  "skills",
  "stats",
  "projects",
  "achievements",
  "certificates",
  "services",
  "contact",
  "socials",
];

async function getMyPortfolio(req, res) {
  let portfolio = await Portfolio.findOne({ user: req.userId });
  // Self-heal: if a user somehow has no portfolio, create the default.
  if (!portfolio) {
    portfolio = await Portfolio.create({
      user: req.userId,
      ...buildDefaultPortfolio(),
    });
  }
  res.json({ portfolio });
}

async function updateMyPortfolio(req, res) {
  const portfolio = await Portfolio.findOne({ user: req.userId });
  if (!portfolio) return res.status(404).json({ message: "Portfolio not found." });

  const body = req.body || {};
  for (const key of EDITABLE_SECTIONS) {
    if (key in body) {
      portfolio.set(key, body[key]);
    }
  }

  await portfolio.save();
  res.json({ portfolio });
}

async function setSlug(req, res) {
  const raw = (req.body && req.body.slug ? String(req.body.slug) : "").toLowerCase().trim();

  if (!SLUG_RE.test(raw)) {
    return res.status(400).json({
      message:
        "Slug must be 3-40 characters, lowercase letters, numbers or hyphens, and cannot start or end with a hyphen.",
    });
  }
  if (RESERVED_SLUGS.has(raw)) {
    return res.status(409).json({ message: "That slug is reserved. Please pick another." });
  }

  const taken = await Portfolio.findOne({ slug: raw, user: { $ne: req.userId } });
  if (taken) {
    return res.status(409).json({ message: "That slug is already taken." });
  }

  const portfolio = await Portfolio.findOneAndUpdate(
    { user: req.userId },
    { slug: raw },
    { new: true }
  );
  if (!portfolio) return res.status(404).json({ message: "Portfolio not found." });

  res.json({ portfolio });
}

async function checkSlug(req, res) {
  const raw = (req.params.slug || "").toLowerCase().trim();
  if (!SLUG_RE.test(raw) || RESERVED_SLUGS.has(raw)) {
    return res.json({ available: false, reason: "invalid" });
  }
  const taken = await Portfolio.findOne({ slug: raw, user: { $ne: req.userId } });
  res.json({ available: !taken });
}

async function setPublished(req, res) {
  const published = Boolean(req.body && req.body.published);

  const portfolio = await Portfolio.findOne({ user: req.userId });
  if (!portfolio) return res.status(404).json({ message: "Portfolio not found." });

  if (published && !portfolio.slug) {
    return res.status(400).json({ message: "Set a slug before publishing your portfolio." });
  }

  portfolio.published = published;
  await portfolio.save();
  res.json({ portfolio });
}

// Public, unauthenticated: only returns published portfolios.
async function getPublicBySlug(req, res) {
  const slug = (req.params.slug || "").toLowerCase().trim();
  const portfolio = await Portfolio.findOne({ slug, published: true }).select("-user -__v");
  if (!portfolio) {
    return res.status(404).json({ message: "Portfolio not found." });
  }
  res.json({ portfolio });
}

export {
  getMyPortfolio,
  updateMyPortfolio,
  setSlug,
  checkSlug,
  setPublished,
  getPublicBySlug,
};
