import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

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

      await db.user.upsert({
        where: { id: session.user.id },
        update: { email: session.user.email! },
        create: {
          id: session.user.id,
          email: session.user.email!,
          name,
          avatarUrl: session.user.user_metadata?.avatar_url,
        },
      });

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

  return NextResponse.redirect(requestUrl.origin);
}
