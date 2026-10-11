import { renderEmailTemplate } from "../../services/mail.service";

export interface StatusEmailData {
  teamName: string;
  leaderName: string;
  newStatus: string;
  statusDescription: string;
  context: string;
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  PAID: { bg: "#f0fdf4", border: "#10b981", text: "#166534", icon: "✅" },
  QUALIFIED_FINAL: { bg: "#eff6ff", border: "#3b82f6", text: "#1e3a8a", icon: "🎉" },
  default_approved: { bg: "#f0fdf4", border: "#10b981", text: "#166534", icon: "✅" },
  default_rejected: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", icon: "❌" },
  ELIMINATED_SEMIFINAL: { bg: "#fef2f2", border: "#ef4444", text: "#991b1b", icon: "📋" },
};

function getColor(status: string) {
  if (STATUS_COLORS[status]) return STATUS_COLORS[status];
  if (status.includes("REJECTED") || status.includes("ELIMINATED")) return STATUS_COLORS.default_rejected;
  return STATUS_COLORS.default_approved;
}

export function renderStatusChangeEmail(data: StatusEmailData): string {
  const color = getColor(data.newStatus);
  const isFinalQualified = data.newStatus === "QUALIFIED_FINAL";
  const headerHeading = isFinalQualified ? "Congratulations Finalist!" : "Team Status Update";

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
    title: isFinalQualified ? "Congratulations! Qualified for the Final" : `Status Update – ${data.teamName}`,
    headerHeading,
    contentHtml,
    footerNote: "This email was sent to notify your team of an official competition status update.",
  });
}
