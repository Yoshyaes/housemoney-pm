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
import { feedbackCommentsRouter } from '@/server/trpc/routers/feedback-comments';
import { requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';

const appRouter = mockRouter({ fbComments: feedbackCommentsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('feedback-comments router', () => {
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
    it('returns comments ordered ascending', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      const comments = [{ id: 'c-1', body: 'Note', author: testUser }];
      db.feedbackComment.findMany.mockResolvedValue(comments);

      const result = await caller.fbComments.list({ feedbackId: 'f-1' });

      expect(db.feedbackComment.findMany).toHaveBeenCalledWith({
        where: { feedbackId: 'f-1' },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } } },
      });
      expect(result).toEqual(comments);
    });

    it('GUEST without project on feedback is forbidden', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.fbComments.list({ feedbackId: 'f-1' })).rejects.toThrow(/No access to this feedback/);
    });

    it('GUEST with project verifies project access', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      db.feedbackComment.findMany.mockResolvedValue([]);
      await caller.fbComments.list({ feedbackId: 'f-1' });
      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
    });
  });

  describe('create', () => {
    it('creates with ctx userId as author', async () => {
      db.feedback.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      const created = { id: 'c-1', body: 'Note', author: testUser };
      db.feedbackComment.create.mockResolvedValue(created);

      const result = await caller.fbComments.create({ feedbackId: 'f-1', body: 'Note' });

      expect(db.feedbackComment.create).toHaveBeenCalledWith({
        data: { feedbackId: 'f-1', authorId: 'user-1', body: 'Note' },
        include: { author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } } },
      });
      expect(result).toEqual(created);
    });

    it('rejects empty body', async () => {
      await expect(caller.fbComments.create({ feedbackId: 'f-1', body: '' })).rejects.toThrow();
    });

    it('rejects body over 5000 chars', async () => {
      await expect(
        caller.fbComments.create({ feedbackId: 'f-1', body: 'x'.repeat(5001) })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('lets author delete', async () => {
      db.feedbackComment.findUniqueOrThrow.mockResolvedValue({ id: 'c-1', feedbackId: 'f-1', authorId: 'user-1' });
      db.feedback.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      db.feedbackComment.delete.mockResolvedValue({});

      await caller.fbComments.delete({ id: 'c-1' });
      expect(db.feedbackComment.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });

    it('lets ADMIN delete any comment', async () => {
      db.feedbackComment.findUniqueOrThrow.mockResolvedValue({ id: 'c-1', feedbackId: 'f-1', authorId: 'user-other' });
      db.feedback.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      db.feedbackComment.delete.mockResolvedValue({});
      await caller.fbComments.delete({ id: 'c-1' });
      expect(db.feedbackComment.delete).toHaveBeenCalled();
    });

    it('forbids non-author non-admin', async () => {
      db.feedbackComment.findUniqueOrThrow.mockResolvedValue({ id: 'c-1', feedbackId: 'f-1', authorId: 'user-other' });
      db.feedback.findUniqueOrThrow.mockResolvedValue({ id: 'f-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.fbComments.delete({ id: 'c-1' })).rejects.toThrow();
      expect(db.feedbackComment.delete).not.toHaveBeenCalled();
    });
  });
});
