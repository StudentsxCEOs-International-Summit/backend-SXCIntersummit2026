import { renderEmailTemplate, renderCardEmail, emailBox, emailButton, escapeHtml } from '../../services/mail.service';

export interface RegistrationEmailProps {
  leaderName: string;
  teamName: string;
  teamCode: string;
  memberCount: number;
  waGroupLink?: string;
}

/** Subject of the automatic mail sent when a team submits its registration. */
export function teamRegistrationConfirmationSubject(teamName: string): string {
  return `[SXC Intersummit 2026] IBCC registration confirmed: team ${teamName}`;
}

/** Subject for re-sending the same mail to teams that registered earlier, to get them into the group. */
export function teamJoinWhatsappReminderSubject(teamName: string): string {
  return `[SXC Intersummit 2026] Team ${teamName} Is Registered: Please Join the IBCC WhatsApp Group`;
}

/**
 * Sent to the team leader right after IBCC team registration: confirms the team is in and, most
 * importantly, asks every member to join the IBCC WhatsApp group. Uses the shared card layout
 * (renderCardEmail): no remote images or tracking, one destination link, a button that renders in every
 * mail client, the link also written out, and a full plain-text part.
 */
export function renderTeamRegistrationConfirmationEmail(props: RegistrationEmailProps): {
  html: string;
  text: string;
} {
  const leaderName = escapeHtml(props.leaderName);
  const teamName = escapeHtml(props.teamName);
  const teamCode = escapeHtml(props.teamCode);
  const link = props.waGroupLink ? escapeHtml(props.waGroupLink) : '';

  const waSection = link
    ? emailBox(
        `<p style="margin: 0 0 6px 0; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #15803d;">Important: next step</p>
                <p style="margin: 0 0 10px 0; font-size: 19px; font-weight: 700; line-height: 1.35; color: #14532d;">Join the IBCC 2026 WhatsApp group</p>
                <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.6; color: #166534;">Announcements and other important information about IBCC 2026 will be shared in this group, so <strong>every member of your team needs to join</strong>. Please share this link with your teammates too.</p>
                ${emailButton(props.waGroupLink!, 'Join the WhatsApp Group')}
                <p style="margin: 14px 0 0 0; font-size: 12px; line-height: 1.5; color: #4b5563;">Button not working? Open this link: <a href="${link}" style="color: #15803d; word-break: break-all;">${link}</a></p>`,
        'green',
      )
    : '';

  const html = renderCardEmail({
    title: 'IBCC 2026 registration confirmed',
    heading: 'Your team is registered for IBCC 2026',
    sections: [
      `<p style="margin: 0 0 12px 0;">Hi ${leaderName},</p><p style="margin: 0;">We have received your registration. Your team, <strong>${teamName}</strong>, is now officially registered for the International Business Case Competition (IBCC) 2026.</p>`,
      ...(waSection ? [waSection] : []),
      emailBox(
        `<p style="margin: 0; font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: #64748b;">Your team code</p>
                <p style="margin: 4px 0 4px 0; font-size: 26px; font-weight: 700; letter-spacing: 4px; color: #0a3fa8;">${teamCode}</p>
                <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #475569;">Keep this code: it identifies your team throughout the competition.</p>`,
      ),
      `<p style="margin: 0; font-size: 14px; color: #475569;">Rules, timeline and formatting criteria are in the Competition Booklet and Guidebook in the registration kit. You can follow your team's progress on the My Team page of the website.</p>`,
    ],
  });

  const text = [
    `Hi ${props.leaderName},`,
    '',
    `We have received your registration. Your team, ${props.teamName}, is now officially registered for the International Business Case Competition (IBCC) 2026.`,
    ...(props.waGroupLink
      ? [
          '',
          'IMPORTANT, NEXT STEP: join the IBCC 2026 WhatsApp group.',
          'Announcements and other important information about IBCC 2026 will be shared in this group, so every member of your team needs to join. Please share this link with your teammates too:',
          props.waGroupLink,
        ]
      : []),
    '',
    `Your team code: ${props.teamCode} (keep it: it identifies your team throughout the competition).`,
    '',
    "Rules, timeline and formatting criteria are in the Competition Booklet and Guidebook in the registration kit. You can follow your team's progress on the My Team page of the website.",
    '',
    'Best regards,',
    'StudentsxCEOs International Summit 2026 Team',
  ].join('\n');

  return { html, text };
}

export interface MemberInvitationProps {
  memberName: string;
  leaderName: string;
  teamName: string;
  token: string;
  code: string;
  claimUrl: string;
}

