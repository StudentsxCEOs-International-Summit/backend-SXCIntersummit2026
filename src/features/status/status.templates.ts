import { env } from "../../configs/env";

interface StatusEmailData {
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Status Update – ${data.teamName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(145deg, #091129 0%, #172554 45%, #1e3a8a 80%, #2563eb 100%); padding: 36px 24px 28px 24px; text-align: center; border-bottom: 3px solid #f59e0b;">
              <img src="${env.EMAIL_LOGO_URL}" alt="SXC International Summit Logo" width="135" style="display: block; margin: 0 auto; width: 135px; height: auto;" />
              <div style="margin-top: 14px;">
                <div style="display: inline-block; padding: 5px 14px; background-color: rgba(255,255,255,0.12); border: 1px solid rgba(251,191,36,0.55); border-radius: 9999px;">
                  <span style="color: #ffffff; font-size: 11px; font-weight: 700; letter-spacing: 0.6px; text-transform: uppercase;">StudentsxCEOs International Summit 2026</span>
                </div>
              </div>
              <h1 style="margin: 14px 0 0 0; color: #ffffff; font-size: 19px; font-weight: 700;">Team Status Update</h1>
            </td>
          </tr>
          <!-- Content -->
          <tr>
            <td style="padding: 36px 28px; background-color: #ffffff;">
              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 18px; font-weight: 600;">Hello, ${data.leaderName}</h2>
              <p style="margin: 0 0 24px 0; line-height: 1.6; color: #475569; font-size: 15px;">
                Your team <strong>${data.teamName}</strong> has a status update:
              </p>
              <div style="background-color: ${color.bg}; border-left: 4px solid ${color.border}; padding: 14px 18px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0; color: ${color.text}; font-size: 16px; font-weight: 700;">${color.icon} ${data.newStatus.replace(/_/g, " ")}</p>
                <p style="margin: 6px 0 0 0; color: ${color.text}; font-size: 14px;">${data.statusDescription}</p>
              </div>
              <p style="font-size: 12px; color: #94a3b8; margin: 20px 0 0 0;">Timestamp: ${new Date().toUTCString()}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 22px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 10px 0; font-size: 12px; color: #64748b; font-weight: 600;">
                Connect with us:
                <a href="https://instagram.com/sxcintersummit" style="color: #2563eb; text-decoration: none; margin: 0 6px;">Instagram</a> &bull;
                <a href="https://linkedin.com/company/studentsxceos-international-summit" style="color: #2563eb; text-decoration: none; margin: 0 6px;">LinkedIn</a> &bull;
                <a href="https://tiktok.com/@intersummitsxc" style="color: #2563eb; text-decoration: none; margin: 0 6px;">TikTok</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; 2026 StudentsxCEOs International Summit. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
