import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db';
import { acceptInvitation, acceptPendingInvitations } from '@/server/invitations/accept-invitation';
import { auditLog, AuditAction } from '@/server/audit/log';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const invitationToken = requestUrl.searchParams.get('invitation');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
            try {
              for (const { name, value, options } of cookiesToSet) {
                cookieStore.set(name, value, options as never);
              }
            } catch {
              // Ignore
            }
          },
        },
      }
    );
    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code);

    if (session?.user) {
      const name = session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User';

      const existingUser = await db.user.findUnique({ where: { id: session.user.id } });
      const user = await db.user.upsert({
        where: { id: session.user.id },
        update: { email: session.user.email! },
        create: {
          id: session.user.id,
          email: session.user.email!,
          name,
          avatarUrl: session.user.user_metadata?.avatar_url,
        },
      });

      await auditLog(db, {
        action: existingUser ? AuditAction.OAUTH_LOGIN : AuditAction.ACCOUNT_CREATED,
        email: user.email,
        userId: user.id,
        metadata: { provider: session.user.app_metadata?.provider || 'oauth' },
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      // Check for invitation token from OAuth redirect
      if (invitationToken) {
        const invitation = await db.invitation.findUnique({
          where: { token: invitationToken },
        });

        if (invitation && !invitation.acceptedAt && invitation.expiresAt > new Date() && invitation.email === user.email) {
          await acceptInvitation(db, invitation, user.id);
          return NextResponse.redirect(requestUrl.origin);
        }
      }

      // Check for pending invitations by email (auto-accept)
      const hadInvitations = await acceptPendingInvitations(db, user.email, user.id);

      if (!hadInvitations) {
        // No invitations — add to default workspace if not already a member
        const membership = await db.workspaceMember.findFirst({
          where: { userId: session.user.id },
        });

        if (!membership) {
          const workspace = await db.workspace.upsert({
            where: { slug: 'house-money' },
            update: {},
            create: { name: 'House Money', slug: 'house-money' },
          });

          // First member becomes ADMIN; all subsequent members are MEMBER
          const existingMemberCount = await db.workspaceMember.count({
            where: { workspaceId: workspace.id },
          });
          const role = existingMemberCount === 0 ? 'ADMIN' : 'MEMBER';

          await db.workspaceMember.create({
            data: {
              workspaceId: workspace.id,
              userId: session.user.id,
              role,
            },
          });
        }
      }
    }
  }

  return NextResponse.redirect(requestUrl.origin);
}
