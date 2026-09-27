import nodemailer from "nodemailer";
import { env } from "../configs/env";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
    return { success: true, messageId: "mock-email-id" };
  }

  try {
    const info = await mailClient.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
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

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 15px;">
        <tr>
          <td align="center">
            <table width="100%" max-width="520" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0;">
              <tr>
                <td style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); padding: 32px 24px; text-align: center;">
                  <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: 0.5px;">SXC Intersummit 2026</h1>
                  <p style="margin: 6px 0 0 0; color: #93c5fd; font-size: 14px;">StudentsxCEOs International Summit</p>
                </td>
              </tr>
              <tr>
                <td style="padding: 32px 28px;">
                  <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello,</h2>
                  <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569; font-size: 15px;">
                    ${
                      isRegister
                        ? "Thank you for registering for <strong>StudentsxCEOs International Summit 2026</strong>. Use the following One-Time Password (OTP) to activate your account:"
                        : "We received a request to reset your password for <strong>SXC Intersummit 2026</strong>. Use the following One-Time Password (OTP) to proceed:"
                    }
                  </p>
                  
                  <div style="text-align: center; margin: 30px 0;">
                    <div style="display: inline-block; padding: 16px 36px; background-color: #f1f5f9; border: 2px dashed #3b82f6; border-radius: 10px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e3a8a;">
                      ${otp}
                    </div>
                  </div>

                  <p style="margin: 0 0 12px 0; line-height: 1.5; color: #64748b; font-size: 13px; text-align: center;">
                    This OTP code is valid for <strong>5 minutes</strong>.
                  </p>
                  <p style="margin: 0; line-height: 1.5; color: #ef4444; font-size: 13px; text-align: center;">
                    Do NOT share this code with anyone for your account security.
                  </p>
                </td>
              </tr>
              <tr>
                <td style="background-color: #f8fafc; padding: 20px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
                  <p style="margin: 0; font-size: 12px; color: #94a3b8;">
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
    </html>
  `;

  return await sendMail({
    to: email,
    subject,
    html: htmlContent,
    text: `Your SXC Intersummit 2026 OTP code is: ${otp}. This code is valid for 5 minutes.`,
  });
}

export async function sendTestEmail(to: string) {
  const subject = "[SXC Intersummit 2026] Email Service Test";
  const html = `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: #1e3a8a;">SXC Intersummit 2026 - Email Engine Test</h2>
      <p>Hello,</p>
      <p>This is a test email to verify that the <strong>Email Service (Nodemailer)</strong> in the backend is operating normally.</p>
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;" />
      <p style="font-size: 12px; color: #777;">Sent at: ${new Date().toUTCString()}</p>
    </div>
  `;

  return await sendMail({
    to,
    subject,
    html,
    text: "This is a test email from SXC Intersummit 2026 Backend.",
  });
}