export function renderMemberInvitationEmail(props: MemberInvitationProps): string {
  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 19px; font-weight: 700;">
      You've Been Added to a Team!
    </h2>
    <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
      Dear <strong>${props.memberName}</strong>,
    </p>
    <p style="margin: 0 0 20px 0; line-height: 1.6; color: #475569; font-size: 15px;">
      <strong>${props.leaderName}</strong> has registered you as a team member in <strong>${props.teamName}</strong> for the 
      <strong>International Business Case Competition (IBCC) 2026</strong>.
    </p>

    <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
      <h3 style="margin: 0 0 8px 0; font-size: 16px; color: #1e40af; font-weight: 700;">
        Activate Your Account & Join the Team
      </h3>
      <p style="margin: 0 0 16px 0; font-size: 14px; color: #3b82f6; line-height: 1.5;">
        Click the button below to confirm your team participation and create your account password:
      </p>
      <a href="${props.claimUrl}" target="_blank" rel="noopener noreferrer" 
         style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 26px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);">
        Confirm & Setup Account Password &rarr;
      </a>
    </div>

    <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 14px 18px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 6px 0; font-size: 12px; color: #64748b; font-weight: 600;">
        Button not working? Use this fallback verification code:
      </p>
      <span style="font-size: 22px; font-weight: 800; color: #1e293b; letter-spacing: 4px;">
        ${props.code}
      </span>
      <p style="margin: 6px 0 0 0; font-size: 12px; color: #94a3b8;">
        This invitation link is valid for 7 days.
      </p>
    </div>

    <p style="margin: 28px 0 0 0; font-size: 14px; line-height: 1.6; color: #334155;">
      Warm regards,<br>
      <strong>The Organizing Committee</strong><br>
      StudentsxCEOs International Summit 2026
    </p>
  `;

  return renderEmailTemplate({
    title: 'Team Invitation - IBCC 2026',
    headerHeading: 'IBCC Team Member Invitation',
    contentHtml,
    footerNote: 'This invitation was generated because you were registered as a team member in IBCC 2026.',
  });
}

export interface StatusEmailData {
  teamName: string;
  leaderName: string;
  newStatus: string;
  statusDescription: string;
  context: string;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  PAID: { bg: "#f0fdf4", border: "#10b981", text: "#166534", icon: "✓" },
  QUALIFIED_FINAL: { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a", icon: "★" },
  default_approved: { bg: "#f0fdf4", border: "#10b981", text: "#166534", icon: "✓" },
  default_rejected: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", icon: "✕" },
  ELIMINATED_SEMIFINAL: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", icon: "•" },
};

function getStatusColor(status: string) {
  if (STATUS_COLORS[status]) return STATUS_COLORS[status];
  if (status.includes("REJECTED") || status.includes("ELIMINATED")) return STATUS_COLORS.default_rejected;
  return STATUS_COLORS.default_approved;
}

export function renderStatusChangeEmail(data: StatusEmailData): string {
  const color = getStatusColor(data.newStatus);

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, ${data.leaderName}</h2>
    <p style="margin: 0 0 20px 0; line-height: 1.6; color: #475569; font-size: 15px;">
      Your team <strong>${data.teamName}</strong> has received an official status update:
    </p>
    <div style="background-color: ${color.bg}; border-left: 4px solid ${color.border}; padding: 16px 20px; border-radius: 8px; margin: 20px 0;">
      <p style="margin: 0; color: ${color.text}; font-size: 16px; font-weight: 700;">${color.icon} ${data.newStatus.replace(/_/g, " ")}</p>
      <p style="margin: 6px 0 0 0; color: ${color.text}; font-size: 14px; line-height: 1.5;">${data.statusDescription}</p>
    </div>
    <p style="font-size: 12px; color: #94a3b8; margin: 24px 0 0 0;">Timestamp: ${new Date().toUTCString()}</p>
  `;

  return renderEmailTemplate({
    title: `Status Update – ${data.teamName}`,
    headerHeading: "Team Status Update",
    contentHtml,
    footerNote: "This email was sent to notify your team of an official competition status update.",
  });
}

export interface PreliminaryEvaluationEmailProps {
  leaderName: string;
  teamName: string;
  status: 'passed' | 'failed';
  score?: number;
  feedback?: string;
}

export function renderPreliminaryEvaluationEmail(props: PreliminaryEvaluationEmailProps): string {
  const isPassed = props.status === 'passed';
  const contentHtml = isPassed
    ? `
      <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Congratulations, ${props.leaderName}!</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
        We are pleased to inform you that your team <strong>${props.teamName}</strong> has successfully passed the <strong>Preliminary Round</strong> of SXC International Summit 2026!
      </p>
      ${props.score !== undefined ? `<p style="margin: 0 0 16px 0; color: #1e293b; font-size: 15px;"><strong>Preliminary Score:</strong> ${props.score}</p>` : ''}
      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">Next Step: Semifinal Confirmation & Payment</p>
        <p style="margin: 4px 0 0 0; color: #15803d; font-size: 13px;">Please log in to your participant dashboard to complete the semifinal commitment fee and requirement verification.</p>
      </div>
    `
    : `
      <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, ${props.leaderName}</h2>
      <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
        Thank you for participating in SXC International Summit 2026. After thorough evaluation, we regret to inform you that your team <strong>${props.teamName}</strong> did not advance to the Semifinal Round.
      </p>
      ${props.score !== undefined ? `<p style="margin: 0 0 16px 0; color: #1e293b; font-size: 15px;"><strong>Preliminary Score:</strong> ${props.score}</p>` : ''}
      <div style="background-color: #f8fafc; border-left: 4px solid #64748b; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 0; color: #334155; font-size: 14px; font-weight: 600;">Evaluator Feedback:</p>
        <p style="margin: 4px 0 0 0; color: #475569; font-size: 13px;">${props.feedback || 'Keep developing your ideas and see you in the next summit event!'}</p>
      </div>
    `;

  return renderEmailTemplate({
    title: isPassed ? 'Preliminary Results - Passed' : 'Preliminary Results',
    headerHeading: isPassed ? 'Congratulations!' : 'Preliminary Round Results',
    contentHtml,
    footerNote: 'Official results notification from StudentsxCEOs International Summit 2026.',
  });
}


