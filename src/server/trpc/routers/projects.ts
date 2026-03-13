import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const projects = await ctx.db.project.findMany({
        where: { workspaceId: input.workspaceId },
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.project.create({ data: input });
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.project.update({ where: { id }, data });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({ where: { id: input.id } });
      if (!project) throw new TRPCError({ code: 'NOT_FOUND', message: 'Project not found' });
      return ctx.db.project.delete({ where: { id: input.id } });
    }),
});
