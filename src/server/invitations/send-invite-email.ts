import { Resend } from 'resend';
import { createSupabaseAdmin } from '@/server/auth/supabase-admin';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendInviteEmailParams {
  email: string;
  role: 'MEMBER' | 'GUEST';
  workspaceName: string;
  inviterName: string;
  inviteToken: string;
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    || 'http://localhost:3000'
  );
}

function buildInviteHtml({
  role,
  workspaceName,
  inviterName,
  acceptUrl,
}: {
  role: 'MEMBER' | 'GUEST';
  workspaceName: string;
  inviterName: string;
  acceptUrl: string;
}) {
  const isGuest = role === 'GUEST';

  const headline = isGuest
    ? `${inviterName} invited you to collaborate`
    : `${inviterName} invited you to join the team`;

  const description = isGuest
    ? `You've been invited as a <strong>guest</strong> to the <strong>${workspaceName}</strong> workspace on House Money PM. You'll have access to specific projects that have been shared with you.`
    : `You've been invited as a <strong>team member</strong> to the <strong>${workspaceName}</strong> workspace on House Money PM. You'll have full access to projects, tasks, and collaboration tools.`;

  const buttonText = isGuest ? 'View shared projects' : 'Join the workspace';

  const featureList = isGuest
    ? `
      <li>View and comment on shared projects</li>
      <li>Track task progress in real time</li>
      <li>Stay in the loop with your team</li>
    `
    : `
      <li>Create and manage tasks across projects</li>
      <li>Collaborate with your team in real time</li>
      <li>Track progress with boards, lists, and timelines</li>
    `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to ${workspaceName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color: #1c1917; padding: 32px 40px; text-align: center;">
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
                <tr>
                  <td style="background-color: #BA7517; width: 36px; height: 36px; border-radius: 8px; text-align: center; vertical-align: middle; font-size: 14px; font-weight: 600; color: #ffffff; letter-spacing: 0.5px;">
                    HM
                  </td>
                  <td style="padding-left: 12px; font-size: 18px; font-weight: 600; color: #ffffff; letter-spacing: -0.3px;">
                    House Money PM
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 40px 20px;">
              <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #18181b; line-height: 1.3;">
                ${headline}
              </h1>
              <p style="margin: 0 0 28px; font-size: 14px; color: #52525b; line-height: 1.6;">
                ${description}
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="padding-bottom: 28px;">
                    <a href="${acceptUrl}" target="_blank" style="display: inline-block; background-color: #BA7517; color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px; letter-spacing: 0.2px;">
                      ${buttonText}
                    </a>
                  </td>
                </tr>
              </table>

              <!-- What you can do -->
              <p style="margin: 0 0 12px; font-size: 12px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.8px;">
                What you can do
              </p>
              <ul style="margin: 0 0 24px; padding-left: 18px; font-size: 13px; color: #52525b; line-height: 2;">
                ${featureList}
              </ul>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 0 40px;">
              <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px 28px; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 11px; color: #a1a1aa; line-height: 1.5;">
                This invitation was sent by ${inviterName} from the ${workspaceName} workspace.
              </p>
              <p style="margin: 0; font-size: 11px; color: #d4d4d8;">
                If you didn't expect this email, you can safely ignore it.
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
 * Sends a branded invitation email via Resend.
 *
 * For new users: also creates a Supabase auth user via generateLink (invite type)
 * so they can set their password when they click through.
 *
 * The accept URL points to /api/invitations/accept which handles both
 * authenticated and unauthenticated users appropriately.
 */
export async function sendInviteEmail({
  email,
  role,
  workspaceName,
  inviterName,
  inviteToken,
}: SendInviteEmailParams) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set — skipping invite email');
    return { emailSent: false, reason: 'Email service not configured' };
  }

  const appUrl = getAppUrl();
  const acceptUrl = `${appUrl}/api/invitations/accept?token=${inviteToken}`;

  // For new users, create the Supabase auth account so they can set a password on signup
  const supabase = createSupabaseAdmin();
  const { data: existingUsers } = await supabase.auth.admin.listUsers();
  const userExists = existingUsers?.users?.some((u) => u.email === email);

  if (!userExists) {
    // Generate an invite link (creates the Supabase auth user) but don't send Supabase's email
    await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${appUrl}/api/auth/callback?invitation=${inviteToken}`,
      },
    });
  }

  // Send our custom branded email
  const isGuest = role === 'GUEST';
  const subject = isGuest
    ? `${inviterName} invited you to collaborate on ${workspaceName}`
    : `${inviterName} invited you to join ${workspaceName}`;

  const fromAddress = process.env.RESEND_FROM_EMAIL || 'House Money PM <noreply@resend.dev>';

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: email,
    subject,
    html: buildInviteHtml({ role, workspaceName, inviterName, acceptUrl }),
  });

  if (error) {
    console.error('Failed to send invite email via Resend:', error);
    return { emailSent: false, reason: error.message };
  }

  return { emailSent: true };
}
