import nodemailer from "nodemailer";

let _transport = null;

function isConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
  );
}

function getTransport() {
  if (_transport) return _transport;
  const port = Number(process.env.SMTP_PORT || 587);
  _transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return _transport;
}

/**
 * Emails the verification code. Outside production, a missing SMTP config or a
 * failed send falls back to printing the code on the server console so the
 * flow stays testable; in production failures propagate to the caller.
 */
async function sendOtpEmail(to, otp) {
  const appName = "Folionce";
  const message = {
    from: process.env.SMTP_FROM || `${appName} <${process.env.SMTP_USER}>`,
    to,
    subject: `${otp} is your ${appName} verification code`,
    text: `Your ${appName} verification code is ${otp}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
    html: `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1c1c22">
        <h2 style="margin:0 0 8px">Verify your email</h2>
        <p style="margin:0 0 16px;color:#555">Use this code to finish creating your ${appName} account. It expires in 10 minutes.</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f4f4f5;border-radius:8px;padding:16px;text-align:center">${otp}</div>
        <p style="margin:16px 0 0;color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p>
      </div>`,
  };

  const devFallback = (reason) => {
    console.warn(`[mailer] ${reason} — OTP for ${to}: ${otp}`);
  };

  if (!isConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured.");
    }
    devFallback("SMTP not configured, logging code instead");
    return false;
  }

  try {
    await getTransport().sendMail(message);
    return true;
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    devFallback(`send failed (${err.message}), logging code instead`);
    return false;
  }
}

export { sendOtpEmail };
