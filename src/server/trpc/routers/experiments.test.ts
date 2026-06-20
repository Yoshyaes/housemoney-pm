import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockRouter, mockProcedure, tTest } = vi.hoisted(() => {
  const { initTRPC } = require('@trpc/server');
  const superjson = require('superjson');
  const t = initTRPC.context().create({ transformer: superjson });
  return { mockRouter: t.router, mockProcedure: t.procedure, tTest: t };
});

const defaultMembership = { id: 'm-1', workspaceId: 'ws-1', userId: 'user-1', role: 'ADMIN' as const };
vi.mock('@/server/trpc/trpc', () => ({
  router: mockRouter,
  publicProcedure: mockProcedure,
  protectedProcedure: mockProcedure,
  requireWorkspaceMember: vi.fn(async () => defaultMembership),
  requireWorkspaceAdmin: vi.fn(async () => defaultMembership),
  requireNonGuest: vi.fn(async () => defaultMembership),
  requireProjectAccess: vi.fn(async () => ({ membership: defaultMembership, project: { id: 'proj-1', workspaceId: 'ws-1' } })),
  getAccessibleProjectIds: vi.fn(async () => null),
}));

import { TRPCError } from '@trpc/server';
import { createMockPrisma, type MockPrisma } from '@/test/helpers/mock-prisma';
import { testUser } from '@/test/helpers/fixtures';
import { experimentsRouter } from '@/server/trpc/routers/experiments';
import {
  requireWorkspaceMember,
  getAccessibleProjectIds,
} from '@/server/trpc/trpc';

