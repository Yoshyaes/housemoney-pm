import { createSupabaseAdmin } from '@/server/auth/supabase-admin';

interface SendInviteEmailParams {
  email: string;
  role: 'MEMBER' | 'GUEST';
  workspaceName: string;
  inviterName: string;
  inviteToken: string;
}

/**
 * Sends an invitation email via Supabase's built-in auth email system.
 *
 * For new users: uses `inviteUserByEmail` which sends a Supabase invite email
 * and creates the auth user. When they click the link and set their password,
 * the auth callback auto-accepts their workspace invitation.
 *
 * For users who already have a Supabase auth account: sends a magic link
 * email so they can log in and access the workspace they were just added to.
 *
 * Role-specific metadata is passed via `data` so the email template can
 * be customized in the Supabase dashboard if desired.
 */
export async function sendInviteEmail({
  email,
  role,
  workspaceName,
  inviterName,
  inviteToken,
}: SendInviteEmailParams) {
  const supabase = createSupabaseAdmin();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
    || process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '') // fallback
    || 'http://localhost:3000';

  const redirectTo = `${appUrl}/api/auth/callback?invitation=${inviteToken}`;

  const roleLabel = role === 'GUEST' ? 'guest' : 'team member';

  // Try inviteUserByEmail first (for new users without a Supabase account)
  const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: {
      invitation_role: role,
      workspace_name: workspaceName,
      inviter_name: inviterName,
      invite_message: role === 'GUEST'
        ? `${inviterName} has invited you as a guest to the "${workspaceName}" workspace on House Money PM. You'll have access to specific projects they've shared with you.`
        : `${inviterName} has invited you to join the "${workspaceName}" workspace on House Money PM as a ${roleLabel}. You'll have full access to collaborate with the team.`,
    },
  });

  if (inviteError) {
    // If user already exists in Supabase auth, send a magic link instead
    if (inviteError.message?.includes('already been registered') || inviteError.status === 422) {
      const { error: magicLinkError } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo,
          data: {
            invitation_role: role,
            workspace_name: workspaceName,
            inviter_name: inviterName,
          },
        },
      });

      if (magicLinkError) {
        // Non-fatal: the invitation link in the UI still works as a fallback
        console.error('Failed to send magic link email:', magicLinkError.message);
        return { emailSent: false, reason: magicLinkError.message };
      }

      return { emailSent: true, method: 'magiclink' as const };
    }

    // Other errors are also non-fatal
    console.error('Failed to send invite email:', inviteError.message);
    return { emailSent: false, reason: inviteError.message };
  }

  return { emailSent: true, method: 'invite' as const };
}
