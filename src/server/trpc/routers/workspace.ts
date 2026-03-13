import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireWorkspaceAdmin } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';
import { createClient } from '@supabase/supabase-js';

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
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

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

  inviteMember: protectedProcedure
    .input(z.object({ workspaceId: z.string(), email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

      // Find user by email
      const user = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (!user) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No account found with that email. The user must sign up first.',
        });
      }
      // Check not already a member
      const existing = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: user.id } },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'User is already a member.' });
      }
      return ctx.db.workspaceMember.create({
        data: { workspaceId: input.workspaceId, userId: user.id, role: 'MEMBER' },
        include: { user: true },
      });
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
      return ctx.db.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
      });
    }),

  updateMemberRole: protectedProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string(), role: z.enum(['ADMIN', 'MEMBER']) }))
    .mutation(async ({ ctx, input }) => {
      await requireWorkspaceAdmin(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        data: { role: input.role },
      });
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
      await requireWorkspaceMember(ctx.db, input.workspaceId, ctx.userId);

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
      await requireWorkspaceMember(ctx.db, label.workspaceId, ctx.userId);

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
    }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'You can only update your own profile.' });
      }
      const { userId, ...data } = input;
      return ctx.db.user.update({ where: { id: userId }, data });
    }),

  sendPasswordReset: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      const { error } = await supabase.auth.resetPasswordForEmail(input.email, {
        redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('.supabase.co', '')}/auth/callback`,
      });
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return { success: true };
    }),
});
