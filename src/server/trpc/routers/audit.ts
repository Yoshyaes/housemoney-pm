import { z } from 'zod';
import { router, protectedProcedure, publicProcedure, requireWorkspaceAdmin } from '@/server/trpc/trpc';
import { auditLog, AuditAction } from '@/server/audit/log';

export const auditRouter = router({
  /**
   * List audit log entries. Admin-only.
   */
  list: protectedProcedure
    .input(z.object({
      workspaceId: z.string(),
      action: z.string().optional(),
      email: z.string().optional(),
      cursor: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      await requireWorkspaceAdmin(ctx.db, input.workspaceId, ctx.userId);

      const where: Record<string, unknown> = {};

      // Show logs for this workspace OR global logs (workspaceId is null)
      where.OR = [
        { workspaceId: input.workspaceId },
        { workspaceId: null },
      ];

      if (input.action) {
        where.action = input.action;
      }
      if (input.email) {
        where.email = { contains: input.email, mode: 'insensitive' };
      }

      const items = await ctx.db.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true, avatarColor: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });

      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        const next = items.pop();
        nextCursor = next?.id;
      }

      return { items, nextCursor };
    }),

  /**
   * Log a client-side auth event (login/signup).
   * Public procedure since user isn't authenticated yet.
   */
  logAuth: publicProcedure
    .input(z.object({
      action: z.enum([
        AuditAction.LOGIN_SUCCESS,
        AuditAction.LOGIN_FAILED,
        AuditAction.SIGNUP,
        AuditAction.SIGNUP_FAILED,
      ]),
      email: z.string().email(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await auditLog(ctx.db, {
        action: input.action,
        email: input.email,
        metadata: input.metadata,
      });
      return { success: true };
    }),
});
