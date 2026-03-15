import { z } from 'zod';
import { router, protectedProcedure, requireProjectAccess, requireWorkspaceMember } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const sectionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.projectId, ctx.userId);

      return ctx.db.section.findMany({
        where: { projectId: input.projectId },
        orderBy: { order: 'asc' },
      });
    }),

  create: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await requireProjectAccess(ctx.db, input.projectId, ctx.userId);

      const last = await ctx.db.section.findFirst({
        where: { projectId: input.projectId },
        orderBy: { order: 'desc' },
      });
      return ctx.db.section.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          order: (last?.order ?? -1) + 1,
        },
      });
    }),

  rename: protectedProcedure
    .input(z.object({ id: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const section = await ctx.db.section.findUnique({
        where: { id: input.id },
        include: { project: { select: { id: true } } },
      });

      if (!section) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Section not found' });
      }

      await requireProjectAccess(ctx.db, section.project.id, ctx.userId);

      return ctx.db.section.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const section = await ctx.db.section.findUnique({
        where: { id: input.id },
        include: { project: { select: { id: true } } },
      });

      if (!section) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Section not found' });
      }

      await requireProjectAccess(ctx.db, section.project.id, ctx.userId);

      // Detach tasks from section before deleting
      await ctx.db.task.updateMany({
        where: { sectionId: input.id },
        data: { sectionId: null },
      });
      return ctx.db.section.delete({ where: { id: input.id } });
    }),

  moveTask: protectedProcedure
    .input(z.object({ taskId: z.string(), sectionId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.task.findUnique({
        where: { id: input.taskId },
        select: { workspaceId: true, projectId: true },
      });

      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, task.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        if (!task.projectId) throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this task' });
        await requireProjectAccess(ctx.db, task.projectId, ctx.userId);
      }

      // If moving to a section, verify project access for that section too
      if (input.sectionId) {
        const section = await ctx.db.section.findUnique({
          where: { id: input.sectionId },
          select: { projectId: true },
        });
        if (section) {
          await requireProjectAccess(ctx.db, section.projectId, ctx.userId);
        }
      }

      return ctx.db.task.update({
        where: { id: input.taskId },
        data: { sectionId: input.sectionId },
      });
    }),
});
