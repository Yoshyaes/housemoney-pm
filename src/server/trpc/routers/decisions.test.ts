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
import { decisionsRouter } from '@/server/trpc/routers/decisions';
import {
  requireWorkspaceMember,
  getAccessibleProjectIds,
} from '@/server/trpc/trpc';

const appRouter = mockRouter({ decisions: decisionsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('decisions router', () => {
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
    it('lists decisions and replaces body with preview', async () => {
      db.decision.findMany.mockResolvedValue([
        { id: 'd-1', workspaceId: 'ws-1', body: 'x'.repeat(500), decisionDate: new Date(), createdAt: new Date() },
      ]);

      const result = await caller.decisions.list({ workspaceId: 'ws-1' });

      expect(result.items[0].bodyPreview).toHaveLength(200);
      expect(result.items[0].body).toBeUndefined();
      expect(result.nextCursor).toBeNull();
    });

    it('filters by status, category, participantId', async () => {
      db.decision.findMany.mockResolvedValue([]);
      await caller.decisions.list({
        workspaceId: 'ws-1',
        status: 'ACTIVE' as any,
        category: 'Architecture',
        participantId: 'user-2',
      });
      expect(db.decision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'ACTIVE',
            category: 'Architecture',
            participants: { some: { userId: 'user-2' } },
          }),
        })
      );
    });

    it('search trims and adds OR clause on title/body', async () => {
      db.decision.findMany.mockResolvedValue([]);
      await caller.decisions.list({ workspaceId: 'ws-1', search: '  hello  ' });
      expect(db.decision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { title: { contains: 'hello', mode: 'insensitive' } },
              { body: { contains: 'hello', mode: 'insensitive' } },
            ],
          }),
        })
      );
    });

    it('GUEST scopes by accessible projectIds', async () => {
      (getAccessibleProjectIds as any).mockResolvedValueOnce(['proj-a']);
      db.decision.findMany.mockResolvedValue([]);
      await caller.decisions.list({ workspaceId: 'ws-1' });
      expect(db.decision.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: { in: ['proj-a'] } }),
        })
      );
    });

    it('GUEST requesting non-accessible projectId is forbidden', async () => {
      (getAccessibleProjectIds as any).mockResolvedValueOnce(['proj-a']);
      await expect(
        caller.decisions.list({ workspaceId: 'ws-1', projectId: 'proj-b' })
      ).rejects.toThrow(/No access to this project/);
    });

    it('returns nextCursor when more items than limit', async () => {
      const many = Array.from({ length: 31 }, (_, i) => ({
        id: `d-${i}`,
        workspaceId: 'ws-1',
        body: '',
        decisionDate: new Date(),
        createdAt: new Date(),
      }));
      db.decision.findMany.mockResolvedValue(many);
      const result = await caller.decisions.list({ workspaceId: 'ws-1' });
      expect(result.items).toHaveLength(30);
      expect(result.nextCursor).toBe('d-30');
    });
  });

  describe('get', () => {
    it('returns decision with includes', async () => {
      const decision = { id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1' };
      db.decision.findUnique.mockResolvedValue(decision);
      const result = await caller.decisions.get({ id: 'd-1' });
      expect(result).toEqual(decision);
    });

    it('throws NOT_FOUND when missing', async () => {
      db.decision.findUnique.mockResolvedValue(null);
      await expect(caller.decisions.get({ id: 'd-x' })).rejects.toThrow(/Decision not found/);
    });

    it('GUEST without project on decision is forbidden', async () => {
      db.decision.findUnique.mockResolvedValue({ id: 'd-1', workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.decisions.get({ id: 'd-1' })).rejects.toThrow(/No access to this decision/);
    });
  });

  describe('create', () => {
    it('creates a decision with creator as participant', async () => {
      const created = { id: 'd-new', workspaceId: 'ws-1', title: 'X' };
      db.decision.create.mockResolvedValue(created);

      const result = await caller.decisions.create({
        workspaceId: 'ws-1',
        title: 'X',
      });

      expect(db.decision.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            title: 'X',
            createdById: 'user-1',
            participants: { createMany: { data: [{ userId: 'user-1' }] } },
          }),
        })
      );
      expect(result).toEqual(created);
    });

    it('always adds creator to participants (dedupes)', async () => {
      db.decision.create.mockResolvedValue({ id: 'd-new' });
      await caller.decisions.create({
        workspaceId: 'ws-1',
        title: 'X',
        participantIds: ['user-2', 'user-1'],
      });
      const call = db.decision.create.mock.calls[0][0];
      const participantUserIds = call.data.participants.createMany.data.map((p: any) => p.userId);
      expect(participantUserIds.sort()).toEqual(['user-1', 'user-2']);
    });

    it('GUEST cannot create decision', async () => {
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(
        caller.decisions.create({ workspaceId: 'ws-1', title: 'X' })
      ).rejects.toThrow(/Guests cannot create decisions/);
    });

    it('rejects empty title', async () => {
      await expect(
        caller.decisions.create({ workspaceId: 'ws-1', title: '' })
      ).rejects.toThrow();
    });

    it('rejects title over 500 chars', async () => {
      await expect(
        caller.decisions.create({ workspaceId: 'ws-1', title: 'x'.repeat(501) })
      ).rejects.toThrow();
    });

    it('rejects body over 100000 chars', async () => {
      await expect(
        caller.decisions.create({ workspaceId: 'ws-1', title: 'X', body: 'a'.repeat(100001) })
      ).rejects.toThrow();
    });

    it('marks targets as SUPERSEDED when supersedesIds provided', async () => {
      db.decision.create.mockResolvedValue({ id: 'd-new', workspaceId: 'ws-1' });
      db.decision.findMany.mockResolvedValue([
        { id: 'd-old', status: 'ACTIVE', supersededById: null },
      ]);
      db.decision.updateMany.mockResolvedValue({ count: 1 });

      await caller.decisions.create({
        workspaceId: 'ws-1',
        title: 'New',
        supersedesIds: ['d-old'],
      });

      expect(db.decision.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['d-old'] } },
        data: { supersededById: 'd-new', status: 'SUPERSEDED' },
      });
    });

    it('rejects supersession when a target is already superseded by another', async () => {
      db.decision.create.mockResolvedValue({ id: 'd-new', workspaceId: 'ws-1' });
      db.decision.findMany.mockResolvedValue([
        { id: 'd-old', status: 'SUPERSEDED', supersededById: 'd-other' },
      ]);
      await expect(
        caller.decisions.create({
          workspaceId: 'ws-1',
          title: 'New',
          supersedesIds: ['d-old'],
        })
      ).rejects.toThrow(/already superseded/);
    });
  });

  describe('update', () => {
    it('lets creator update', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      const updated = { id: 'd-1', title: 'Updated' };
      db.decision.update.mockResolvedValue(updated);
      const result = await caller.decisions.update({ id: 'd-1', title: 'Updated' });
      expect(result).toEqual(updated);
    });

    it('lets ADMIN update non-owned decision', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      db.decision.update.mockResolvedValue({});
      await caller.decisions.update({ id: 'd-1', title: 'X' });
      expect(db.decision.update).toHaveBeenCalled();
    });

    it('forbids non-creator non-admin', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.decisions.update({ id: 'd-1', title: 'X' })).rejects.toThrow(/Only the creator or an admin/);
    });

    it('syncs participants and always keeps creator', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.decisionParticipant.deleteMany.mockResolvedValue({});
      db.decisionParticipant.createMany.mockResolvedValue({});
      db.decision.update.mockResolvedValue({});

      await caller.decisions.update({ id: 'd-1', participantIds: ['user-2'] });

      expect(db.decisionParticipant.deleteMany).toHaveBeenCalledWith({ where: { decisionId: 'd-1' } });
      const createMany = db.decisionParticipant.createMany.mock.calls[0][0];
      const ids = createMany.data.map((p: any) => p.userId).sort();
      expect(ids).toEqual(['user-1', 'user-2']);
    });

    it('resets previously superseded decisions then sets new ones', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.decision.findMany
        .mockResolvedValueOnce([{ id: 'd-prev' }]) // previouslySuperseded
        .mockResolvedValueOnce([{ id: 'd-new-target', supersededById: null }]); // new targets
      db.decision.updateMany.mockResolvedValue({ count: 1 });
      db.decision.update.mockResolvedValue({});

      await caller.decisions.update({ id: 'd-1', supersedesIds: ['d-new-target'] });

      // Resets prior — status='SUPERSEDED' filter to ACTIVE
      expect(db.decision.updateMany).toHaveBeenCalledWith({
        where: { supersededById: 'd-1', status: 'SUPERSEDED' },
        data: { supersededById: null, status: 'ACTIVE' },
      });
      // Sets new
      expect(db.decision.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['d-new-target'] } },
        data: { supersededById: 'd-1', status: 'SUPERSEDED' },
      });
    });

    it('rejects setting supersession to a decision already superseded by someone else', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.decision.findMany
        .mockResolvedValueOnce([]) // previouslySuperseded
        .mockResolvedValueOnce([{ id: 'd-target', supersededById: 'd-some-other' }]);

      await expect(
        caller.decisions.update({ id: 'd-1', supersedesIds: ['d-target'] })
      ).rejects.toThrow(/already superseded/);
    });
  });

  describe('delete', () => {
    it('lets creator delete', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-1',
      });
      db.decision.delete.mockResolvedValue({});
      await caller.decisions.delete({ id: 'd-1' });
      expect(db.decision.delete).toHaveBeenCalledWith({ where: { id: 'd-1' } });
    });

    it('forbids non-creator non-admin', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.decisions.delete({ id: 'd-1' })).rejects.toThrow(/Only the creator or an admin/);
    });

    it('lets ADMIN delete any', async () => {
      db.decision.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', createdById: 'user-other',
      });
      db.decision.delete.mockResolvedValue({});
      await caller.decisions.delete({ id: 'd-1' });
      expect(db.decision.delete).toHaveBeenCalled();
    });
  });

  describe('listCategories', () => {
    it('returns distinct non-null categories', async () => {
      db.$queryRaw.mockResolvedValueOnce([
        { category: 'Architecture' },
        { category: 'Process' },
      ]);
      const result = await caller.decisions.listCategories({ workspaceId: 'ws-1' });
      expect(result).toEqual(['Architecture', 'Process']);
    });
  });
});
