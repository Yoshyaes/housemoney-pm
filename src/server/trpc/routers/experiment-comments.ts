import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

const authorSelect = { id: true, name: true, avatarUrl: true, avatarColor: true } as const;

async function requireExperimentAccess(
  db: Parameters<typeof requireWorkspaceMember>[0],
  experimentId: string,
  userId: string
) {
  const experiment = await db.experiment.findUniqueOrThrow({ where: { id: experimentId } });
  const membership = await requireWorkspaceMember(db, experiment.workspaceId, userId);

  if (membership.role === 'GUEST') {
    if (!experiment.projectId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this experiment' });
    }
    await requireProjectAccess(db, experiment.projectId, userId);
  }

  return { experiment, membership };
}

export const experimentCommentsRouter = router({
  list: protectedProcedure
    .input(z.object({ experimentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireExperimentAccess(ctx.db, input.experimentId, ctx.userId);

      return ctx.db.experimentComment.findMany({
        where: { experimentId: input.experimentId },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: authorSelect } },
      });
    }),

  create: protectedProcedure
    .input(z.object({ experimentId: z.string(), body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      await requireExperimentAccess(ctx.db, input.experimentId, ctx.userId);

      return ctx.db.experimentComment.create({
        data: {
          experimentId: input.experimentId,
          authorId: ctx.userId,
          body: input.body,
        },
        include: { author: { select: authorSelect } },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.experimentComment.findUniqueOrThrow({ where: { id: input.id } });
      const { membership } = await requireExperimentAccess(ctx.db, comment.experimentId, ctx.userId);

      if (comment.authorId !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await ctx.db.experimentComment.delete({ where: { id: input.id } });
    }),
});
