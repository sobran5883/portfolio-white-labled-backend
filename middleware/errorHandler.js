// Central error handler. Express 5 forwards rejected async handlers here.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error("[error]", err);

  // Duplicate key (e.g. email or slug already taken)
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({ message: `That ${field} is already taken.` });
  }

  if (err && err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }

  // Razorpay SDK rejects with a plain object ({ statusCode, error: { description } })
  // that has no .message/.status, which would otherwise mask the real cause behind
  // a generic 500. Surface Razorpay's own description and status code instead.
  if (err && err.error && err.error.description) {
    const status = err.statusCode || 502;
    return res.status(status).json({ message: `Payment provider: ${err.error.description}` });
  }

  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Something went wrong." });
}

export default errorHandler;
