import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { db } from '@/server/db';
import { acceptInvitation } from '@/server/invitations/accept-invitation';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Validate the invitation
  const invitation = await db.invitation.findUnique({
    where: { token },
    include: { workspace: { select: { name: true, slug: true } } },
  });

  if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    return NextResponse.redirect(new URL('/login?error=invalid_invitation', request.url));
  }

  // Check if user is authenticated
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
            // Ignore in Server Components
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    // Not logged in — redirect to signup with invitation token
    return NextResponse.redirect(new URL(`/signup?invitation=${token}`, request.url));
  }

  // User is logged in — accept the invitation
  const dbUser = await db.user.findUnique({ where: { id: user.id } });
  if (!dbUser) {
    return NextResponse.redirect(new URL('/login?error=user_not_found', request.url));
  }

  // Verify email matches
  if (dbUser.email !== invitation.email) {
    return NextResponse.redirect(new URL('/login?error=email_mismatch', request.url));
  }

  // Accept the invitation (creates membership, project access, marks accepted)
  await acceptInvitation(db, invitation, user.id);

  // Redirect to app
  return NextResponse.redirect(new URL('/', request.url));
}