const appRouter = mockRouter({ experiments: experimentsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('experiments router', () => {
  let db: MockPrisma;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockPrisma();
    (getAccessibleProjectIds as any).mockResolvedValue(null);
    (db.$transaction as any).mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(db);
      return Promise.all(fn);
    });
    caller = createCaller({
      db: db as any,
      user: testUser as any,
      userId: testUser.id,
    });
  });

  describe('list', () => {
    it('lists experiments and replaces hypothesis with preview', async () => {
      db.experiment.findMany.mockResolvedValue([
        { id: 'e-1', workspaceId: 'ws-1', hypothesis: 'x'.repeat(300), createdAt: new Date() },
      ]);

      const result = await caller.experiments.list({ workspaceId: 'ws-1' });

      expect(result.items[0].hypothesisPreview).toHaveLength(200);
      expect(result.items[0].hypothesis).toBeUndefined();
      expect(result.nextCursor).toBeNull();
    });

    it('filters by minScore', async () => {
      db.experiment.findMany.mockResolvedValue([]);
      await caller.experiments.list({ workspaceId: 'ws-1', minScore: 5 });
      expect(db.experiment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ score: { gte: 5 } }),
        })
      );
    });

    it('search uses AND with OR clause on title/hypothesis/identifier', async () => {
      db.experiment.findMany.mockResolvedValue([]);
      await caller.experiments.list({ workspaceId: 'ws-1', search: '  pricing  ' });
      const call = db.experiment.findMany.mock.calls[0][0];
      expect(call.where.AND[0].OR).toEqual([
        { title: { contains: 'pricing', mode: 'insensitive' } },
        { hypothesis: { contains: 'pricing', mode: 'insensitive' } },
        { identifier: { contains: 'pricing', mode: 'insensitive' } },
      ]);
    });

    it('GUEST scopes to accessible projects OR null projectId', async () => {
      (getAccessibleProjectIds as any).mockResolvedValueOnce(['proj-a']);
      db.experiment.findMany.mockResolvedValue([]);
      await caller.experiments.list({ workspaceId: 'ws-1' });
      expect(db.experiment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ projectId: { in: ['proj-a'] } }, { projectId: null }],
          }),
        })
      );
    });

    it('GUEST requesting non-accessible projectId is forbidden', async () => {
      (getAccessibleProjectIds as any).mockResolvedValueOnce(['proj-a']);
      await expect(
        caller.experiments.list({ workspaceId: 'ws-1', projectId: 'proj-b' })
      ).rejects.toThrow(/No access to this project/);
    });

    it('returns nextCursor when more items than limit', async () => {
      const many = Array.from({ length: 31 }, (_, i) => ({
        id: `e-${i}`, workspaceId: 'ws-1', hypothesis: '', createdAt: new Date(),
      }));
      db.experiment.findMany.mockResolvedValue(many);
      const result = await caller.experiments.list({ workspaceId: 'ws-1' });
      expect(result.items).toHaveLength(30);
      expect(result.nextCursor).toBe('e-30');
    });
  });

  describe('get', () => {
    it('returns experiment with includes', async () => {
      const exp = { id: 'e-1', workspaceId: 'ws-1', projectId: 'proj-1' };
      db.experiment.findUnique.mockResolvedValue(exp);
      const result = await caller.experiments.get({ id: 'e-1' });
      expect(result).toEqual(exp);
    });

    it('throws NOT_FOUND when missing', async () => {
      db.experiment.findUnique.mockResolvedValue(null);
      await expect(caller.experiments.get({ id: 'e-x' })).rejects.toThrow(/Experiment not found/);
    });

    it('GUEST without project on experiment is forbidden', async () => {
      db.experiment.findUnique.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.experiments.get({ id: 'e-1' })).rejects.toThrow(/No access to this experiment/);
    });
  });

  describe('create', () => {
    it('creates with auto identifier from workspace counter', async () => {
      db.workspace.update.mockResolvedValue({ id: 'ws-1', experimentCounter: 7 });
      db.experiment.create.mockResolvedValue({ id: 'e-new', identifier: 'EXP-007' });

      const result = await caller.experiments.create({
        workspaceId: 'ws-1',
        title: 'Test pricing',
      });

      expect(db.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { experimentCounter: { increment: 1 } },
      });
      expect(db.experiment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: 'EXP-007',
            createdById: 'user-1',
            title: 'Test pricing',
            score: 0,
          }),
        })
      );
      expect(result.identifier).toBe('EXP-007');
    });

    it('computes score from scoring criteria booleans', async () => {
      db.workspace.update.mockResolvedValue({ id: 'ws-1', experimentCounter: 1 });
      db.experiment.create.mockResolvedValue({ id: 'e-new' });

      await caller.experiments.create({
        workspaceId: 'ws-1',
        title: 'X',
        scoringCriteria: { fitness: true, urgency: true, impact: false },
      });

      expect(db.experiment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ score: 2 }),
        })
      );
    });

    it('GUEST cannot create', async () => {
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(
        caller.experiments.create({ workspaceId: 'ws-1', title: 'X' })
      ).rejects.toThrow(/Guests cannot create experiments/);
    });

    it('rejects empty title', async () => {
      await expect(caller.experiments.create({ workspaceId: 'ws-1', title: '' })).rejects.toThrow();
    });

    it('rejects title over 500 chars', async () => {
      await expect(
        caller.experiments.create({ workspaceId: 'ws-1', title: 'x'.repeat(501) })
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('lets creator update and recomputes score on criteria change', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({
        id: 'e-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.experiment.update.mockResolvedValue({ id: 'e-1' });

      await caller.experiments.update({
        id: 'e-1',
        scoringCriteria: { a: true, b: true, c: true },
      });

      expect(db.experiment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'e-1' },
          data: expect.objectContaining({ score: 3 }),
        })
      );
    });

    it('lets ADMIN update non-owned', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({
        id: 'e-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      db.experiment.update.mockResolvedValue({});
      await caller.experiments.update({ id: 'e-1', title: 'X' });
      expect(db.experiment.update).toHaveBeenCalled();
    });

    it('forbids non-creator non-admin', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({
        id: 'e-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.experiments.update({ id: 'e-1', title: 'X' })).rejects.toThrow(/Only the creator or an admin/);
    });

    it('does not include score when criteria not provided', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({
        id: 'e-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.experiment.update.mockResolvedValue({});
      await caller.experiments.update({ id: 'e-1', title: 'Just title' });
      const call = db.experiment.update.mock.calls[0][0];
      expect(call.data.score).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('lets creator delete', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({
        id: 'e-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.experiment.delete.mockResolvedValue({});
      await caller.experiments.delete({ id: 'e-1' });
      expect(db.experiment.delete).toHaveBeenCalledWith({ where: { id: 'e-1' } });
    });

    it('forbids non-creator non-admin', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({
        id: 'e-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.experiments.delete({ id: 'e-1' })).rejects.toThrow(/Only the creator or an admin/);
    });

    it('lets ADMIN delete any', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({
        id: 'e-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      db.experiment.delete.mockResolvedValue({});
      await caller.experiments.delete({ id: 'e-1' });
      expect(db.experiment.delete).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns byStatus, avgScore, totalCount', async () => {
      db.experiment.groupBy.mockResolvedValue([
        { status: 'BACKLOG', _count: 2 },
        { status: 'RUNNING', _count: 3 },
      ]);
      db.experiment.aggregate.mockResolvedValue({ _avg: { score: 4.5 } });
      db.experiment.count.mockResolvedValue(5);

      const result = await caller.experiments.getStats({ workspaceId: 'ws-1' });

      expect(result).toEqual({
        byStatus: { BACKLOG: 2, RUNNING: 3 },
        avgScore: 4.5,
        totalCount: 5,
      });
    });

    it('returns avgScore 0 when no scored experiments', async () => {
      db.experiment.groupBy.mockResolvedValue([]);
      db.experiment.aggregate.mockResolvedValue({ _avg: { score: null } });
      db.experiment.count.mockResolvedValue(0);

      const result = await caller.experiments.getStats({ workspaceId: 'ws-1' });

      expect(result.avgScore).toBe(0);
      expect(result.totalCount).toBe(0);
    });
  });
});
