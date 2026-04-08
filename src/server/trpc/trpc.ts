import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { db } from '@/server/db';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import type { User } from '@/generated/prisma/client';
import { acceptPendingInvitations } from '@/server/invitations/accept-invitation';
import { auditLog, AuditAction } from '@/server/audit/log';

export type Context = {
  db: typeof db;
  user: User | null;
  userId: string | null;
};

export async function createContext(): Promise<Context> {
  try {
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
      const newUser = await db.user.create({
        data: {
          id: authUser.id,
          email: authUser.email!,
          name,
          avatarUrl: authUser.user_metadata?.avatar_url || null,
        },
      });
      user = newUser;

      await auditLog(db, {
        action: AuditAction.ACCOUNT_CREATED,
        email: newUser.email,
        userId: newUser.id,
      });

      // Check for pending invitations for this email
      const hadInvitations = await acceptPendingInvitations(db, newUser.email, newUser.id);

      if (!hadInvitations) {
        // No invitations — add to default workspace
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
            userId: newUser.id,
            role,
          },
        });
      }
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

export async function requireWorkspaceMember(
  db: Context['db'],
  workspaceId: string,
  userId: string
) {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });
  }
  return membership;
}

export async function requireWorkspaceAdmin(
  db: Context['db'],
  workspaceId: string,
  userId: string
) {
  const membership = await requireWorkspaceMember(db, workspaceId, userId);
  if (membership.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only workspace admins can perform this action' });
  }
  return membership;
}

export async function requireNonGuest(
  db: Context['db'],
  workspaceId: string,
  userId: string
) {
  const membership = await requireWorkspaceMember(db, workspaceId, userId);
  if (membership.role === 'GUEST') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Guests cannot perform this action' });
  }
  return membership;
}

export async function requireProjectAccess(
  db: Context['db'],
  projectId: string,
  userId: string
) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
  }

  const membership = await requireWorkspaceMember(db, project.workspaceId, userId);

  // Admins always have access
  if (membership.role === 'ADMIN') return { membership, project };

  // Members have access to non-private projects, or projects they created
  if (membership.role === 'MEMBER') {
    if (!project.isPrivate || project.createdById === userId) {
      return { membership, project };
    }
    // Members can also be explicitly added to private projects
    const pm = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    if (pm) return { membership, project };
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this project' });
  }

  // Guests must have explicit ProjectMember record
  const pm = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (!pm) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this project' });
  }
  return { membership, project };
}

export async function getAccessibleProjectIds(
  db: Context['db'],
  workspaceId: string,
  userId: string
): Promise<string[] | null> {
  const membership = await requireWorkspaceMember(db, workspaceId, userId);

  // Admins and members see all applicable projects (null means no restriction)
  if (membership.role === 'ADMIN' || membership.role === 'MEMBER') return null;

  // Guests only see projects they're explicitly added to
  const projectMembers = await db.projectMember.findMany({
    where: { userId, project: { workspaceId } },
    select: { projectId: true },
  });
  return projectMembers.map((pm) => pm.projectId);
}
