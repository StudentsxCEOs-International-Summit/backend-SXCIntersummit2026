import nodemailer from "nodemailer";
import { env } from "../configs/env";
import { FailoverPool, HOUR } from "../utils/failover";
import { createChildLogger } from "../configs/logger";

const mailLogger = createChildLogger("MAIL");

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Extra mail headers (e.g. marking an automatic message). */
  headers?: Record<string, string>;
  attachments?: nodemailer.SendMailOptions["attachments"];
  /**
   * Gmail sometimes accepts a mail and only later bounces it as "suspicious" / "Message blocked", so the
   * send itself looks fine. With this set (and a second account configured) the mail is remembered until
   * `expiresAt`, and the bounce watcher (jobs/mail-bounce.job.ts) resends it through the other account.
   */
  retryOnBlock?: { expiresAt: number };
  /** Accounts not to use for this mail (the ones that already had it bounced). */
  excludeSenders?: string[];
  /**
   * Part of a batch (reminders, result announcements): waits for its turn so batch mails go out spaced
   * apart (MAIL_BULK_GAP_SECONDS, default ~1 minute) instead of in one burst, which Gmail treats as
   * spam. One-to-one mails (OTP, confirmations) leave this off and are never delayed.
   */
  bulk?: boolean;
}


interface MailSender {
  name: string;
  /** SMTP login, also used by the bounce watcher to read this account's inbox over IMAP. */
  user: string;
  pass: string;
  from: string;
  transporter: nodemailer.Transporter;
  /** Timestamps of mails sent in the last 24 hours, used to rotate before Gmail's daily cap. */
  sentAt: number[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_FROM = "SXC Intersummit 2026 <no-reply@sxcintersummit.com>";
const SENDER_NAME = "SXC International Summit";

/** A bare address shows up as just "itsx...@gmail.com"; with a name the inbox shows who it is from. */
const withSenderName = (from: string) => (from.includes("<") ? from : `"${SENDER_NAME}" <${from}>`);

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
    {
      name: "smtp-1",
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: withSenderName(env.SMTP_FROM || env.SMTP_USER || DEFAULT_FROM),
    },
    {
      name: "smtp-2",
      user: env.SMTP_USER_2,
      pass: env.SMTP_PASS_2,
      from: withSenderName(env.SMTP_FROM_2 || env.SMTP_USER_2 || DEFAULT_FROM),
    },
  ];

  senders = accounts
    .filter((a) => a.user && a.pass)
    .map((a) => ({
      name: a.name,
      user: a.user!,
      pass: a.pass!,
      from: a.from,
      transporter: createTransport(a.user!, a.pass!),
      sentAt: [],
    }));

  if (senders.length === 0) {
    mailLogger.warn("SMTP_USER or SMTP_PASS not set in environment. Running in mock console mode.");
  }
  senderPool = new FailoverPool(senders, "MAIL");
  return senders;
}

export function getMailTransporter(): nodemailer.Transporter | null {
  return getSenders()[0]?.transporter ?? null;
}

/** The configured SMTP accounts, for the bounce watcher that reads their inboxes. */
export function getMailAccounts(): { name: string; user: string; pass: string }[] {
  return getSenders().map(({ name, user, pass }) => ({ name, user, pass }));
}

/** A mail that can still be resent through another account if it bounces as blocked. */
export interface TrackedMail {
  messageId: string;
  to: string;
  /** The account that sent this copy. */
  sender: string;
  /** Every account that already sent (and may have had bounced) this mail. */
  triedSenders: string[];
  options: SendMailOptions;
  expiresAt: number;
}

const trackedMails = new Map<string, TrackedMail>();

const normalizeMessageId = (id: string) => id.trim().replace(/^<|>$/g, "").toLowerCase();

function pruneTrackedMails(now = Date.now()) {
  for (const [id, mail] of trackedMails) {
    if (mail.expiresAt <= now) trackedMails.delete(id);
  }
}

function trackMail(mail: TrackedMail) {
  pruneTrackedMails();
  trackedMails.set(normalizeMessageId(mail.messageId), mail);
}

/**
 * Finds the mail a bounce is about: by the original Message-ID when the bounce carries it, otherwise the
 * latest tracked mail from that account to the failed recipient.
 */
