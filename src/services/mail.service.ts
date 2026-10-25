import nodemailer from "nodemailer";
import { env } from "../configs/env";
import { FailoverPool, HOUR } from "../utils/failover";

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: nodemailer.SendMailOptions["attachments"];
}


interface MailSender {
  name: string;
  from: string;
  transporter: nodemailer.Transporter;
  /** Timestamps of mails sent in the last 24 hours, used to rotate before Gmail's daily cap. */
  sentAt: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FROM = "SXC Intersummit 2026 <no-reply@sxcintersummit.com>";

function createTransport(user: string, pass: string) {
  return nodemailer.createTransport({
    host: env.SMTP_HOST || "smtp.gmail.com",
    port: env.SMTP_PORT || 465,
    secure: env.SMTP_SECURE ?? true,
    auth: { user, pass },
    // Fail fast instead of holding the request for nodemailer's 2-minute default when the
    // SMTP port is blocked, and reuse connections so Gmail sees fewer logins.
    pool: true,
    maxConnections: 3,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

let senders: MailSender[] | null = null;
let senderPool: FailoverPool<MailSender> | null = null;
let rotation = 0;

/** SMTP_USER/PASS is the main account; SMTP_USER_2/PASS_2 is an optional second one. */
function getSenders(): MailSender[] {
  if (senders) return senders;

  const accounts = [
    { name: "smtp-1", user: env.SMTP_USER, pass: env.SMTP_PASS, from: env.SMTP_FROM || DEFAULT_FROM },
    {
      name: "smtp-2",
      user: env.SMTP_USER_2,
      pass: env.SMTP_PASS_2,
      from: env.SMTP_FROM_2 || env.SMTP_USER_2 || DEFAULT_FROM,
    },
  ];

  senders = accounts
    .filter((a) => a.user && a.pass)
    .map((a) => ({
      name: a.name,
      from: a.from,
      transporter: createTransport(a.user!, a.pass!),
      sentAt: [],
    }));

  if (senders.length === 0) {
    console.warn(
      "[MAIL SERVICE] SMTP_USER or SMTP_PASS not set in environment. Running in mock console mode.",
    );
  }
  senderPool = new FailoverPool(senders, "MAIL");
  return senders;
}

export function getMailTransporter(): nodemailer.Transporter | null {
  return getSenders()[0]?.transporter ?? null;
}

const sentInLastDay = (sender: MailSender, now: number) => {
  sender.sentAt = sender.sentAt.filter((t) => now - t < DAY_MS);
  return sender.sentAt.length;
};

/** Takes turns between accounts, and leaves an account alone once it nears its daily cap. */
function senderOrder(all: MailSender[]): MailSender[] {
  const now = Date.now();
  const limit = env.SMTP_DAILY_LIMIT ?? 450;
  const turn = rotation++;
  const rotated = all.map((_, i) => all[(turn + i) % all.length]);
  const underCap = rotated.filter((s) => sentInLastDay(s, now) < limit);
  if (underCap.length > 0) return underCap;
  // Everyone is past the soft cap: still try, least used first, rather than refuse to send.
  return [...rotated].sort((a, b) => a.sentAt.length - b.sentAt.length);
}

/** How long a failed SMTP account should rest (see FailoverPool for the meaning of the result). */
export function classifyMailError(error: unknown): number | null {
  const e = error as { code?: string; responseCode?: number; message?: string };
  const text = `${e.code ?? ""} ${e.responseCode ?? ""} ${e.message ?? ""}`;

  if (/EENVELOPE|5\.1\.1|user unknown|no such user|recipient (address )?rejected|invalid (recipient|address)/i.test(text)) {
    return null; // the recipient is the problem, another sender will not help
  }
  if (e.code === "EAUTH" || /invalid login|username and password not accepted|application-specific password|535|534/i.test(text)) {
    return HOUR;
  }
  if (/daily user sending limit|sending limit exceeded|too many (login|messages|recipients)|5\.4\.5|4\.7\.0|rate limit|quota/i.test(text)) {
    return 3 * HOUR;
  }
  return 0; // timeouts, resets and anything unknown: try the other account, keep this one in rotation
}

export async function sendMail(
  options: SendMailOptions,
): Promise<{ success: boolean; messageId?: string }> {
  const all = getSenders();

  if (all.length === 0) {
    const fromAddress = env.SMTP_FROM || DEFAULT_FROM;
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
    const { info, sender } = await senderPool!.run(
      senderOrder(all),
      async (candidate) => ({
        sender: candidate,
        info: await candidate.transporter.sendMail({
          from: candidate.from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
          attachments: options.attachments,
        }),
      }),
      classifyMailError,
    );

    sender.sentAt.push(Date.now());
    console.log(
      `[MAIL SERVICE] Email sent successfully to ${options.to} via ${sender.name} (MessageId: ${info.messageId})`,
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

/** For the admin console: how many mails each account sent in 24h and whether it is resting. */
export function getMailStatus() {
  const all = getSenders();
  const now = Date.now();
  const limit = env.SMTP_DAILY_LIMIT ?? 450;
  const pool = senderPool!.status(now);
  return all.map((s, i) => ({
    name: s.name,
    sentLast24h: sentInLastDay(s, now),
    softDailyLimit: limit,
    up: pool[i].up,
    restingForMinutes: Math.ceil(pool[i].downForMs / 60_000),
  }));
}


const DEFAULT_EMAIL_HEADER_BANNER =
  "https://lh3.googleusercontent.com/d/1edkvpTlvJHNLjjYl-VZEZRDnu9B3TnYv";
const DEFAULT_EMAIL_LOGO =
  "https://lh3.googleusercontent.com/d/1OXwQyeaZm5IA3xApxh2DJcVmJ8XfcFzT";

export interface EmailLayoutOptions {
  title: string;
  headerHeading?: string;
  contentHtml: string;
  bannerUrl?: string;
  logoUrl?: string;
  footerNote?: string;
}

export function renderEmailTemplate({
  title,
  headerHeading,
  contentHtml,
  bannerUrl = env.EMAIL_HEADER_BANNER_URL || env.EMAIL_BANNER_URL || DEFAULT_EMAIL_HEADER_BANNER,
  logoUrl = env.EMAIL_LOGO_URL || DEFAULT_EMAIL_LOGO,
  footerNote,
}: EmailLayoutOptions): string {
  const resolvedBannerUrl = bannerUrl.trim();
  const resolvedLogoUrl = logoUrl.trim();

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
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.04); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 0; margin: 0; background-color: #0b1536; text-align: center; border-top-left-radius: 16px; border-top-right-radius: 16px; overflow: hidden;">
              <img src="${resolvedBannerUrl}" alt="StudentsxCEOs International Summit 2026 Header Banner" width="560" style="width: 100%; max-width: 560px; height: auto; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px; border: 0; outline: none; margin: 0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 28px; background-color: #ffffff;">
              ${
                headerHeading
                  ? `<div style="margin: 0 0 24px 0; padding-bottom: 14px; border-bottom: 1px solid #f1f5f9;">
                      <h1 style="margin: 0; color: #0f172a; font-size: 20px; font-weight: 700; line-height: 1.3;">${headerHeading}</h1>
                    </div>`
                  : ""
              }
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 28px; text-align: center; border-top: 1px solid #e2e8f0; border-bottom-left-radius: 16px; border-bottom-right-radius: 16px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto 12px auto;">
                <tr>
                  <td align="center">
                    <img src="${resolvedLogoUrl}" alt="StudentsxCEOs International Summit Logo" width="46" style="display: block; margin: 0 auto; width: 46px; max-width: 50px; height: auto; border: 0; outline: none; text-decoration: none;" />
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; font-weight: 600;">
                Connect with us:
                <a href="https://instagram.com/sxcintersummit" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">Instagram</a> &bull;
                <a href="https://linkedin.com/company/studentsxceos-international-summit" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">LinkedIn</a> &bull;
                <a href="https://tiktok.com/@intersummitsxc" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">TikTok</a>
              </p>
              <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #94a3b8;">
                ${footerNote ? `${footerNote}<br>` : "If you did not initiate this request, you can safely ignore this email.<br>"}
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
    footerNote: "If you did not initiate this request, you can safely ignore this email.",
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
      <p style="margin: 4px 0 0 0; color: #15803d; font-size: 13px;">Standardized email layout with official Header Banner and Logo assets loaded successfully.</p>
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
