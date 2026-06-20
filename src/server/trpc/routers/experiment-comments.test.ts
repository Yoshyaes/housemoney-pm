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

import { createMockPrisma, type MockPrisma } from '@/test/helpers/mock-prisma';
import { testUser } from '@/test/helpers/fixtures';
import { experimentCommentsRouter } from '@/server/trpc/routers/experiment-comments';
import { requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';

const appRouter = mockRouter({ expComments: experimentCommentsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('experiment-comments router', () => {
  let db: MockPrisma;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockPrisma();
    caller = createCaller({
      db: db as any,
      user: testUser as any,
      userId: testUser.id,
    });
  });

  describe('list', () => {
    it('returns comments for an experiment ordered ascending', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      const comments = [{ id: 'c-1', body: 'Note', author: testUser }];
      db.experimentComment.findMany.mockResolvedValue(comments);

      const result = await caller.expComments.list({ experimentId: 'e-1' });

      expect(db.experimentComment.findMany).toHaveBeenCalledWith({
        where: { experimentId: 'e-1' },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } } },
      });
      expect(result).toEqual(comments);
    });

    it('GUEST without project on experiment is forbidden', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.expComments.list({ experimentId: 'e-1' })).rejects.toThrow(/No access to this experiment/);
    });

    it('GUEST with project verifies project access', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      db.experimentComment.findMany.mockResolvedValue([]);
      await caller.expComments.list({ experimentId: 'e-1' });
      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
    });
  });

  describe('create', () => {
    it('creates with ctx userId as author', async () => {
      db.experiment.findUniqueOrThrow.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      const created = { id: 'c-1', body: 'Hello', author: testUser };
      db.experimentComment.create.mockResolvedValue(created);

      const result = await caller.expComments.create({ experimentId: 'e-1', body: 'Hello' });

      expect(db.experimentComment.create).toHaveBeenCalledWith({
        data: { experimentId: 'e-1', authorId: 'user-1', body: 'Hello' },
        include: { author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } } },
      });
      expect(result).toEqual(created);
    });

    it('rejects empty body', async () => {
      await expect(caller.expComments.create({ experimentId: 'e-1', body: '' })).rejects.toThrow();
    });

    it('rejects body over 5000 chars', async () => {
      await expect(
        caller.expComments.create({ experimentId: 'e-1', body: 'x'.repeat(5001) })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('lets author delete', async () => {
      db.experimentComment.findUniqueOrThrow.mockResolvedValue({ id: 'c-1', experimentId: 'e-1', authorId: 'user-1' });
      db.experiment.findUniqueOrThrow.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      db.experimentComment.delete.mockResolvedValue({});

      await caller.expComments.delete({ id: 'c-1' });
      expect(db.experimentComment.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });

    it('lets ADMIN delete any comment', async () => {
      db.experimentComment.findUniqueOrThrow.mockResolvedValue({ id: 'c-1', experimentId: 'e-1', authorId: 'user-other' });
      db.experiment.findUniqueOrThrow.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      db.experimentComment.delete.mockResolvedValue({});
      await caller.expComments.delete({ id: 'c-1' });
      expect(db.experimentComment.delete).toHaveBeenCalled();
    });

    it('forbids non-author non-admin', async () => {
      db.experimentComment.findUniqueOrThrow.mockResolvedValue({ id: 'c-1', experimentId: 'e-1', authorId: 'user-other' });
      db.experiment.findUniqueOrThrow.mockResolvedValue({ id: 'e-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.expComments.delete({ id: 'c-1' })).rejects.toThrow();
      expect(db.experimentComment.delete).not.toHaveBeenCalled();
    });
  });
});
