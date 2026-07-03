import mongoose from "mongoose";
import User from "../models/User.js";
import Portfolio from "../models/Portfolio.js";

/**
 * Lists every customer account with a summary of their portfolio.
 * `$ne: "admin"` (rather than `userType: "customer"`) so accounts created
 * before the userType field existed still show up.
 */
async function listCustomers(req, res) {
  const users = await User.find({ userType: { $ne: "admin" } })
    .select("name email totpEnabled createdAt")
    .sort({ createdAt: -1 })
    .lean();

  const portfolios = await Portfolio.find({ user: { $in: users.map((u) => u._id) } })
    .select("user slug published")
    .lean();
  const byUser = new Map(portfolios.map((p) => [String(p.user), p]));

  res.json({
    users: users.map((u) => {
      const p = byUser.get(String(u._id));
      return {
        id: u._id,
        name: u.name,
        email: u.email,
        totpEnabled: u.totpEnabled,
        createdAt: u.createdAt,
        slug: p?.slug || null,
        published: Boolean(p?.published),
      };
    }),
  });
}

/** Full detail for one customer (admin accounts are not exposed here). */
async function getCustomer(req, res) {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).json({ error: "not_found", message: "Customer not found." });
  }

  const user = await User.findById(id).select("name email userType totpEnabled createdAt").lean();
  if (!user || user.userType === "admin") {
    return res.status(404).json({ error: "not_found", message: "Customer not found." });
  }

  const portfolio = await Portfolio.findOne({ user: user._id })
    .select("slug published updatedAt")
    .lean();

  res.json({
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt,
    },
    portfolio: portfolio
      ? {
          slug: portfolio.slug || null,
          published: Boolean(portfolio.published),
          updatedAt: portfolio.updatedAt,
        }
      : null,
  });
}

export { listCustomers, getCustomer };
