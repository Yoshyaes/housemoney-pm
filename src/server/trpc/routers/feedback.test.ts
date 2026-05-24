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
import { feedbackRouter } from '@/server/trpc/routers/feedback';
import {
  requireWorkspaceMember,
  getAccessibleProjectIds,
} from '@/server/trpc/trpc';

const appRouter = mockRouter({ feedback: feedbackRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('feedback router', () => {
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
    it('lists items ordered by createdAt desc', async () => {
      const items = [{ id: 'f-1', workspaceId: 'ws-1' }];
      db.feedback.findMany.mockResolvedValue(items);

      const result = await caller.feedback.list({ workspaceId: 'ws-1' });

      expect(db.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: [{ createdAt: 'desc' }],
          take: 31,
        })
      );
      expect(result).toEqual({ items, nextCursor: null });
    });

    it('filters by status, type, priority, assigneeId', async () => {
      db.feedback.findMany.mockResolvedValue([]);
      await caller.feedback.list({
        workspaceId: 'ws-1',
        status: 'OPEN' as any,
        type: 'BUG' as any,
        priority: 'HIGH' as any,
        assigneeId: 'user-2',
      });
      expect(db.feedback.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'OPEN',
            type: 'BUG',
            priority: 'HIGH',
            assigneeId: 'user-2',
          }),
        })
      );
    });

    it('search adds AND with OR clause', async () => {
      db.feedback.findMany.mockResolvedValue([]);
      await caller.feedback.list({ workspaceId: 'ws-1', search: ' login ' });
      const call = db.feedback.findMany.mock.calls[0][0];
      expect(call.where.AND[0].OR).toEqual([
        { title: { contains: 'login', mode: 'insensitive' } },
        { description: { contains: 'login', mode: 'insensitive' } },
        { identifier: { contains: 'login', mode: 'insensitive' } },
      ]);
    });

    it('GUEST scopes to accessible projects OR null projectId', async () => {
      (getAccessibleProjectIds as any).mockResolvedValueOnce(['proj-a']);
      db.feedback.findMany.mockResolvedValue([]);
      await caller.feedback.list({ workspaceId: 'ws-1' });
      expect(db.feedback.findMany).toHaveBeenCalledWith(
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
        caller.feedback.list({ workspaceId: 'ws-1', projectId: 'proj-b' })
      ).rejects.toThrow(/No access to this project/);
    });

    it('returns nextCursor when more items than limit', async () => {
      const many = Array.from({ length: 31 }, (_, i) => ({ id: `f-${i}` }));
      db.feedback.findMany.mockResolvedValue(many);
      const result = await caller.feedback.list({ workspaceId: 'ws-1' });
      expect(result.items).toHaveLength(30);
      expect(result.nextCursor).toBe('f-30');
    });
  });

  describe('get', () => {
    it('returns feedback', async () => {
      const fb = { id: 'f-1', workspaceId: 'ws-1', projectId: 'proj-1' };
      db.feedback.findUnique.mockResolvedValue(fb);
      const result = await caller.feedback.get({ id: 'f-1' });
      expect(result).toEqual(fb);
    });

    it('throws NOT_FOUND when missing', async () => {
      db.feedback.findUnique.mockResolvedValue(null);
      await expect(caller.feedback.get({ id: 'f-x' })).rejects.toThrow(/Feedback not found/);
    });

    it('GUEST without project on feedback is forbidden', async () => {
      db.feedback.findUnique.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.feedback.get({ id: 'f-1' })).rejects.toThrow(/No access to this feedback/);
    });
  });

  describe('create', () => {
    it('creates with auto identifier from workspace counter', async () => {
      db.workspace.update.mockResolvedValue({ id: 'ws-1', feedbackCounter: 12 });
      db.feedback.create.mockResolvedValue({ id: 'f-new', identifier: 'FB-012' });

      const result = await caller.feedback.create({
        workspaceId: 'ws-1',
        title: 'Bug',
      });

      expect(db.workspace.update).toHaveBeenCalledWith({
        where: { id: 'ws-1' },
        data: { feedbackCounter: { increment: 1 } },
      });
      expect(db.feedback.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            identifier: 'FB-012',
            createdById: 'user-1',
            title: 'Bug',
          }),
        })
      );
      expect(result.identifier).toBe('FB-012');
    });

    it('GUEST cannot create feedback', async () => {
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(
        caller.feedback.create({ workspaceId: 'ws-1', title: 'X' })
      ).rejects.toThrow(/Guests cannot submit feedback/);
    });

    it('rejects empty title', async () => {
      await expect(caller.feedback.create({ workspaceId: 'ws-1', title: '' })).rejects.toThrow();
    });

    it('rejects title over 500 chars', async () => {
      await expect(
        caller.feedback.create({ workspaceId: 'ws-1', title: 'x'.repeat(501) })
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('lets creator update', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({
        id: 'f-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      const updated = { id: 'f-1', title: 'Updated' };
      db.feedback.update.mockResolvedValue(updated);
      const result = await caller.feedback.update({ id: 'f-1', title: 'Updated' });
      expect(result).toEqual(updated);
    });

    it('lets ADMIN update non-owned', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({
        id: 'f-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      db.feedback.update.mockResolvedValue({});
      await caller.feedback.update({ id: 'f-1', title: 'X' });
      expect(db.feedback.update).toHaveBeenCalled();
    });

    it('forbids non-creator non-admin', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({
        id: 'f-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.feedback.update({ id: 'f-1', title: 'X' })).rejects.toThrow(/Only the creator or an admin/);
    });
  });

  describe('delete', () => {
    it('lets creator delete', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({
        id: 'f-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.feedback.delete.mockResolvedValue({});
      await caller.feedback.delete({ id: 'f-1' });
      expect(db.feedback.delete).toHaveBeenCalledWith({ where: { id: 'f-1' } });
    });

    it('forbids non-creator non-admin', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({
        id: 'f-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.feedback.delete({ id: 'f-1' })).rejects.toThrow(/Only the creator or an admin/);
    });

    it('lets ADMIN delete any', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({
        id: 'f-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      db.feedback.delete.mockResolvedValue({});
      await caller.feedback.delete({ id: 'f-1' });
      expect(db.feedback.delete).toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('returns byStatus and totalCount', async () => {
      db.feedback.groupBy.mockResolvedValue([
        { status: 'OPEN', _count: 4 },
        { status: 'RESOLVED', _count: 1 },
      ]);
      db.feedback.count.mockResolvedValue(5);

      const result = await caller.feedback.getStats({ workspaceId: 'ws-1' });

      expect(result).toEqual({
        byStatus: { OPEN: 4, RESOLVED: 1 },
        totalCount: 5,
      });
    });
  });
});
