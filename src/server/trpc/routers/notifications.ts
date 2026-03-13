import { z } from 'zod';
import { router, protectedProcedure } from '@/server/trpc/trpc';
import { TRPCError } from '@trpc/server';

export const notificationsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        filter: z.enum(['unread', 'all', 'archived']).optional(),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {
        userId: ctx.userId,
        OR: [
          { snoozedUntil: null },
          { snoozedUntil: { lt: new Date() } },
        ],
      };

      if (input.filter === 'unread') {
        where.read = false;
        where.archivedAt = null;
      } else if (input.filter === 'archived') {
        where.archivedAt = { not: null };
      } else {
        where.archivedAt = null;
      }

      const notifications = await ctx.db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: (input.limit || 20) + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        include: {
          actor: true,
          task: { select: { id: true, identifier: true, title: true } },
        },
      });

      let nextCursor: string | undefined;
      if (notifications.length > (input.limit || 20)) {
        const nextItem = notifications.pop();
        nextCursor = nextItem?.id;
      }

      return { notifications, nextCursor };
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({
      where: {
        userId: ctx.userId,
        read: false,
        archivedAt: null,
        OR: [
          { snoozedUntil: null },
          { snoozedUntil: { lt: new Date() } },
        ],
      },
    });
  }),

  markRead: protectedProcedure
    .input(
      z.object({
        id: z.string().optional(),
        all: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.all) {
        await ctx.db.notification.updateMany({
          where: { userId: ctx.userId, read: false },
          data: { read: true },
        });
      } else if (input.id) {
        const notification = await ctx.db.notification.findUnique({ where: { id: input.id } });
        if (!notification || notification.userId !== ctx.userId) {
          throw new TRPCError({ code: 'FORBIDDEN' });
        }
        await ctx.db.notification.update({
          where: { id: input.id },
          data: { read: true },
        });
      }
      return { success: true };
    }),

  snooze: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        until: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.notification.findUnique({ where: { id: input.id } });
      if (!notification || notification.userId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ctx.db.notification.update({
        where: { id: input.id },
        data: { snoozedUntil: input.until },
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const notification = await ctx.db.notification.findUnique({ where: { id: input.id } });
      if (!notification || notification.userId !== ctx.userId) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      return ctx.db.notification.update({
        where: { id: input.id },
        data: { archivedAt: new Date() },
      });
    }),
});
