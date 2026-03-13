import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';

export const sectionsRouter = router({
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.section.findMany({
        where: { projectId: input.projectId },
        orderBy: { order: 'asc' },
      });
    }),

  create: protectedProcedure
    .input(z.object({ projectId: z.string(), name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
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
      return ctx.db.section.update({
        where: { id: input.id },
        data: { name: input.name },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
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
      return ctx.db.task.update({
        where: { id: input.taskId },
        data: { sectionId: input.sectionId },
      });
    }),
});
