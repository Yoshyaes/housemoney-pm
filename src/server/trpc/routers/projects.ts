import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const projectsRouter = router({
  list: protectedProcedure
    .input(z.object({ workspaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Admins see all projects; members only see public ones + projects they created
      const membership = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: ctx.userId } },
      });
      const isAdmin = membership?.role === 'ADMIN';

      const projects = await ctx.db.project.findMany({
        where: {
          workspaceId: input.workspaceId,
          ...(isAdmin ? {} : { OR: [{ isPrivate: false }, { createdById: ctx.userId }] }),
        },
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

      // Only admins or the creator can toggle privacy
      if (data.isPrivate !== undefined) {
        const project = await ctx.db.project.findUniqueOrThrow({ where: { id } });
        const membership = await ctx.db.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId: project.workspaceId, userId: ctx.userId } },
        });
        if (membership?.role !== 'ADMIN' && project.createdById !== ctx.userId) {
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
      return ctx.db.project.delete({ where: { id: input.id } });
    }),
});
