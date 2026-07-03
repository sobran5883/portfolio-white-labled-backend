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

  const status = err.status || 500;
  res.status(status).json({ message: err.message || "Something went wrong." });
}

export default errorHandler;
