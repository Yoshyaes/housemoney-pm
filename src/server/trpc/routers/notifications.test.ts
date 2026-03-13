import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
}));

import { notificationsRouter } from './notifications';

function createMockCtx(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    db: {
      notification: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    },
    ...overrides,
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(notificationsRouter)(ctx);

describe('notificationsRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
  });

  describe('list', () => {
    it('filters unread notifications', async () => {
      const notifications = [
        { id: 'n1', read: false, archivedAt: null },
      ];
      ctx.db.notification.findMany.mockResolvedValue(notifications);

      const result = await caller(ctx).list({ filter: 'unread' });

      expect(result.notifications).toEqual(notifications);
      const callArgs = ctx.db.notification.findMany.mock.calls[0][0];
      expect(callArgs.where.read).toBe(false);
      expect(callArgs.where.archivedAt).toBeNull();
    });

    it('filters archived notifications', async () => {
      const notifications = [
        { id: 'n1', archivedAt: new Date() },
      ];
      ctx.db.notification.findMany.mockResolvedValue(notifications);

      const result = await caller(ctx).list({ filter: 'archived' });

      expect(result.notifications).toEqual(notifications);
      const callArgs = ctx.db.notification.findMany.mock.calls[0][0];
      expect(callArgs.where.archivedAt).toEqual({ not: null });
    });

    it('defaults to all non-archived notifications', async () => {
      const notifications = [
        { id: 'n1', archivedAt: null },
      ];
      ctx.db.notification.findMany.mockResolvedValue(notifications);

      const result = await caller(ctx).list({});

      expect(result.notifications).toEqual(notifications);
      const callArgs = ctx.db.notification.findMany.mock.calls[0][0];
      expect(callArgs.where.archivedAt).toBeNull();
      expect(callArgs.where.read).toBeUndefined();
    });

    it('supports cursor pagination', async () => {
      // Return 21 items to trigger nextCursor (default limit 20 + 1)
      const items = Array.from({ length: 21 }, (_, i) => ({
        id: `n${i}`,
      }));
      ctx.db.notification.findMany.mockResolvedValue([...items]);

      const result = await caller(ctx).list({});

      expect(result.notifications).toHaveLength(20);
      expect(result.nextCursor).toBe('n20');
    });
  });

  describe('unreadCount', () => {
    it('counts unread non-archived notifications with snooze check', async () => {
      ctx.db.notification.count.mockResolvedValue(5);

      const result = await caller(ctx).unreadCount();

      expect(result).toBe(5);
      const callArgs = ctx.db.notification.count.mock.calls[0][0];
      expect(callArgs.where.userId).toBe('user-1');
      expect(callArgs.where.read).toBe(false);
      expect(callArgs.where.archivedAt).toBeNull();
      expect(callArgs.where.OR).toBeDefined();
    });
  });

  describe('markRead', () => {
    it('marks a single notification as read', async () => {
      ctx.db.notification.update.mockResolvedValue({ id: 'n1', read: true });

      const result = await caller(ctx).markRead({ id: 'n1' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { read: true },
      });
    });

    it('marks all notifications as read when all=true', async () => {
      ctx.db.notification.updateMany.mockResolvedValue({ count: 3 });

      const result = await caller(ctx).markRead({ all: true });

      expect(result).toEqual({ success: true });
      expect(ctx.db.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', read: false },
        data: { read: true },
      });
    });
  });

  describe('snooze', () => {
    it('sets snoozedUntil on a notification', async () => {
      const until = new Date('2026-03-14T10:00:00Z');
      ctx.db.notification.update.mockResolvedValue({ id: 'n1', snoozedUntil: until });

      await caller(ctx).snooze({ id: 'n1', until });

      expect(ctx.db.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { snoozedUntil: until },
      });
    });
  });

  describe('archive', () => {
    it('sets archivedAt on a notification', async () => {
      ctx.db.notification.update.mockResolvedValue({ id: 'n1', archivedAt: expect.any(Date) });

      await caller(ctx).archive({ id: 'n1' });

      expect(ctx.db.notification.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { archivedAt: expect.any(Date) },
      });
    });
  });
});
