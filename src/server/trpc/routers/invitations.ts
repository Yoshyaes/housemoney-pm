import { z } from 'zod';
import { router, protectedProcedure, requireNonGuest } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const invitationsRouter = router({
  create: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      email: z.string().email(),
      role: z.enum(['MEMBER', 'GUEST']).default('GUEST'),
      projectIds: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);

      // Guests must be assigned to at least one project
      if (input.role === 'GUEST' && input.projectIds.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Guest invitations must include at least one project.' });
      }

      // Check if user already exists and is already a member
      const existingUser = await ctx.db.user.findUnique({ where: { email: input.email } });
      if (existingUser) {
        const existingMember = await ctx.db.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: existingUser.id } },
        });
        if (existingMember) {
          throw new TRPCError({ code: 'CONFLICT', message: 'User is already a workspace member.' });
        }
      }

      // Check for existing pending invitation
      const existingInvite = await ctx.db.invitation.findUnique({
        where: { workspaceId_email: { workspaceId: input.workspaceId, email: input.email } },
      });
      if (existingInvite && !existingInvite.acceptedAt) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An invitation is already pending for this email.' });
      }

      // If previously accepted invitation exists, delete it to allow re-invite
      if (existingInvite) {
        await ctx.db.invitation.delete({ where: { id: existingInvite.id } });
      }

      const invitation = await ctx.db.invitation.create({
        data: {
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          projectIds: input.projectIds,
          invitedById: ctx.userId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
        include: {
          workspace: { select: { name: true } },
          invitedBy: { select: { name: true, email: true } },
        },
      });

      // If the user already has an account, auto-accept
      if (existingUser) {
        await ctx.db.workspaceMember.create({
          data: {
            workspaceId: input.workspaceId,
            userId: existingUser.id,
            role: input.role,
          },
        });

        if (input.projectIds.length > 0) {
          await ctx.db.projectMember.createMany({
            data: input.projectIds.map((projectId) => ({
              projectId,
              userId: existingUser.id,
            })),
            skipDuplicates: true,
          });
        }

        await ctx.db.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      }

      return invitation;
    }),

  accept: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findUnique({
        where: { token: input.token },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found.' });
      }
      if (invitation.acceptedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has already been accepted.' });
      }
      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invitation has expired.' });
      }

      // Check email matches
      if (invitation.email !== ctx.user!.email) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'This invitation was sent to a different email address.' });
      }

      // Create workspace membership
      await ctx.db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: ctx.userId } },
        create: {
          workspaceId: invitation.workspaceId,
          userId: ctx.userId,
          role: invitation.role,
        },
        update: {},
      });

      // Create project memberships
      if (invitation.projectIds.length > 0) {
        await ctx.db.projectMember.createMany({
          data: invitation.projectIds.map((projectId) => ({
            projectId,
            userId: ctx.userId,
          })),
          skipDuplicates: true,
        });
      }

      // Mark as accepted
      await ctx.db.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return { success: true, workspaceId: invitation.workspaceId };
    }),

  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.invitation.findMany({
        where: {
          workspaceId: input.workspaceId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          invitedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.db.invitation.findUnique({
        where: { id: input.id },
      });

      if (!invitation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invitation not found.' });
      }

      await requireNonGuest(ctx.db, invitation.workspaceId, ctx.userId);

      return ctx.db.invitation.delete({ where: { id: input.id } });
    }),
});
