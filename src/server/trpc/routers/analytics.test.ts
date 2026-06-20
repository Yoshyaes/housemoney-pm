import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

const defaultMembership = { id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' as const };

const { requireNonGuestMock } = vi.hoisted(() => ({
  requireNonGuestMock: vi.fn(async () => ({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' })),
}));

vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
  requireWorkspaceMember: vi.fn(async () => defaultMembership),
  requireWorkspaceAdmin: vi.fn(async () => defaultMembership),
  requireNonGuest: requireNonGuestMock,
  requireProjectAccess: vi.fn(async () => ({ membership: defaultMembership, project: { id: 'proj-1', workspaceId: 'ws-1' } })),
  getAccessibleProjectIds: vi.fn(async () => null),
}));

import { analyticsRouter } from './analytics';
import { TRPCError } from '@trpc/server';

function createMockCtx() {
  return {
    userId: 'user-1',
    db: {
      task: {
        count: vi.fn().mockResolvedValue(0),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      project: {
        findUnique: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      $queryRaw: vi.fn().mockResolvedValue([]),
    },
  };
}

const caller = (ctx: ReturnType<typeof createMockCtx>) =>
  tTest.createCallerFactory(analyticsRouter)(ctx);

describe('analyticsRouter', () => {
  let ctx: ReturnType<typeof createMockCtx>;

  beforeEach(() => {
    ctx = createMockCtx();
    vi.clearAllMocks();
    requireNonGuestMock.mockResolvedValue({ id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' });
  });

  // ─── projectId validation (security) ────────────────────

  describe('cross-workspace projectId is rejected', () => {
    it('summary throws FORBIDDEN when projectId belongs to a different workspace', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'OTHER-ws' });

      await expect(
        caller(ctx).summary({ workspaceId: 'ws-1', projectId: 'foreign-proj' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('summary throws FORBIDDEN when projectId does not exist', async () => {
      ctx.db.project.findUnique.mockResolvedValue(null);

      await expect(
        caller(ctx).summary({ workspaceId: 'ws-1', projectId: 'missing' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('summary does NOT call project.findUnique when projectId is absent', async () => {
      await caller(ctx).summary({ workspaceId: 'ws-1' });
      expect(ctx.db.project.findUnique).not.toHaveBeenCalled();
    });

    it('summary proceeds when projectId belongs to the correct workspace', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });

      const result = await caller(ctx).summary({ workspaceId: 'ws-1', projectId: 'proj-1' });
      expect(result).toEqual({ completed: 0, overdue: 0, blocked: 0, open: 0 });
    });

    it('throughput throws FORBIDDEN for foreign project', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'other' });
      await expect(
        caller(ctx).throughput({ workspaceId: 'ws-1', projectId: 'foreign' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('cycleTime throws FORBIDDEN for foreign project', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'other' });
      await expect(
        caller(ctx).cycleTime({ workspaceId: 'ws-1', projectId: 'foreign' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('statusDistribution throws FORBIDDEN for foreign project', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'other' });
      await expect(
        caller(ctx).statusDistribution({ workspaceId: 'ws-1', projectId: 'foreign' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('priorityDistribution throws FORBIDDEN for foreign project', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'other' });
      await expect(
        caller(ctx).priorityDistribution({ workspaceId: 'ws-1', projectId: 'foreign' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('workloadByAssignee throws FORBIDDEN for foreign project', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'other' });
      await expect(
        caller(ctx).workloadByAssignee({ workspaceId: 'ws-1', projectId: 'foreign' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('cumulativeFlow throws FORBIDDEN for foreign project', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'other' });
      await expect(
        caller(ctx).cumulativeFlow({ workspaceId: 'ws-1', projectId: 'foreign' })
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── Guest access ─────────────────────────────────────────

  describe('guest rejection', () => {
    it('rejects guests on summary', async () => {
      requireNonGuestMock.mockRejectedValueOnce(
        new TRPCError({ code: 'FORBIDDEN', message: 'guests' })
      );
      await expect(caller(ctx).summary({ workspaceId: 'ws-1' }))
        .rejects.toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  // ─── summary aggregation ──────────────────────────────────

  describe('summary', () => {
    it('returns counts for completed/overdue/blocked/open', async () => {
      ctx.db.task.count
        .mockResolvedValueOnce(5)  // completed
        .mockResolvedValueOnce(3)  // overdue
        .mockResolvedValueOnce(2)  // blocked
        .mockResolvedValueOnce(10); // open

      const result = await caller(ctx).summary({ workspaceId: 'ws-1' });
      expect(result).toEqual({ completed: 5, overdue: 3, blocked: 2, open: 10 });
    });

    it('applies projectId filter when provided', async () => {
      ctx.db.project.findUnique.mockResolvedValue({ workspaceId: 'ws-1' });
      ctx.db.task.count.mockResolvedValue(0);

      await caller(ctx).summary({ workspaceId: 'ws-1', projectId: 'proj-1' });

      const firstCall = ctx.db.task.count.mock.calls[0][0];
      expect(firstCall.where.projectId).toBe('proj-1');
    });

    it('applies date range filter for completed count', async () => {
      ctx.db.task.count.mockResolvedValue(0);

      await caller(ctx).summary({ workspaceId: 'ws-1', dateRange: '7d' });

      const firstCall = ctx.db.task.count.mock.calls[0][0];
      expect(firstCall.where.updatedAt).toEqual({ gte: expect.any(Date) });
    });

    it('no date range filter when dateRange=all', async () => {
      ctx.db.task.count.mockResolvedValue(0);

      await caller(ctx).summary({ workspaceId: 'ws-1', dateRange: 'all' });

      const firstCall = ctx.db.task.count.mock.calls[0][0];
      expect(firstCall.where.updatedAt).toBeUndefined();
    });
  });

  // ─── cycleTime math ───────────────────────────────────────

  describe('cycleTime', () => {
    it('returns null median/avg when no data', async () => {
      ctx.db.$queryRaw.mockResolvedValue([]);

      const result = await caller(ctx).cycleTime({ workspaceId: 'ws-1' });

      expect(result.medianHours).toBeNull();
      expect(result.avgHours).toBeNull();
      expect(result.tasks).toEqual([]);
      expect(result.histogram).toHaveLength(5);
    });

    it('computes median and avg from cycle hours', async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { taskId: 't1', identifier: 'HM-1', title: 't1', startedAt: new Date(), completedAt: new Date(), cycleHours: 10 },
        { taskId: 't2', identifier: 'HM-2', title: 't2', startedAt: new Date(), completedAt: new Date(), cycleHours: 30 },
        { taskId: 't3', identifier: 'HM-3', title: 't3', startedAt: new Date(), completedAt: new Date(), cycleHours: 50 },
      ]);

      const result = await caller(ctx).cycleTime({ workspaceId: 'ws-1' });

      expect(result.medianHours).toBe(30);
      expect(result.avgHours).toBe(30);
    });

    it('buckets hours into histogram correctly', async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { taskId: 'a', identifier: 'HM-1', title: 'a', startedAt: new Date(), completedAt: new Date(), cycleHours: 12 },  // <1d
        { taskId: 'b', identifier: 'HM-2', title: 'b', startedAt: new Date(), completedAt: new Date(), cycleHours: 48 },  // 1-3d
        { taskId: 'c', identifier: 'HM-3', title: 'c', startedAt: new Date(), completedAt: new Date(), cycleHours: 120 }, // 3-7d
        { taskId: 'd', identifier: 'HM-4', title: 'd', startedAt: new Date(), completedAt: new Date(), cycleHours: 250 }, // 1-2w
        { taskId: 'e', identifier: 'HM-5', title: 'e', startedAt: new Date(), completedAt: new Date(), cycleHours: 400 }, // >2w
      ]);

      const result = await caller(ctx).cycleTime({ workspaceId: 'ws-1' });

      expect(result.histogram).toEqual([
        { label: '< 1d', count: 1 },
        { label: '1–3d', count: 1 },
        { label: '3–7d', count: 1 },
        { label: '1–2w', count: 1 },
        { label: '> 2w', count: 1 },
      ]);
    });

    it('limits returned tasks to 20', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        taskId: `t${i}`, identifier: `HM-${i}`, title: `t${i}`,
        startedAt: new Date(), completedAt: new Date(), cycleHours: i + 1,
      }));
      ctx.db.$queryRaw.mockResolvedValue(rows);

      const result = await caller(ctx).cycleTime({ workspaceId: 'ws-1' });
      expect(result.tasks).toHaveLength(20);
    });
  });

  // ─── statusDistribution ───────────────────────────────────

  describe('statusDistribution', () => {
    it('returns grouped status counts', async () => {
      ctx.db.task.groupBy.mockResolvedValue([
        { status: 'TODO', _count: { _all: 5 } },
        { status: 'DONE', _count: { _all: 12 } },
      ]);

      const result = await caller(ctx).statusDistribution({ workspaceId: 'ws-1' });

      expect(result).toEqual([
        { status: 'TODO', count: 5 },
        { status: 'DONE', count: 12 },
      ]);
    });
  });

  // ─── priorityDistribution ─────────────────────────────────

  describe('priorityDistribution', () => {
    it('excludes DONE/CANCELLED from priority counts', async () => {
      ctx.db.task.groupBy.mockResolvedValue([
        { priority: 'HIGH', _count: { _all: 3 } },
      ]);

      const result = await caller(ctx).priorityDistribution({ workspaceId: 'ws-1' });

      expect(result).toEqual([{ priority: 'HIGH', count: 3 }]);
      const args = ctx.db.task.groupBy.mock.calls[0][0];
      expect(args.where.status).toEqual({ notIn: ['DONE', 'CANCELLED'] });
    });
  });

  // ─── workloadByAssignee ───────────────────────────────────

  describe('workloadByAssignee', () => {
    it('groups by user with status counts', async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { userId: 'u1', name: 'Alice', avatarColor: '#fff', status: 'TODO', count: BigInt(2) },
        { userId: 'u1', name: 'Alice', avatarColor: '#fff', status: 'IN_PROGRESS', count: BigInt(3) },
        { userId: 'u2', name: 'Bob', avatarColor: null, status: 'BACKLOG', count: BigInt(1) },
      ]);

      const result = await caller(ctx).workloadByAssignee({ workspaceId: 'ws-1' });

      expect(result).toEqual([
        { userId: 'u1', name: 'Alice', avatarColor: '#fff', BACKLOG: 0, TODO: 2, IN_PROGRESS: 3, IN_REVIEW: 0, total: 5 },
        { userId: 'u2', name: 'Bob', avatarColor: null, BACKLOG: 1, TODO: 0, IN_PROGRESS: 0, IN_REVIEW: 0, total: 1 },
      ]);
    });

    it('sorts by total descending', async () => {
      ctx.db.$queryRaw.mockResolvedValue([
        { userId: 'u1', name: 'A', avatarColor: null, status: 'TODO', count: BigInt(1) },
        { userId: 'u2', name: 'B', avatarColor: null, status: 'TODO', count: BigInt(10) },
      ]);

      const result = await caller(ctx).workloadByAssignee({ workspaceId: 'ws-1' });
      expect(result[0].userId).toBe('u2');
      expect(result[1].userId).toBe('u1');
    });
  });

  // ─── projectHealth ────────────────────────────────────────

  describe('projectHealth', () => {
    it('returns aggregated health per project', async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 86400_000);
      ctx.db.project.findMany.mockResolvedValue([
        {
          id: 'p1', name: 'P1', color: '#fff', status: 'ACTIVE', targetDate: null,
          tasks: [
            { id: 't1', status: 'DONE', dueDate: null, blockedBy: [] },
            { id: 't2', status: 'TODO', dueDate: past, blockedBy: [] },
            { id: 't3', status: 'IN_PROGRESS', dueDate: null, blockedBy: [{ id: 'b1' }] },
            { id: 't4', status: 'CANCELLED', dueDate: null, blockedBy: [] },
          ],
        },
      ]);

      const result = await caller(ctx).projectHealth({ workspaceId: 'ws-1' });

      expect(result).toEqual([
        expect.objectContaining({
          projectId: 'p1',
          total: 4,
          done: 1,
          open: 2,       // total - done - cancelled
          overdue: 1,
          blocked: 1,
          progress: 25,  // 1/4 = 25%
        }),
      ]);
    });

    it('returns empty when no projects', async () => {
      ctx.db.project.findMany.mockResolvedValue([]);
      expect(await caller(ctx).projectHealth({ workspaceId: 'ws-1' })).toEqual([]);
    });

    it('progress is 0 when project has no tasks', async () => {
      ctx.db.project.findMany.mockResolvedValue([{
        id: 'p1', name: 'P1', color: null, status: 'ACTIVE', targetDate: null, tasks: [],
      }]);
      const result = await caller(ctx).projectHealth({ workspaceId: 'ws-1' });
      expect(result[0].progress).toBe(0);
    });

    it('does not call project.findUnique (no projectId on input schema)', async () => {
      ctx.db.project.findMany.mockResolvedValue([]);

      await caller(ctx).projectHealth({ workspaceId: 'ws-1' });

      // projectHealth input schema doesn't have projectId, so no per-project scope check
      expect(ctx.db.project.findUnique).not.toHaveBeenCalled();
    });
  });
});
