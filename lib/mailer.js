// Kirim email lewat SMTP (default Gmail). Butuh env SMTP_USER & SMTP_PASS (App Password Gmail).
import nodemailer from 'nodemailer';

export const mailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

let transport = null;
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transport;
}

export async function sendMail({ to, subject, text, html, attachments, replyTo, fromName }) {
  if (!mailConfigured()) return false;
  await getTransport().sendMail({ from: `${(fromName || 'PRASARA').replace(/[<>"]/g, '')} <${process.env.SMTP_USER}>`, to, subject, text, html, attachments, ...(replyTo ? { replyTo } : {}) });
  return true;
}
