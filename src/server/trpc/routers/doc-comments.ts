import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

const authorSelect = { id: true, name: true, avatarUrl: true, avatarColor: true } as const;

export const docCommentsRouter = router({
  list: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.documentComment.findMany({
        where: { documentId: input.documentId },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: authorSelect } },
      });
    }),

  create: protectedProcedure
    .input(z.object({ documentId: z.string(), body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.documentComment.create({
        data: {
          documentId: input.documentId,
          authorId: ctx.userId,
          body: input.body,
        },
        include: { author: { select: authorSelect } },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const comment = await ctx.db.documentComment.findUniqueOrThrow({ where: { id: input.id } });

      // Get the document to check workspace membership for admin check
      const doc = await ctx.db.document.findUniqueOrThrow({ where: { id: comment.documentId } });
      const membership = await ctx.db.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId: doc.workspaceId, userId: ctx.userId } },
      });

      if (comment.authorId !== ctx.userId && membership?.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await ctx.db.documentComment.delete({ where: { id: input.id } });
    }),
});
