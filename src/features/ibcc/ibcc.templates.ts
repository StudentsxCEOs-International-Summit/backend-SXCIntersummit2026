import { env } from '../../configs/env';

export interface RegistrationEmailProps {
  leaderName: string;
  teamName: string;
  teamCode: string;
  memberCount: number;
  waGroupLink: string;
}

const DEFAULT_EMAIL_HEADER_BANNER =
  'https://lh3.googleusercontent.com/d/1edkvpTlvJHNLjjYl-VZEZRDnu9B3TnYv';

export function renderTeamRegistrationConfirmationEmail(props: RegistrationEmailProps): string {
  const bannerUrl = (env.EMAIL_HEADER_BANNER_URL || DEFAULT_EMAIL_HEADER_BANNER).trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registration Confirmation - IBCC 2026</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 0; margin: 0; background-color: #0b1536; text-align: center;">
              <img src="${bannerUrl}" alt="SXC International Summit 2026 Header Banner" 
                   width="560" style="width: 100%; max-width: 560px; height: auto; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px; border: 0; outline: none; margin: 0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 28px; background-color: #ffffff;">
              <h2 style="margin: 0 0 16px 0; color: #0f172a; font-size: 19px; font-weight: 700;">
                Welcome to IBCC SxC International Summit 2026!
              </h2>
              <p style="margin: 0 0 16px 0; line-height: 1.6; color: #475569; font-size: 15px;">
                Dear <strong>${props.leaderName}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; line-height: 1.6; color: #475569; font-size: 15px;">
                Congratulations! Your team <strong>${props.teamName}</strong> has been successfully registered for the 
                <strong>International Business Case Competition (IBCC) 2026</strong>.
              </p>

              <div style="background-color: #f8fafc; border: 2px dashed #2563eb; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                <span style="font-size: 12px; font-weight: 700; color: #64748b; letter-spacing: 1px; text-transform: uppercase;">
                  Official Master Team Code
                </span>
                <div style="font-size: 32px; font-weight: 800; color: #1e3a8a; letter-spacing: 6px; margin-top: 6px;">
                  ${props.teamCode}
                </div>
                <p style="font-size: 12px; color: #64748b; margin: 8px 0 0 0;">
                  Please keep this code safe. It will be your identifier throughout the competition.
                </p>
              </div>

              <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; border-radius: 8px; padding: 18px; margin: 24px 0;">
                <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #166534; font-weight: 700;">
                  Preliminary Stage WhatsApp Group
                </h3>
                <p style="margin: 0 0 14px 0; font-size: 14px; color: #15803d; line-height: 1.5;">
                  All official technical briefings, case distributions, and Q&A announcements for the Preliminary Round will be shared through this group.
                </p>
                <a href="${props.waGroupLink}" target="_blank" rel="noopener noreferrer" 
                   style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 10px 20px; border-radius: 6px;">
                  Join Official Preliminary WA Group &rarr;
                </a>
              </div>

              <div style="margin: 24px 0; padding-top: 16px; border-top: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 8px 0; font-size: 14px; color: #334155;">Need Assistance?</h4>
                <p style="margin: 0 0 8px 0; font-size: 13px; line-height: 1.5; color: #64748b;">
                  Please refer to our <strong>Competition Booklet & Guidebook</strong> available in the registration kit for competition rules, timeline, and formatting criteria.
                </p>
                <p style="margin: 0; font-size: 13px; color: #64748b;">
                  Contact Person (WhatsApp): <strong>+62 812-XXXX-XXXX (Committee IBCC)</strong>
                </p>
              </div>

              <p style="margin: 28px 0 0 0; font-size: 14px; line-height: 1.6; color: #334155;">
                Warm regards,<br>
                <strong>The Organizing Committee</strong><br>
                StudentsxCEOs International Summit 2026
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 8px 0; font-size: 12px; color: #64748b; font-weight: 600;">
                Connect with us:
                <a href="https://instagram.com/sxcintersummit" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">Instagram</a> &bull;
                <a href="https://linkedin.com/company/studentsxceos-international-summit" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">LinkedIn</a> &bull;
                <a href="https://tiktok.com/@intersummitsxc" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: none; margin: 0 6px;">TikTok</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
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

export interface MemberInvitationProps {
  memberName: string;
  leaderName: string;
  teamName: string;
  token: string;
  code: string;
  claimUrl: string;
}

export function renderMemberInvitationEmail(props: MemberInvitationProps): string {
  const bannerUrl = (env.EMAIL_HEADER_BANNER_URL || DEFAULT_EMAIL_HEADER_BANNER).trim();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation - IBCC 2026</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #1e293b;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f1f5f9; padding: 36px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; width: 100%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 0; margin: 0; background-color: #0b1536; text-align: center;">
              <img src="${bannerUrl}" alt="SXC International Summit 2026 Header Banner" 
                   width="560" style="width: 100%; max-width: 560px; height: auto; display: block; border-top-left-radius: 16px; border-top-right-radius: 16px; border: 0; outline: none; margin: 0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 28px; background-color: #ffffff;">
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
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8fafc; padding: 20px 28px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
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
