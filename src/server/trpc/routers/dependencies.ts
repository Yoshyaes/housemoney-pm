import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';
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

      // Verify both tasks exist and belong to the same workspace
      const [blockingTask, blockedTask] = await Promise.all([
        ctx.db.task.findUnique({ where: { id: input.blockingTaskId }, select: { workspaceId: true, projectId: true } }),
        ctx.db.task.findUnique({ where: { id: input.blockedTaskId }, select: { workspaceId: true, projectId: true } }),
      ]);

      if (!blockingTask || !blockedTask) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'One or both tasks not found' });
      }

      if (blockingTask.workspaceId !== blockedTask.workspaceId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Tasks must be in the same workspace' });
      }

      const membership = await requireWorkspaceMember(ctx.db, blockingTask.workspaceId, ctx.userId);

      // Guests must have access to both tasks' projects
      if (membership.role === 'GUEST') {
        if (!blockingTask.projectId || !blockedTask.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to one or both tasks' });
        }
        await requireProjectAccess(ctx.db, blockingTask.projectId, ctx.userId);
        await requireProjectAccess(ctx.db, blockedTask.projectId, ctx.userId);
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
          blockingTask: { select: { id: true, identifier: true, workspaceId: true } },
          blockedTask: { select: { id: true, identifier: true } },
        },
      });

      if (!dependency) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Dependency not found' });
      }

      const membership = await requireWorkspaceMember(ctx.db, dependency.blockingTask.workspaceId, ctx.userId);

      if (membership.role === 'GUEST') {
        const fullBlocking = await ctx.db.task.findUnique({ where: { id: dependency.blockingTaskId }, select: { projectId: true } });
        const fullBlocked = await ctx.db.task.findUnique({ where: { id: dependency.blockedTaskId }, select: { projectId: true } });
        if (!fullBlocking?.projectId || !fullBlocked?.projectId) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to one or both tasks' });
        }
        await requireProjectAccess(ctx.db, fullBlocking.projectId, ctx.userId);
        await requireProjectAccess(ctx.db, fullBlocked.projectId, ctx.userId);
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
