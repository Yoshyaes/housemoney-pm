import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const dependenciesRouter = router({
  add: protectedProcedure
    .input(
      z.object({
        blockingTaskId: z.string(),
        blockedTaskId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.blockingTaskId === input.blockedTaskId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'A task cannot block itself' });
      }

      // Check for existing dependency
      const existing = await ctx.db.dependency.findUnique({
        where: {
          blockingTaskId_blockedTaskId: {
            blockingTaskId: input.blockingTaskId,
            blockedTaskId: input.blockedTaskId,
          },
        },
      });

      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This dependency already exists' });
      }

      // Check for circular dependency via BFS
      const visited = new Set<string>();
      const queue = [input.blockedTaskId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        if (current === input.blockingTaskId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This would create a circular dependency',
          });
        }
        if (visited.has(current)) continue;
        visited.add(current);

        const deps = await ctx.db.dependency.findMany({
          where: { blockingTaskId: current },
          select: { blockedTaskId: true },
        });

        for (const dep of deps) {
          queue.push(dep.blockedTaskId);
        }
      }

      const dependency = await ctx.db.dependency.create({
        data: input,
        include: {
          blockingTask: { select: { id: true, identifier: true, title: true, status: true } },
          blockedTask: { select: { id: true, identifier: true, title: true, status: true } },
        },
      });

      // Activity on both tasks
      await ctx.db.activity.createMany({
        data: [
          {
            taskId: input.blockingTaskId,
            userId: ctx.userId,
            action: 'dependency_added',
            field: 'blocking',
            newValue: dependency.blockedTask.identifier,
          },
          {
            taskId: input.blockedTaskId,
            userId: ctx.userId,
            action: 'dependency_added',
            field: 'blockedBy',
            newValue: dependency.blockingTask.identifier,
          },
        ],
      });

      return dependency;
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const dependency = await ctx.db.dependency.findUnique({
        where: { id: input.id },
        include: {
          blockingTask: { select: { id: true, identifier: true } },
          blockedTask: { select: { id: true, identifier: true } },
        },
      });

      if (!dependency) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dependency not found' });
      }

      await ctx.db.dependency.delete({ where: { id: input.id } });

      // Activity on both tasks
      await ctx.db.activity.createMany({
        data: [
          {
            taskId: dependency.blockingTaskId,
            userId: ctx.userId,
            action: 'dependency_removed',
            field: 'blocking',
            oldValue: dependency.blockedTask.identifier,
          },
          {
            taskId: dependency.blockedTaskId,
            userId: ctx.userId,
            action: 'dependency_removed',
            field: 'blockedBy',
            oldValue: dependency.blockingTask.identifier,
          },
        ],
      });

      return { success: true };
    }),
});
