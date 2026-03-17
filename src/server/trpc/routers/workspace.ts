import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireWorkspaceAdmin, requireNonGuest } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { createSupabaseAdmin } from '@/server/auth/supabase-admin';
import { auditLog, AuditAction } from '@/server/audit/log';

export const workspaceRouter = router({
  getCurrent: protectedProcedure.query(async ({ ctx }) => {
    const membership = await ctx.db.workspaceMember.findFirst({
      where: { userId: ctx.userId },
      include: { workspace: true },
    });
    return membership?.workspace ?? null;
  }),

  getMembers: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        // Guests only see members who share at least one project with them
        const myProjectIds = await ctx.db.projectMember.findMany({
          where: { userId: ctx.userId, project: { workspaceId: input.workspaceId } },
          select: { projectId: true },
        });
        const projectIds = myProjectIds.map((pm) => pm.projectId);

        // Find users who are members of those projects or are assigned tasks in those projects
        const sharedProjectMembers = await ctx.db.projectMember.findMany({
          where: { projectId: { in: projectIds } },
          select: { userId: true },
        });
        const sharedUserIds = [...new Set([
          ctx.userId,
          ...sharedProjectMembers.map((pm) => pm.userId),
        ])];

        const members = await ctx.db.workspaceMember.findMany({
          where: { workspaceId: input.workspaceId, userId: { in: sharedUserIds } },
          include: { user: true },
        });
        return members.map((m) => ({
          ...m.user,
          role: m.role,
          membershipId: m.id,
        }));
      }

      const members = await ctx.db.workspaceMember.findMany({
        where: { workspaceId: input.workspaceId },
        include: { user: true },
      });
      return members.map((m) => ({
        ...m.user,
        role: m.role,
        membershipId: m.id,
      }));
    }),

  removeMember: protectedProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAdmin(ctx.db, input.workspaceId, ctx.userId);

      // Prevent removing the last admin
      const admins = await ctx.db.workspaceMember.count({
        where: { workspaceId: input.workspaceId, role: 'ADMIN' },
      });
      const memberToRemove = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      });
      if (memberToRemove?.role === 'ADMIN' && admins <= 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove the last admin.' });
      }
      const removedUser = await ctx.db.user.findUnique({ where: { id: input.userId }, select: { email: true } });
      const result = await ctx.db.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      });
      await auditLog(ctx.db, {
        action: AuditAction.MEMBER_REMOVED,
        email: removedUser?.email,
        userId: input.userId,
        workspaceId: input.workspaceId,
        metadata: { removedBy: ctx.userId },
      });
      return result;
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      userId: z.string(),
      role: z.enum(['ADMIN', 'MEMBER', 'GUEST']),
      projectIds: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAdmin(ctx.db, input.workspaceId, ctx.userId);

      // Downgrading to GUEST requires at least one project
      if (input.role === 'GUEST' && (!input.projectIds || input.projectIds.length === 0)) {
        // Check if user already has project memberships
        const existingProjects = await ctx.db.projectMember.count({
          where: { userId: input.userId, project: { workspaceId: input.workspaceId } },
        });
        if (existingProjects === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'When downgrading to guest, the user must be assigned to at least one project.',
          });
        }
      }

      const updated = await ctx.db.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        data: { role: input.role },
      });

      // If setting to GUEST with specific projects, create project memberships
      if (input.role === 'GUEST' && input.projectIds && input.projectIds.length > 0) {
        await ctx.db.projectMember.createMany({
          data: input.projectIds.map((projectId) => ({
            projectId,
            userId: input.userId,
          })),
          skipDuplicates: true,
        });
      }

      return updated;
    }),

  getLabels: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.label.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { name: 'asc' },
      });
    }),

  createLabel: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      name: z.string().min(1),
      color: z.string(),
      bgColor: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.label.create({ data: input });
    }),

  updateLabel: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      color: z.string().optional(),
      bgColor: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const label = await ctx.db.label.findUniqueOrThrow({ where: { id: input.id } });
      await requireNonGuest(ctx.db, label.workspaceId, ctx.userId);

      const { id, ...data } = input;
      return ctx.db.label.update({ where: { id }, data });
    }),

  deleteLabel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const label = await ctx.db.label.findUniqueOrThrow({ where: { id: input.id } });
      await requireWorkspaceAdmin(ctx.db, label.workspaceId, ctx.userId);

      return ctx.db.label.delete({ where: { id: input.id } });
    }),

  updateUser: protectedProcedure
    .input(z.object({
      userId: z.string(),
      name: z.string().min(1).optional(),
      avatarColor: z.string().optional(),
      avatarUrl: z.string().nullable().optional(),
      notificationPrefs: z.record(z.string(), z.boolean()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only update your own profile.' });
      }
      const { userId, notificationPrefs, ...data } = input;
      return ctx.db.user.update({
        where: { id: userId },
        data: {
          ...data,
          ...(notificationPrefs !== undefined ? { notificationPrefs: JSON.parse(JSON.stringify(notificationPrefs)) } : {}),
        },
      });
    }),

  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      return ctx.db.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        include: {
          memberships: {
            include: { workspace: { select: { id: true, name: true, slug: true } } },
          },
        },
      });
    }),

  deleteAccount: protectedProcedure
    .mutation(async ({ ctx }) => {
      // Remove all workspace memberships
      await ctx.db.workspaceMember.deleteMany({ where: { userId: ctx.userId } });
      await ctx.db.projectMember.deleteMany({ where: { userId: ctx.userId } });
      // Delete the user record
      await ctx.db.user.delete({ where: { id: ctx.userId } });
      // Delete from Supabase auth
      const supabase = createSupabaseAdmin();
      await supabase.auth.admin.deleteUser(ctx.userId);
      return { success: true };
    }),

  sendPasswordReset: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const supabase = createSupabaseAdmin();
      const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '')}/auth/callback`,
      });
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      await auditLog(ctx.db, {
        action: AuditAction.PASSWORD_RESET_REQUESTED,
        email: input.email,
        userId: ctx.userId,
        metadata: { requestedBy: ctx.userId },
      });
      return { success: true };
    }),
});
