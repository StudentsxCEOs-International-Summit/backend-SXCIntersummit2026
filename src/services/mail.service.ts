import nodemailer from "nodemailer";
import { env } from "../configs/env";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: nodemailer.SendMailOptions["attachments"];
}

let transporter: nodemailer.Transporter | null = null;

export function getMailTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.warn(
      "[MAIL SERVICE] SMTP_USER or SMTP_PASS not set in environment. Running in mock console mode.",
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST || "smtp.gmail.com",
    port: env.SMTP_PORT || 465,
    secure: env.SMTP_SECURE ?? true,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return transporter;
}

export async function sendMail(
  options: SendMailOptions,
): Promise<{ success: boolean; messageId?: string }> {
  const mailClient = getMailTransporter();
  const fromAddress =
    env.SMTP_FROM || "SXC Intersummit 2026 <no-reply@sxcintersummit.com>";

  if (!mailClient) {
    console.log("[MOCK EMAIL ENGINE] Sending email:");
    console.log(`To      : ${options.to}`);
    console.log(`From    : ${fromAddress}`);
    console.log(`Subject : ${options.subject}`);
    console.log(`Body    : ${options.text || options.html}`);
    if (options.attachments && options.attachments.length > 0) {
      console.log(
        `Attachments: ${options.attachments
          .map((a: any) => a.filename || a.cid)
          .join(", ")}`,
      );
    }
    return { success: true, messageId: "mock-email-id" };
  }

  try {
    const info = await mailClient.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
    });

    console.log(
      `[MAIL SERVICE] Email sent successfully to ${options.to} (MessageId: ${info.messageId})`,
    );
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error(
      `[MAIL SERVICE] Failed to send email to ${options.to}:`,
      error.message,
    );
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export interface EmailLayoutOptions {
  title: string;
  headerHeading?: string;
  contentHtml: string;
}

export function renderEmailTemplate({
  title,
  headerHeading,
  contentHtml,
}: EmailLayoutOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04); border: 1px solid #e2e8f0;">
          
          <!-- Banner Header -->
          <tr>
            <td style="padding: 0; text-align: center; border-bottom: 3px solid #f59e0b; background-color: #f1f5f9;">
              <img src="${env.EMAIL_HEADER_BANNER_URL || env.EMAIL_BANNER_URL}" alt="SXC International Summit Banner" width="100%" style="display: block; width: 100%; max-width: 560px; height: auto; border: 0; outline: none; text-decoration: none;" />
              ${
                headerHeading
                  ? `<div style="background-color: #0b1536; padding: 14px 24px;"><h1 style="margin: 0; color: #ffffff; font-size: 19px; font-weight: 700; letter-spacing: 0.2px;">${headerHeading}</h1></div>`
                  : ""
              }
            </td>
          </tr>

          <!-- Main Content Section -->
          <tr>
            <td style="padding: 36px 28px; background-color: #ffffff;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer with Verified Social Media & Organization Copyright -->
          <tr>
            <td style="background-color: #f8fafc; padding: 22px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; font-weight: 600;">
                Connect with us:
                <a href="https://instagram.com/sxcintersummit" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">Instagram</a> &bull;
                <a href="https://linkedin.com/company/studentsxceos-international-summit" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">LinkedIn</a> &bull;
                <a href="https://tiktok.com/@intersummitsxc" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">TikTok</a>
              </p>
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                If you did not initiate this request, you can safely ignore this email.<br>
                &copy; 2026 StudentsxCEOs International Summit. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendOtpEmail(
  email: string,
  otp: string,
  purpose: "register" | "forgot_password",
) {
  const isRegister = purpose === "register";
  const title = isRegister
    ? "Account Registration Verification"
    : "Password Reset Request";
  const subject = `[SXC Intersummit 2026] ${title}`;

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello,</h2>
    <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569; font-size: 15px;">
      ${
        isRegister
          ? "Thank you for registering for <strong>StudentsxCEOs International Summit 2026</strong>. Use the following One-Time Password (OTP) to activate your account:"
          : "We received a request to reset your password for <strong>SXC Intersummit 2026</strong>. Use the following One-Time Password (OTP) to proceed:"
      }
    </p>
    
    <div style="text-align: center; margin: 28px 0;">
      <div style="display: inline-block; padding: 16px 36px; background-color: #f8fafc; border: 2px dashed #3b82f6; border-radius: 12px; font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #1e3a8a;">
        ${otp}
      </div>
    </div>

    <p style="margin: 0 0 10px 0; line-height: 1.5; color: #64748b; font-size: 13px; text-align: center;">
      This OTP code is valid for <strong>5 minutes</strong>.
    </p>
    <p style="margin: 0; line-height: 1.5; color: #ef4444; font-size: 13px; text-align: center;">
      Do NOT share this code with anyone for your account security.
    </p>
  `;

  const htmlContent = renderEmailTemplate({
    title,
    headerHeading: title,
    contentHtml,
  });

  return await sendMail({
    to: email,
    subject,
    html: htmlContent,
    text: `Your SXC Intersummit 2026 OTP code is: ${otp}. This code is valid for 5 minutes.`,
  });
}

export async function sendTestEmail(to: string) {
  const subject = "[SXC Intersummit 2026] Email Service Test";
  const title = "Email Service Test";

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello,</h2>
    <p style="margin: 0 0 18px 0; line-height: 1.6; color: #475569; font-size: 15px;">
      This is a test email to verify that the <strong>Email Service (Nodemailer)</strong> in the SXC Intersummit 2026 backend is operating normally.
    </p>
    <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">Engine Status: Operational</p>
      <p style="margin: 4px 0 0 0; color: #15803d; font-size: 13px;">Redesigned header with SXC Logo and brand gradient theme loaded successfully.</p>
    </div>
    <p style="font-size: 12px; color: #94a3b8; margin: 20px 0 0 0;">Timestamp: ${new Date().toUTCString()}</p>
  `;

  const htmlContent = renderEmailTemplate({
    title,
    headerHeading: "Email Engine Test",
    contentHtml,
  });

  return await sendMail({
    to,
    subject,
    html: htmlContent,
    text: "This is a test email from SXC Intersummit 2026 Backend.",
  });
}
