import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

const authorSelect = { id: true, name: true, avatarUrl: true, avatarColor: true } as const;

async function requireFeedbackAccess(
  db: Parameters<typeof requireWorkspaceMember>[0],
  feedbackId: string,
  userId: string
) {
  const feedback = await db.feedback.findUniqueOrThrow({ where: { id: feedbackId } });
  const membership = await requireWorkspaceMember(db, feedback.workspaceId, userId);

  if (membership.role === 'GUEST') {
    if (!feedback.projectId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this feedback' });
    }
    await requireProjectAccess(db, feedback.projectId, userId);
  }

  return { feedback, membership };
}

export const feedbackCommentsRouter = router({
  list: protectedProcedure
    .input(z.object({ feedbackId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireFeedbackAccess(ctx.db, input.feedbackId, ctx.userId);

      return ctx.db.feedbackComment.findMany({
        where: { feedbackId: input.feedbackId },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: authorSelect } },
      });
    }),

  create: protectedProcedure
    .input(z.object({ feedbackId: z.string(), body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      await requireFeedbackAccess(ctx.db, input.feedbackId, ctx.userId);

      return ctx.db.feedbackComment.create({
        data: {
          feedbackId: input.feedbackId,
          authorId: ctx.userId,
          body: input.body,
        },
        include: { author: { select: authorSelect } },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.feedbackComment.findUniqueOrThrow({ where: { id: input.id } });
      const { membership } = await requireFeedbackAccess(ctx.db, comment.feedbackId, ctx.userId);

      if (comment.authorId !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await ctx.db.feedbackComment.delete({ where: { id: input.id } });
    }),
});
