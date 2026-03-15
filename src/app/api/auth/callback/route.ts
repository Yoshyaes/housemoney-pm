import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const invitationToken = requestUrl.searchParams.get('invitation');

  if (code) {
    const cookieStore = cookies();
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

      // Check for invitation token from OAuth redirect
      if (invitationToken) {
        const invitation = await db.invitation.findUnique({
          where: { token: invitationToken },
        });

        if (invitation && !invitation.acceptedAt && invitation.expiresAt > new Date() && invitation.email === user.email) {
          await db.workspaceMember.upsert({
            where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
            create: {
              workspaceId: invitation.workspaceId,
              userId: user.id,
              role: invitation.role,
            },
            update: {},
          });

          if (invitation.projectIds.length > 0) {
            await db.projectMember.createMany({
              data: invitation.projectIds.map((projectId) => ({
                projectId,
                userId: user.id,
              })),
              skipDuplicates: true,
            });
          }

          await db.invitation.update({
            where: { id: invitation.id },
            data: { acceptedAt: new Date() },
          });

          return NextResponse.redirect(requestUrl.origin);
        }
      }

      // Check for pending invitations by email (auto-accept)
      const pendingInvitations = await db.invitation.findMany({
        where: {
          email: user.email,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (pendingInvitations.length > 0) {
        for (const invitation of pendingInvitations) {
          await db.workspaceMember.upsert({
            where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
            create: {
              workspaceId: invitation.workspaceId,
              userId: user.id,
              role: invitation.role,
            },
            update: {},
          });

          if (invitation.projectIds.length > 0) {
            await db.projectMember.createMany({
              data: invitation.projectIds.map((projectId) => ({
                projectId,
                userId: user.id,
              })),
              skipDuplicates: true,
            });
          }

          await db.invitation.update({
            where: { id: invitation.id },
            data: { acceptedAt: new Date() },
          });
        }
      } else {
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

          await db.workspaceMember.create({
            data: {
              workspaceId: workspace.id,
              userId: session.user.id,
              role: 'ADMIN',
            },
          });
        }
      }
    }
  }

  return NextResponse.redirect(requestUrl.origin);
}
