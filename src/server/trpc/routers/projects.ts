import { z } from 'zod';
import { router, protectedProcedure, requireNonGuest, getAccessibleProjectIds, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const membership = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: ctx.userId } },
      });
      if (!membership) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });
      }

      const isAdmin = membership.role === 'ADMIN';
      const isGuest = membership.role === 'GUEST';

      let whereClause;
      if (isGuest) {
        // Guests only see projects they're explicitly added to
        const accessibleIds = await getAccessibleProjectIds(ctx.db, input.workspaceId, ctx.userId);
        whereClause = {
          workspaceId: input.workspaceId,
          id: { in: accessibleIds ?? [] },
        };
      } else {
        whereClause = {
          workspaceId: input.workspaceId,
          ...(isAdmin ? {} : { OR: [{ isPrivate: false }, { createdById: ctx.userId }] }),
        };
      }

      const projects = await ctx.db.project.findMany({
        where: whereClause,
        orderBy: { createdAt: 'asc' },
        include: {
          _count: { select: { tasks: true } },
          tasks: {
            select: { status: true },
          },
        },
      });

      return projects.map((p) => {
        const total = p.tasks.length;
        const done = p.tasks.filter((t) => t.status === 'DONE').length;
        const progress = total > 0 ? Math.round((done / total) * 100) : 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { tasks: _tasks, ...project } = p;
        return { ...project, progress };
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        workspaceId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        color: z.string().optional(),
        targetDate: z.date().optional(),
        isPrivate: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireNonGuest(ctx.db, input.workspaceId, ctx.userId);

      return ctx.db.project.create({
        data: { ...input, createdById: ctx.userId },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED']).optional(),
        color: z.string().optional(),
        targetDate: z.date().nullable().optional(),
        isPrivate: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const project = await ctx.db.project.findUniqueOrThrow({ where: { id } });

      const membership = await requireNonGuest(ctx.db, project.workspaceId, ctx.userId);

      // Non-admin members can only update projects they have access to
      if (membership.role !== 'ADMIN') {
        if (project.isPrivate && project.createdById !== ctx.userId) {
          await requireProjectAccess(ctx.db, id, ctx.userId);
        }
      }

      // Only admins or the creator can toggle privacy
      if (data.isPrivate !== undefined) {
        if (membership.role !== 'ADMIN' && project.createdById !== ctx.userId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins or the project creator can change visibility.' });
        }
      }

      return ctx.db.project.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({ where: { id: input.id } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });

      const membership = await requireNonGuest(ctx.db, project.workspaceId, ctx.userId);

      // Only admins or the project creator can delete
      if (membership.role !== 'ADMIN' && project.createdById !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins or the project creator can delete a project.' });
      }

      return ctx.db.project.delete({ where: { id: input.id } });
    }),

  // Project member management
  getMembers: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.projectId, ctx.userId);

      const projectMembers = await ctx.db.projectMember.findMany({
        where: { projectId: input.projectId },
        include: { user: true },
      });

      return projectMembers.map((pm) => ({
        ...pm.user,
        projectMembershipId: pm.id,
      }));
    }),

  addMember: protectedProcedure
    .input(z.object({ projectId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { project } = await requireProjectAccess(ctx.db, input.projectId, ctx.userId);

      // Only non-guests can add members to projects
      await requireNonGuest(ctx.db, project.workspaceId, ctx.userId);

      // Verify target user is a workspace member
      await ctx.db.workspaceMember.findUniqueOrThrow({
        where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: input.userId } },
      });

      return ctx.db.projectMember.upsert({
        where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
        create: { projectId: input.projectId, userId: input.userId },
        update: {},
        include: { user: true },
      });
    }),

  removeMember: protectedProcedure
    .input(z.object({ projectId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { project } = await requireProjectAccess(ctx.db, input.projectId, ctx.userId);

      // Only non-guests can remove members from projects
      await requireNonGuest(ctx.db, project.workspaceId, ctx.userId);

      return ctx.db.projectMember.delete({
        where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
      });
    }),
});
