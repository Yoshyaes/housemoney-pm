import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { db } from '@/server/db';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { User } from '@/generated/prisma/client';

export type Context = {
  db: typeof db;
  user: User | null;
  userId: string | null;
};

export async function createContext(): Promise<Context> {
  try {
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
    const { data: { user: authUser } } = await supabase.auth.getUser();

    if (!authUser) {
      return { db, user: null, userId: null };
    }

    let user = await db.user.findUnique({
      where: { id: authUser.id },
    });

    // Auto-create Prisma User + workspace membership on first API call after signup
    if (!user) {
      const name = authUser.user_metadata?.name || authUser.email?.split('@')[0] || 'User';
      user = await db.user.create({
        data: {
          id: authUser.id,
          email: authUser.email!,
          name,
          avatarUrl: authUser.user_metadata?.avatar_url || null,
        },
      });

      // Add to default workspace
      const workspace = await db.workspace.upsert({
        where: { slug: 'house-money' },
        update: {},
        create: { name: 'House Money', slug: 'house-money' },
      });

      await db.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: user.id,
          role: 'ADMIN',
        },
      });
    }

    return { db, user, userId: authUser.id };
  } catch {
    return { db, user: null, userId: null };
  }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      userId: ctx.userId,
    },
  });
});
