import { z } from 'zod';
import { router, protectedProcedure, requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

const authorSelect = { id: true, name: true, avatarUrl: true, avatarColor: true } as const;

async function requireDocumentAccess(
  db: Parameters<typeof requireWorkspaceMember>[0],
  documentId: string,
  userId: string
) {
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
  const membership = await requireWorkspaceMember(db, doc.workspaceId, userId);

  if (membership.role === 'GUEST') {
    if (!doc.projectId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No access to this document' });
    }
    await requireProjectAccess(db, doc.projectId, userId);
  }

  return { doc, membership };
}

export const docCommentsRouter = router({
  list: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .query(async ({ ctx, input }) => {
      await requireDocumentAccess(ctx.db, input.documentId, ctx.userId);

      return ctx.db.documentComment.findMany({
        where: { documentId: input.documentId },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: authorSelect } },
      });
    }),

  create: protectedProcedure
    .input(z.object({ documentId: z.string(), body: z.string().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      await requireDocumentAccess(ctx.db, input.documentId, ctx.userId);

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
      const { membership } = await requireDocumentAccess(ctx.db, comment.documentId, ctx.userId);

      if (comment.authorId !== ctx.userId && membership.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }

      await ctx.db.documentComment.delete({ where: { id: input.id } });
    }),
});
