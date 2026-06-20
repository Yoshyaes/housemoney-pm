import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

const defaultMembership = { id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' as const };

const { requireWorkspaceMemberMock, requireWorkspaceAdminMock } = vi.hoisted(() => ({
  requireWorkspaceMemberMock: vi.fn(async () => ({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' })),
  requireWorkspaceAdminMock: vi.fn(async () => ({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' })),
}));

vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
  requireWorkspaceMember: requireWorkspaceMemberMock,
  requireWorkspaceAdmin: requireWorkspaceAdminMock,
  requireNonGuest: vi.fn(async () => defaultMembership),
  requireProjectAccess: vi.fn(async () => ({ membership: defaultMembership, project: { id: 'proj-1', workspaceId: 'ws-1' } })),
  getAccessibleProjectIds: vi.fn(async () => null),
}));

vi.mock('@/server/ai/agent-engine', () => ({
  applyInsightAction: vi.fn(async () => true),
  revertInsightAction: vi.fn(async () => true),
  runPeriodicAnalysis: vi.fn(async () => 3),
}));

import { agentRouter } from './agent';
import { applyInsightAction, revertInsightAction, runPeriodicAnalysis } from '@/server/ai/agent-engine';
import { TRPCError } from '@trpc/server';

function createMockCtx() {
  return {
    userId: 'user-1',
    db: {
      agentInsight: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
        count: vi.fn().mockResolvedValue(0),
      },
      agentConfig: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
      },
    },
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(agentRouter)(ctx);

describe('agentRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
    requireWorkspaceMemberMock.mockResolvedValue({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' });
    requireWorkspaceAdminMock.mockResolvedValue({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' });
    // Reset default implementations of engine mocks
    vi.mocked(applyInsightAction).mockResolvedValue(true);
    vi.mocked(revertInsightAction).mockResolvedValue(true);
    vi.mocked(runPeriodicAnalysis).mockResolvedValue(3);
  });

  describe('getInsights', () => {
    it('filters by workspaceId + current user as target', async () => {
      ctx.db.agentInsight.findMany.mockResolvedValue([]);

      await caller(ctx).getInsights({ workspaceId: 'ws-1' });

      expect(requireWorkspaceMemberMock).toHaveBeenCalledWith(ctx.db, 'ws-1', 'user-1');
      expect(ctx.db.agentInsight.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: 'ws-1',
          targetUserId: 'user-1',
          status: 'PENDING',
        }),
      }));
    });

    it('paginates with cursor and trims extra item', async () => {
      const items = Array.from({ length: 21 }, (_, i) => ({ id: `i-${i}`, task: null }));
      ctx.db.agentInsight.findMany.mockResolvedValue(items);

      const result = await caller(ctx).getInsights({ workspaceId: 'ws-1', limit: 20 });

      expect(result.insights).toHaveLength(20);
      expect(result.nextCursor).toBe('i-20');
    });

    it('returns no cursor when results fit in limit', async () => {
      const items = Array.from({ length: 5 }, (_, i) => ({ id: `i-${i}`, task: null }));
      ctx.db.agentInsight.findMany.mockResolvedValue(items);

      const result = await caller(ctx).getInsights({ workspaceId: 'ws-1', limit: 20 });
      expect(result.nextCursor).toBeUndefined();
    });

    it('respects type filter', async () => {
      await caller(ctx).getInsights({ workspaceId: 'ws-1', type: 'STALE_TASK' });
      expect(ctx.db.agentInsight.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ type: 'STALE_TASK' }),
      }));
    });

    it('respects explicit status filter', async () => {
      await caller(ctx).getInsights({ workspaceId: 'ws-1', status: 'ACCEPTED' });
      expect(ctx.db.agentInsight.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ status: 'ACCEPTED' }),
      }));
    });

    it('excludes expired insights', async () => {
      await caller(ctx).getInsights({ workspaceId: 'ws-1' });
      const args = ctx.db.agentInsight.findMany.mock.calls[0][0];
      expect(args.where.OR).toEqual([
        { expiresAt: null },
        { expiresAt: { gt: expect.any(Date) } },
      ]);
    });
  });

  describe('pendingCount', () => {
    it('counts pending insights for current user', async () => {
      ctx.db.agentInsight.count.mockResolvedValue(5);

      const result = await caller(ctx).pendingCount({ workspaceId: 'ws-1' });

      expect(result).toBe(5);
      expect(ctx.db.agentInsight.count).toHaveBeenCalledWith({
        where: {
          workspaceId: 'ws-1',
          targetUserId: 'user-1',
          status: 'PENDING',
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        },
      });
    });
  });

  describe('acceptInsight', () => {
    it('throws NOT_FOUND when insight missing', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue(null);

      await expect(caller(ctx).acceptInsight({ id: 'i-1' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws FORBIDDEN if targetUserId does not match current user', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'other-user',
      });

      await expect(caller(ctx).acceptInsight({ id: 'i-1' }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('allows when targetUserId is null (broadcast insight)', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: null,
      });

      const result = await caller(ctx).acceptInsight({ id: 'i-1' });
      expect(result).toEqual({ success: true });
    });

    it('throws BAD_REQUEST when applyInsightAction fails', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'user-1',
      });
      vi.mocked(applyInsightAction).mockResolvedValue(false);

      await expect(caller(ctx).acceptInsight({ id: 'i-1' }))
        .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('returns success when applied', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'user-1',
      });

      const result = await caller(ctx).acceptInsight({ id: 'i-1' });
      expect(result).toEqual({ success: true });
      expect(applyInsightAction).toHaveBeenCalledWith('i-1');
    });
  });

  describe('dismissInsight', () => {
    it('throws NOT_FOUND when missing', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue(null);
      await expect(caller(ctx).dismissInsight({ id: 'x' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws FORBIDDEN for other user’s insight', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'other',
      });
      await expect(caller(ctx).dismissInsight({ id: 'i-1' }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('updates status to DISMISSED', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'user-1',
      });

      const result = await caller(ctx).dismissInsight({ id: 'i-1' });

      expect(result).toEqual({ success: true });
      expect(ctx.db.agentInsight.update).toHaveBeenCalledWith({
        where: { id: 'i-1' },
        data: { status: 'DISMISSED', actedAt: expect.any(Date) },
      });
    });
  });

  describe('revertInsight', () => {
    it('throws NOT_FOUND when missing', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue(null);
      await expect(caller(ctx).revertInsight({ id: 'x' }))
        .rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('throws FORBIDDEN for other user’s insight', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'other',
      });
      await expect(caller(ctx).revertInsight({ id: 'i-1' }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('throws BAD_REQUEST when revert fails', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'user-1',
      });
      vi.mocked(revertInsightAction).mockResolvedValue(false);

      await expect(caller(ctx).revertInsight({ id: 'i-1' }))
        .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('returns success when reverted', async () => {
      ctx.db.agentInsight.findUnique.mockResolvedValue({
        id: 'i-1', workspaceId: 'ws-1', targetUserId: 'user-1',
      });

      const result = await caller(ctx).revertInsight({ id: 'i-1' });
      expect(result).toEqual({ success: true });
      expect(revertInsightAction).toHaveBeenCalledWith('i-1');
    });
  });

  describe('getConfig (admin-only)', () => {
    it('requires workspace admin', async () => {
      requireWorkspaceAdminMock.mockRejectedValueOnce(
        new TRPCError({ code: 'FORBIDDEN', message: 'admin only' })
      );

      await expect(caller(ctx).getConfig({ workspaceId: 'ws-1' }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('returns existing config', async () => {
      const cfg = { id: 'c1', workspaceId: 'ws-1', staleTaskDays: 7 };
      ctx.db.agentConfig.findUnique.mockResolvedValue(cfg);

      const result = await caller(ctx).getConfig({ workspaceId: 'ws-1' });
      expect(result).toEqual(cfg);
    });

    it('creates config on first call when missing', async () => {
      const cfg = { id: 'c1', workspaceId: 'ws-1' };
      ctx.db.agentConfig.findUnique.mockResolvedValue(null);
      ctx.db.agentConfig.create.mockResolvedValue(cfg);

      const result = await caller(ctx).getConfig({ workspaceId: 'ws-1' });
      expect(ctx.db.agentConfig.create).toHaveBeenCalledWith({
        data: { workspaceId: 'ws-1' },
      });
      expect(result).toEqual(cfg);
    });
  });

  describe('updateConfig (admin-only)', () => {
    it('requires workspace admin', async () => {
      requireWorkspaceAdminMock.mockRejectedValueOnce(
        new TRPCError({ code: 'FORBIDDEN', message: 'admin only' })
      );

      await expect(caller(ctx).updateConfig({ workspaceId: 'ws-1', staleTaskDays: 7 }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('upserts config with provided fields', async () => {
      ctx.db.agentConfig.upsert.mockResolvedValue({ id: 'c1' });

      await caller(ctx).updateConfig({
        workspaceId: 'ws-1',
        staleTaskDays: 10,
        autoUnblock: true,
      });

      expect(ctx.db.agentConfig.upsert).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        create: { workspaceId: 'ws-1', staleTaskDays: 10, autoUnblock: true },
        update: { staleTaskDays: 10, autoUnblock: true },
      });
    });

    it('validates staleTaskDays bounds', async () => {
      await expect(caller(ctx).updateConfig({ workspaceId: 'ws-1', staleTaskDays: 0 }))
        .rejects.toThrow();
      await expect(caller(ctx).updateConfig({ workspaceId: 'ws-1', staleTaskDays: 31 }))
        .rejects.toThrow();
    });

    it('validates digestHourUtc range', async () => {
      await expect(caller(ctx).updateConfig({ workspaceId: 'ws-1', digestHourUtc: 24 }))
        .rejects.toThrow();
      await expect(caller(ctx).updateConfig({ workspaceId: 'ws-1', digestHourUtc: -1 }))
        .rejects.toThrow();
    });
  });

  describe('runAnalysis (admin-only)', () => {
    it('requires admin', async () => {
      requireWorkspaceAdminMock.mockRejectedValueOnce(
        new TRPCError({ code: 'FORBIDDEN', message: 'admin only' })
      );

      await expect(caller(ctx).runAnalysis({ workspaceId: 'ws-1', schedule: '15min' }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('invokes runPeriodicAnalysis and returns insights created', async () => {
      vi.mocked(runPeriodicAnalysis).mockResolvedValue(7);

      const result = await caller(ctx).runAnalysis({ workspaceId: 'ws-1', schedule: 'daily' });

      expect(runPeriodicAnalysis).toHaveBeenCalledWith('ws-1', 'daily');
      expect(result).toEqual({ insightsCreated: 7 });
    });

    it('validates schedule enum', async () => {
      // @ts-expect-error testing invalid schedule
      await expect(caller(ctx).runAnalysis({ workspaceId: 'ws-1', schedule: 'monthly' }))
        .rejects.toThrow();
    });
  });
});
