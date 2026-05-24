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
import { docCommentsRouter } from '@/server/trpc/routers/doc-comments';
import { requireWorkspaceMember, requireProjectAccess } from '@/server/trpc/trpc';

const appRouter = mockRouter({ docComments: docCommentsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('doc-comments router', () => {
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
    it('returns comments ordered ascending with author', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({ id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      const comments = [{ id: 'c-1', body: 'Hi', author: testUser }];
      db.documentComment.findMany.mockResolvedValue(comments);

      const result = await caller.docComments.list({ documentId: 'd-1' });

      expect(db.documentComment.findMany).toHaveBeenCalledWith({
        where: { documentId: 'd-1' },
        orderBy: { createdAt: 'asc' },
        include: { author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } } },
      });
      expect(result).toEqual(comments);
    });

    it('GUEST without projectId on doc is forbidden', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({ id: 'd-1', workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });

      await expect(caller.docComments.list({ documentId: 'd-1' })).rejects.toThrow(/No access to this document/);
    });

    it('GUEST with projectId requires project access', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({ id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      db.documentComment.findMany.mockResolvedValue([]);

      await caller.docComments.list({ documentId: 'd-1' });

      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
    });
  });

  describe('create', () => {
    it('creates a comment with authorId set to ctx user', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({ id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1' });
      const created = { id: 'c-new', body: 'Hello', author: testUser };
      db.documentComment.create.mockResolvedValue(created);

      const result = await caller.docComments.create({ documentId: 'd-1', body: 'Hello' });

      expect(db.documentComment.create).toHaveBeenCalledWith({
        data: { documentId: 'd-1', authorId: 'user-1', body: 'Hello' },
        include: { author: { select: { id: true, name: true, avatarUrl: true, avatarColor: true } } },
      });
      expect(result).toEqual(created);
    });

    it('rejects empty body', async () => {
      await expect(
        caller.docComments.create({ documentId: 'd-1', body: '' })
      ).rejects.toThrow();
    });

    it('rejects body over 5000 chars', async () => {
      await expect(
        caller.docComments.create({ documentId: 'd-1', body: 'x'.repeat(5001) })
      ).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('lets author delete their own comment', async () => {
      db.documentComment.findUniqueOrThrow.mockResolvedValue({
        id: 'c-1',
        documentId: 'd-1',
        authorId: 'user-1',
      });
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
      });
      db.documentComment.delete.mockResolvedValue({});

      await caller.docComments.delete({ id: 'c-1' });

      expect(db.documentComment.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });

    it('lets ADMIN delete any comment', async () => {
      db.documentComment.findUniqueOrThrow.mockResolvedValue({
        id: 'c-1',
        documentId: 'd-1',
        authorId: 'user-other',
      });
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
      });
      db.documentComment.delete.mockResolvedValue({});

      await caller.docComments.delete({ id: 'c-1' });

      expect(db.documentComment.delete).toHaveBeenCalled();
    });

    it('rejects non-author non-admin', async () => {
      db.documentComment.findUniqueOrThrow.mockResolvedValue({
        id: 'c-1',
        documentId: 'd-1',
        authorId: 'user-other',
      });
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1',
        workspaceId: 'ws-1',
        projectId: 'proj-1',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });

      await expect(caller.docComments.delete({ id: 'c-1' })).rejects.toThrow();
      expect(db.documentComment.delete).not.toHaveBeenCalled();
    });
  });
});