export function findTrackedMail(match: {
  sender: string;
  messageIds: string[];
  recipients: string[];
}): TrackedMail | undefined {
  pruneTrackedMails();
  for (const id of match.messageIds) {
    const mail = trackedMails.get(normalizeMessageId(id));
    if (mail && mail.sender === match.sender) return mail;
  }
  const recipients = new Set(match.recipients.map((r) => r.toLowerCase()));
  let latest: TrackedMail | undefined;
  for (const mail of trackedMails.values()) {
    if (mail.sender !== match.sender || !recipients.has(mail.to.toLowerCase())) continue;
    if (!latest || mail.expiresAt >= latest.expiresAt) latest = mail;
  }
  return latest;
}

/** Forgets a tracked mail (its bounce was handled, or it is not worth resending). */
export function forgetTrackedMail(mail: TrackedMail) {
  trackedMails.delete(normalizeMessageId(mail.messageId));
}

/** Resending this close to the expiry is pointless: the code would be dead before it is read. */
const MIN_USEFUL_REMAINING_MS = 30_000;

export type ResendOutcome =
  | { status: "resent"; sender: string }
  | { status: "expired" }
  | { status: "no-account-left" }
  | { status: "failed"; error: string };

/** Sends a bounced mail again through an account that has not tried it yet. */
export async function resendThroughOtherAccount(mail: TrackedMail): Promise<ResendOutcome> {
  forgetTrackedMail(mail);
  if (mail.expiresAt - Date.now() < MIN_USEFUL_REMAINING_MS) return { status: "expired" };

  const remaining = getSenders().filter((s) => !mail.triedSenders.includes(s.name));
  if (remaining.length === 0) return { status: "no-account-left" };

  try {
    const result = await sendMail({
      ...mail.options,
      excludeSenders: mail.triedSenders,
      retryOnBlock: { expiresAt: mail.expiresAt },
    });
    return { status: "resent", sender: result.sender ?? remaining[0].name };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
}

const sentInLastDay = (sender: MailSender, now: number) => {
  sender.sentAt = sender.sentAt.filter((t) => now - t < DAY_MS);
  return sender.sentAt.length;
};

/** Takes turns between accounts, and leaves an account alone once it nears its daily cap. */
function senderOrder(all: MailSender[], exclude: string[] = []): MailSender[] {
  const now = Date.now();
  const limit = env.SMTP_DAILY_LIMIT ?? 450;
  const turn = rotation++;
  const rotated = all
    .map((_, i) => all[(turn + i) % all.length])
    .filter((s) => !exclude.includes(s.name));
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
  if (/suspicious|blocked|spam|554 5\.7\.1|550 5\.7\.1/i.test(text)) {
    return HOUR;
  }
  return 0; // timeouts, resets and anything unknown: try the other account, keep this one in rotation
}

let bulkQueue: Promise<void> = Promise.resolve();
let lastBulkSendAt = 0;

/** Gap before the next batch mail: the configured gap plus up to 50% random jitter. */
function nextBulkGapMs() {
  const base = (env.MAIL_BULK_GAP_SECONDS ?? 60) * 1000;
  return base + Math.random() * base * 0.5;
}

/**
 * Resolves when the next batch mail may go out. Batch mails from every caller share one queue, so two
 * batches running at once still do not add up to a burst.
 */
export function waitForBulkSlot(): Promise<void> {
  const slot = bulkQueue.then(async () => {
    const wait = lastBulkSendAt + nextBulkGapMs() - Date.now();
    if (lastBulkSendAt > 0 && wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastBulkSendAt = Date.now();
  });
  bulkQueue = slot.catch(() => undefined);
  return slot;
}

export async function sendMail(
  options: SendMailOptions,
): Promise<{ success: boolean; messageId?: string; sender?: string }> {
  const all = getSenders();

  if (options.bulk && all.length > 0) await waitForBulkSlot();

  if (all.length === 0) {
    const fromAddress = env.SMTP_FROM || DEFAULT_FROM;
    mailLogger.info(
      { to: options.to, from: fromAddress, subject: options.subject, hasAttachments: Boolean(options.attachments && options.attachments.length > 0) },
      "Mock email dispatched",
    );
    return { success: true, messageId: "mock-email-id" };
  }

  try {
    const { info, sender } = await senderPool!.run(
      senderOrder(all, options.excludeSenders),
      async (candidate) => ({
        sender: candidate,
        info: await candidate.transporter.sendMail({
          from: candidate.from,
          to: options.to,
          subject: options.subject,
          text: options.text,
          html: options.html,
          headers: options.headers,
          attachments: options.attachments,
        }),
      }),
      classifyMailError,
    );

    sender.sentAt.push(Date.now());
    mailLogger.info({ to: options.to, sender: sender.name, messageId: info.messageId }, "Email sent successfully");

    if (options.retryOnBlock && all.length > 1 && info.messageId) {
      const { retryOnBlock, excludeSenders, bulk, ...mailOptions } = options;
      trackMail({
        messageId: info.messageId,
        to: options.to,
        sender: sender.name,
        triedSenders: [...(excludeSenders ?? []), sender.name],
        options: mailOptions,
        expiresAt: retryOnBlock.expiresAt,
      });
    }

    return { success: true, messageId: info.messageId, sender: sender.name };
  } catch (error: any) {
    mailLogger.error({ err: error, to: options.to }, "Failed to send email");
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
                <a href="https://www.tiktok.com/@intersummitsxc" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">TikTok</a>
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

/**
 * A short, personal-looking layout: no remote images, no social links, no banner. Gmail's outbound filter
 * was holding the branded mails back as suspicious; plain one-to-one style mails get through far better.
 * Each block becomes a paragraph (HTML allowed), followed by the team signature.
 */
export function renderPlainEmail({ title, blocksHtml }: { title: string; blocksHtml: string[] }): string {
  const paragraphs = blocksHtml.map((block) => `    <p style="margin: 0 0 16px 0;">${block}</p>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: #ffffff; font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 15px; line-height: 1.6;">
  <div style="max-width: 520px; margin: 0 auto;">
${paragraphs}
    <p style="margin: 8px 0 0 0;">Best regards,<br>StudentsxCEOs International Summit 2026 Team</p>
  </div>
</body>
</html>`;
}

/**
 * Codes can land in Spam while the sending account builds reputation; "Not spam" from recipients is what
 * moves the next mails to the inbox. (The "can take up to 60 seconds" hint lives on the OTP page.)
 */
const SPAM_NOTE =
  "Found this email in your Spam or Promotions folder? Please mark it as \"Not spam\" so our next emails, including your team's updates, reach your inbox.";

/** Matches OTP_EXPIRY_MS in auth.service and the "valid for 5 minutes" in the mail. */
const OTP_VALID_MS = 5 * 60 * 1000;

export async function sendOtpEmail(
  email: string,
  otp: string,
  purpose: "register" | "forgot_password",
) {
  const isRegister = purpose === "register";
  const title = isRegister
    ? "Your verification code"
    : "Your password reset code";
  const subject = `[SXC Intersummit 2026] ${title}`;
  const intro = isRegister
    ? "Thanks for signing up for StudentsxCEOs International Summit 2026. Enter this code on the sign-up page to finish creating your account:"
    : "We received a request to reset the password of your StudentsxCEOs International Summit 2026 account. Enter this code to continue:";
  const outro = isRegister
    ? "If you didn't sign up, you can ignore this email and no account will be created."
    : "If you didn't ask to reset your password, you can ignore this email and your password stays the same.";

  const htmlContent = renderPlainEmail({
    title,
    blocksHtml: [
      "Hi,",
      intro,
      `<span style="font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${otp}</span>`,
      "The code is valid for 5 minutes. Please keep it to yourself; our team will never ask you for it.",
      SPAM_NOTE,
      `<span style="color: #64748b;">${outro}</span>`,
    ],
  });

  const text = [
    "Hi,",
    "",
    intro,
    "",
    otp,
    "",
    "The code is valid for 5 minutes. Please keep it to yourself; our team will never ask you for it.",
    "",
    SPAM_NOTE,
    "",
    outro,
    "",
    "Best regards,",
    "StudentsxCEOs International Summit 2026 Team",
  ].join("\n");

  return await sendMail({
    to: email,
    subject,
    html: htmlContent,
    text,
    // Marks it as an automatic, one-to-one message (no auto-replies, not a newsletter).
    headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "OOF, AutoReply" },
    // If Gmail bounces it as blocked, resend the same code through the other account while it is valid.
    retryOnBlock: { expiresAt: Date.now() + OTP_VALID_MS },
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
