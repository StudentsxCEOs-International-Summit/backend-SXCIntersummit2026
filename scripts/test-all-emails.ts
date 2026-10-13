import "dotenv/config";
import {
  sendMail,
  sendOtpEmail,
  sendTestEmail,
  renderEmailTemplate,
  getMailTransporter,
} from "../src/services/mail.service";
import { renderStatusChangeEmail } from "../src/features/ibcc/ibcc.templates";

const TARGET_EMAIL = "quykuycuy@gmail.com";

interface TestResult {
  name: string;
  status: "SUCCESS" | "FAILED";
  error?: string;
  messageId?: string;
}

async function testAllEmails() {
  console.log(`\n======================================================`);
  console.log(`🚀 TESTING ALL EMAIL NOTIFICATIONS`);
  console.log(`Target Recipient : ${TARGET_EMAIL}`);
  console.log(`Time             : ${new Date().toISOString()}`);

  const transporter = getMailTransporter();
  if (!transporter) {
    console.log(`⚠️  NOTICE: SMTP credentials not set. Running in MOCK CONSOLE mode.`);
  } else {
    console.log(`✅ SMTP Transporter connected.`);
  }
  console.log(`======================================================\n`);

  const results: TestResult[] = [];

  async function executeTest(name: string, fn: () => Promise<any>) {
    process.stdout.write(`Sending [${name}] ... `);
    try {
      const res = await fn();
      if (res && res.success === false) {
        throw new Error(res.error || "sendMail returned success: false");
      }
      console.log(`✅ SUCCESS (ID: ${res?.messageId || "ok"})`);
      results.push({ name, status: "SUCCESS", messageId: res?.messageId });
    } catch (err: any) {
      console.log(`❌ FAILED: ${err.message}`);
      results.push({ name, status: "FAILED", error: err.message });
    }
    // Small delay between sends to avoid rate limits
    await new Promise((r) => setTimeout(r, 800));
  }

  // 1. Healthcheck / Engine Test
  await executeTest("1. Engine Test Email", () => sendTestEmail(TARGET_EMAIL));

  // 2. Auth - Registration OTP
  await executeTest("2. Registration OTP", () =>
    sendOtpEmail(TARGET_EMAIL, "582910", "register"),
  );

  // 3. Auth - Password Reset OTP
  await executeTest("3. Password Reset OTP", () =>
    sendOtpEmail(TARGET_EMAIL, "419302", "forgot_password"),
  );

  // 4. Cron - Deadline Reminder (H-3)
  await executeTest("4. Deadline Reminder (H-3)", () => {
    const html = renderEmailTemplate({
      title: "Registration Deadline Reminder",
      headerHeading: "Registration Deadline Reminder",
      contentHtml: `
        <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hi <strong>Test Leader</strong>,</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 20px;">
          This is an urgent reminder that the registration deadline for <strong>SXC International Summit 2026</strong> is in <strong>3 day(s)</strong>.
        </p>
        <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-size: 14px; font-weight: 600;">Deadline Alert</p>
          <p style="margin: 4px 0 0 0; color: #b45309; font-size: 13px;">Please complete and upload all requirements & payment before the portal closes.</p>
        </div>
      `,
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] ⏰ Registration Deadline Reminder – 3 day(s) left!",
      html,
      text: "Registration deadline is in 3 days. Please complete your submission.",
    });
  });

  // 5. Cron - Payment Reminder (Registered > 3 days without payment)
  await executeTest("5. Payment Reminder", () => {
    const html = renderEmailTemplate({
      title: "Payment Reminder",
      headerHeading: "Payment Reminder",
      contentHtml: `
        <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hi <strong>Test Leader</strong>,</h2>
        <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-bottom: 20px;">
          We noticed that your team <strong>Team Alpha</strong> has not yet submitted payment proof for <strong>SXC International Summit 2026</strong>.
        </p>
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 600;">Pending Payment</p>
          <p style="margin: 4px 0 0 0; color: #1d4ed8; font-size: 13px;">Please upload your payment proof on the participant dashboard to secure your team's spot.</p>
        </div>
      `,
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] 💳 Payment Reminder – Team Alpha",
      html,
      text: "Please upload payment proof for team Team Alpha.",
    });
  });

  // 6. Competition - Preliminary Passed (ADMIN-01 & IBCC-05)
  await executeTest("6. Preliminary Evaluation - Passed", () => {
    const contentHtml = `
      <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Congratulations, Test Leader!</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
        We are pleased to inform you that your team <strong>Team Alpha</strong> has successfully passed the <strong>Preliminary Round</strong> of SXC International Summit 2026!
      </p>
      <p style="margin: 0 0 16px 0; color: #1e293b; font-size: 15px;"><strong>Preliminary Score:</strong> 88.5</p>
      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">Next Step: Semifinal Confirmation & Payment</p>
        <p style="margin: 4px 0 0 0; color: #15803d; font-size: 13px;">Please log in to your participant dashboard to complete the semifinal commitment fee and requirement verification.</p>
      </div>
    `;
    const html = renderEmailTemplate({
      title: "Preliminary Results - Passed",
      headerHeading: "Congratulations!",
      contentHtml,
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] Congratulations! You passed the Preliminary Round!",
      html,
      text: "Congratulations! Your team Team Alpha has passed the Preliminary Round.",
    });
  });

  // 7. Competition - Preliminary Failed (ADMIN-01 & IBCC-05)
  await executeTest("7. Preliminary Evaluation - Failed", () => {
    const contentHtml = `
      <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, Test Leader</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
        Thank you for participating in SXC International Summit 2026. After thorough evaluation, we regret to inform you that your team <strong>Team Alpha</strong> did not advance to the Semifinal Round.
      </p>
      <p style="margin: 0 0 16px 0; color: #1e293b; font-size: 15px;"><strong>Preliminary Score:</strong> 64.0</p>
      <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #334155; font-size: 14px; font-weight: 600;">Evaluator Feedback:</p>
        <p style="margin: 4px 0 0 0; color: #475569; font-size: 13px;">Great attempt on the problem analysis. We encourage strengthening the financial feasibility model for future competitions.</p>
      </div>
    `;
    const html = renderEmailTemplate({
      title: "Preliminary Results",
      headerHeading: "Preliminary Round Results",
      contentHtml,
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] Preliminary Round Results",
      html,
      text: "Thank you for participating. Your team Team Alpha did not advance past the Preliminary Round.",
    });
  });

  // 8. Finance - Payment Verified (ADMIN-02)
  await executeTest("8. Finance - Payment Approved & Access Code", () => {
    const contentHtml = `
      <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, Test Leader</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
        Great news! The finance team has <strong>verified and approved</strong> the payment proof for your team <strong>Team Alpha</strong>.
      </p>
      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">Payment Status: APPROVED</p>
        <p style="margin: 4px 0 0 0; color: #15803d; font-size: 13px;">Your team is now officially cleared for the semifinal stage.</p>
      </div>
      <p style="margin: 16px 0 0 0; line-height: 1.6; color: #475569; font-size: 14px;">
        You can now generate your team access code and submit your 5-slide presentation on the summit portal.
      </p>
    `;
    const html = renderEmailTemplate({
      title: "Payment Verified",
      headerHeading: "Payment Verified",
      contentHtml,
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] Payment Verified – Team Alpha",
      html,
      text: "Payment for Team Alpha has been approved.",
    });
  });

  // 9. Finance - Payment Rejected (ADMIN-02)
  await executeTest("9. Finance - Payment Rejected", () => {
    const contentHtml = `
      <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, Test Leader</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
        Unfortunately, your payment verification for team <strong>Team Alpha</strong> could not be approved by our finance committee.
      </p>
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #991b1b; font-size: 14px; font-weight: 600;">Reason / Notes:</p>
        <p style="margin: 4px 0 0 0; color: #b91c1c; font-size: 13px;">The transfer receipt appears blurry and the transaction reference ID is unreadable. Please re-upload a clear screenshot.</p>
      </div>
      <p style="margin: 16px 0 0 0; line-height: 1.6; color: #475569; font-size: 14px;">
        Please log in to your dashboard and re-upload a valid proof of transfer.
      </p>
    `;
    const html = renderEmailTemplate({
      title: "Payment Rejected",
      headerHeading: "Payment Rejected",
      contentHtml,
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] Payment Rejected – Team Alpha",
      html,
      text: "Payment for Team Alpha was rejected. Please re-upload a valid receipt.",
    });
  });

  // 10. Requirement Status Update (Twibbon / Story)
  await executeTest("10. Requirement Status Update (Twibbon/Story)", () => {
    const html = renderStatusChangeEmail({
      teamName: "Team Alpha",
      leaderName: "Test Leader",
      newStatus: "TWIBBON_APPROVED",
      statusDescription: "Twibbon submission has been verified and confirmed by the committee.",
      context: "requirement_verification",
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] Status Update – Team Alpha",
      html,
      text: "Twibbon requirement has been verified.",
    });
  });

  // 11. Semifinal Results - Qualified to Final (IBCC-10)
  await executeTest("11. Semifinal - Qualified Finalist (Top 5)", () => {
    const html = renderStatusChangeEmail({
      teamName: "Team Alpha",
      leaderName: "Test Leader",
      newStatus: "QUALIFIED_FINAL",
      statusDescription: "Congratulations! Your team has been selected as one of the Top 5 Finalists advancing to the Grand Final round of SXC International Summit 2026!",
      context: "semifinal_result",
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] 🎉 Congratulations! Team Alpha advances to the Final!",
      html,
      text: "Congratulations! Team Alpha advances to the Grand Final!",
    });
  });

  // 12. Semifinal Results - Eliminated (IBCC-10)
  await executeTest("12. Semifinal - Eliminated", () => {
    const html = renderStatusChangeEmail({
      teamName: "Team Alpha",
      leaderName: "Test Leader",
      newStatus: "ELIMINATED_SEMIFINAL",
      statusDescription: "Thank you for your outstanding participation in the Semifinal. Unfortunately, your team did not advance to the Top 5 Final round this time.",
      context: "semifinal_result",
    });
    return sendMail({
      to: TARGET_EMAIL,
      subject: "[SXC Intersummit 2026] Semifinal Results – Team Alpha",
      html,
      text: "Semifinal results announcement for Team Alpha.",
    });
  });

  console.log(`\n======================================================`);
  console.log(`📊 TEST SUMMARY RESULTS`);
  console.log(`======================================================`);
  results.forEach((r) => {
    const icon = r.status === "SUCCESS" ? "✅" : "❌";
    console.log(`${icon} ${r.name.padEnd(42)} : ${r.status}${r.error ? ` (${r.error})` : ""}`);
  });
  console.log(`======================================================\n`);
}

testAllEmails().catch(console.error);
