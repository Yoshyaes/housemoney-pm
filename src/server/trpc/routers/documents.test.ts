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
import { documentsRouter } from '@/server/trpc/routers/documents';
import {
  requireWorkspaceMember,
  requireProjectAccess,
  getAccessibleProjectIds,
} from '@/server/trpc/trpc';

const appRouter = mockRouter({ documents: documentsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('documents router', () => {
  let db: MockPrisma;
  let caller: ReturnType<typeof createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockPrisma();
    (getAccessibleProjectIds as any).mockResolvedValue(null);
    caller = createCaller({
      db: db as any,
      user: testUser as any,
      userId: testUser.id,
    });
  });

  describe('list', () => {
    it('lists documents with contentPreview and ordering', async () => {
      db.document.findMany.mockResolvedValue([
        { id: 'd-1', workspaceId: 'ws-1', content: 'x'.repeat(300), pinned: false, updatedAt: new Date() },
      ]);

      const result = await caller.documents.list({ workspaceId: 'ws-1' });

      expect(db.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
          take: 21,
        })
      );
      expect(result.items[0].contentPreview).toHaveLength(200);
      expect(result.items[0].content).toBeUndefined();
      expect(result.nextCursor).toBeNull();
    });

    it('filters by docType, projectId, tags, pinned', async () => {
      db.document.findMany.mockResolvedValue([]);
      await caller.documents.list({
        workspaceId: 'ws-1',
        docType: 'GENERAL' as any,
        projectId: 'proj-1',
        tags: ['design', 'urgent'],
        pinned: true,
      });
      expect(db.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-1',
            docType: 'GENERAL',
            projectId: 'proj-1',
            pinned: true,
            tags: { hasEvery: ['design', 'urgent'] },
          }),
        })
      );
    });

    it('returns nextCursor when more items than limit', async () => {
      const many = Array.from({ length: 21 }, (_, i) => ({
        id: `d-${i}`,
        workspaceId: 'ws-1',
        content: '',
        pinned: false,
        updatedAt: new Date(),
      }));
      db.document.findMany.mockResolvedValue(many);

      const result = await caller.documents.list({ workspaceId: 'ws-1' });

      expect(result.items).toHaveLength(20);
      expect(result.nextCursor).toBe('d-20');
    });

    it('GUEST scopes documents to accessible projects', async () => {
      (getAccessibleProjectIds as any).mockResolvedValueOnce(['proj-a']);
      db.document.findMany.mockResolvedValue([]);

      await caller.documents.list({ workspaceId: 'ws-1' });

      expect(db.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: { in: ['proj-a'] },
          }),
        })
      );
    });

    it('GUEST requesting non-accessible projectId is forbidden', async () => {
      (getAccessibleProjectIds as any).mockResolvedValueOnce(['proj-a']);
      await expect(
        caller.documents.list({ workspaceId: 'ws-1', projectId: 'proj-other' })
      ).rejects.toThrow(/No access to this project/);
    });

    it('validates limit max=50', async () => {
      await expect(caller.documents.list({ workspaceId: 'ws-1', limit: 51 })).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('returns document with full details', async () => {
      const doc = { id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1' };
      db.document.findUnique.mockResolvedValue(doc);

      const result = await caller.documents.get({ id: 'd-1' });

      expect(result).toEqual(doc);
    });

    it('throws NOT_FOUND when missing', async () => {
      db.document.findUnique.mockResolvedValue(null);
      await expect(caller.documents.get({ id: 'd-x' })).rejects.toThrow(/Document not found/);
    });

    it('GUEST without project on doc is forbidden', async () => {
      db.document.findUnique.mockResolvedValue({ id: 'd-1', workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.documents.get({ id: 'd-1' })).rejects.toThrow(/No access to this document/);
    });
  });

  describe('create', () => {
    it('creates a document with author=ctx user', async () => {
      const created = { id: 'd-new', title: 'Spec', workspaceId: 'ws-1' };
      db.document.create.mockResolvedValue(created);

      const result = await caller.documents.create({
        workspaceId: 'ws-1',
        title: 'Spec',
        content: 'body',
      });

      expect(db.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            authorId: 'user-1',
            title: 'Spec',
            content: 'body',
            docType: 'GENERAL',
            pinned: false,
          }),
        })
      );
      expect(result).toEqual(created);
    });

    it('GUEST without projectId is forbidden', async () => {
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(
        caller.documents.create({ workspaceId: 'ws-1', title: 'X' })
      ).rejects.toThrow(/Guests must link documents to a project/);
    });

    it('GUEST with projectId requires project access', async () => {
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      db.document.create.mockResolvedValue({});
      await caller.documents.create({ workspaceId: 'ws-1', title: 'X', projectId: 'proj-1' });
      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
    });

    it('rejects empty title', async () => {
      await expect(
        caller.documents.create({ workspaceId: 'ws-1', title: '' })
      ).rejects.toThrow();
    });

    it('rejects title over 500 chars', async () => {
      await expect(
        caller.documents.create({ workspaceId: 'ws-1', title: 'x'.repeat(501) })
      ).rejects.toThrow();
    });

    it('rejects content over 500000 chars', async () => {
      await expect(
        caller.documents.create({ workspaceId: 'ws-1', title: 'X', content: 'a'.repeat(500001) })
      ).rejects.toThrow();
    });
  });

  describe('update', () => {
    it('lets author update', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1', authorId: 'user-1',
      });
      const updated = { id: 'd-1', title: 'Updated' };
      db.document.update.mockResolvedValue(updated);

      const result = await caller.documents.update({ id: 'd-1', title: 'Updated' });

      expect(db.document.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'd-1' },
          data: expect.objectContaining({ title: 'Updated', lastEditedById: 'user-1' }),
        })
      );
      expect(result).toEqual(updated);
    });

    it('lets ADMIN update non-owned doc', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1', authorId: 'user-other',
      });
      db.document.update.mockResolvedValue({});
      await caller.documents.update({ id: 'd-1', title: 'X' });
      expect(db.document.update).toHaveBeenCalled();
    });

    it('forbids non-author non-admin', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1', authorId: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.documents.update({ id: 'd-1', title: 'X' })).rejects.toThrow(/Only the author or an admin/);
    });

    it('GUEST without project on doc is forbidden', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: null, authorId: 'user-1',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.documents.update({ id: 'd-1', title: 'X' })).rejects.toThrow(/No access to this document/);
    });
  });

  describe('delete', () => {
    it('lets author delete', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1', authorId: 'user-1',
      });
      db.document.delete.mockResolvedValue({});

      await caller.documents.delete({ id: 'd-1' });

      expect(db.document.delete).toHaveBeenCalledWith({ where: { id: 'd-1' } });
    });

    it('lets ADMIN delete any doc', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1', authorId: 'user-other',
      });
      db.document.delete.mockResolvedValue({});
      await caller.documents.delete({ id: 'd-1' });
      expect(db.document.delete).toHaveBeenCalled();
    });

    it('forbids non-author non-admin', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1', authorId: 'user-other',
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'MEMBER' });
      await expect(caller.documents.delete({ id: 'd-1' })).rejects.toThrow(/Only the author or an admin/);
    });
  });

  describe('search', () => {
    it('returns empty when query is whitespace-only', async () => {
      const result = await caller.documents.search({ workspaceId: 'ws-1', query: '   ' });
      expect(result).toEqual([]);
      expect(db.$queryRaw).not.toHaveBeenCalled();
    });

    it('uses ILIKE for short queries (<3 chars)', async () => {
      db.$queryRaw.mockResolvedValueOnce([{ id: 'd-1', title: 'A', docType: 'GENERAL', tags: [], score: 1, snippet: 'x' }]);
      const result = await caller.documents.search({ workspaceId: 'ws-1', query: 'a' });
      expect(result).toHaveLength(1);
      expect(db.$queryRaw).toHaveBeenCalled();
    });

    it('uses trigram similarity for longer queries (>=3 chars)', async () => {
      db.$queryRaw.mockResolvedValueOnce([]);
      await caller.documents.search({ workspaceId: 'ws-1', query: 'hello world' });
      expect(db.$queryRaw).toHaveBeenCalled();
    });

    it('rejects empty query', async () => {
      await expect(
        caller.documents.search({ workspaceId: 'ws-1', query: '' })
      ).rejects.toThrow();
    });

    it('rejects query over 200 chars', async () => {
      await expect(
        caller.documents.search({ workspaceId: 'ws-1', query: 'x'.repeat(201) })
      ).rejects.toThrow();
    });
  });

  describe('listTags', () => {
    it('returns tags with counts converted from bigint', async () => {
      db.$queryRaw.mockResolvedValueOnce([
        { tag: 'design', count: BigInt(3) },
        { tag: 'urgent', count: BigInt(1) },
      ]);

      const result = await caller.documents.listTags({ workspaceId: 'ws-1' });

      expect(result).toEqual([
        { tag: 'design', count: 3 },
        { tag: 'urgent', count: 1 },
      ]);
    });
  });

  describe('addAttachment', () => {
    it('adds attachment for member', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: 'proj-1',
      });
      const created = { id: 'a-1', name: 'file.pdf' };
      db.documentAttachment.create.mockResolvedValue(created);

      const result = await caller.documents.addAttachment({
        documentId: 'd-1',
        name: 'file.pdf',
        url: 'https://example.com/f.pdf',
      });

      expect(db.documentAttachment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            documentId: 'd-1',
            uploadedById: 'user-1',
            name: 'file.pdf',
            url: 'https://example.com/f.pdf',
          }),
        })
      );
      expect(result).toEqual(created);
    });

    it('GUEST without project on doc is forbidden', async () => {
      db.document.findUniqueOrThrow.mockResolvedValue({
        id: 'd-1', workspaceId: 'ws-1', projectId: null,
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(
        caller.documents.addAttachment({ documentId: 'd-1', name: 'x', url: 'https://x.com' })
      ).rejects.toThrow();
    });

    it('rejects non-URL', async () => {
      await expect(
        caller.documents.addAttachment({ documentId: 'd-1', name: 'x', url: 'not-a-url' })
      ).rejects.toThrow();
    });
  });

  describe('deleteAttachment', () => {
    it('deletes attachment for member', async () => {
      db.documentAttachment.findUniqueOrThrow.mockResolvedValue({
        id: 'a-1',
        document: { workspaceId: 'ws-1', projectId: 'proj-1' },
      });
      db.documentAttachment.delete.mockResolvedValue({ id: 'a-1' });

      const result = await caller.documents.deleteAttachment({ id: 'a-1' });

      expect(db.documentAttachment.delete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
      expect(result).toEqual({ id: 'a-1' });
    });

    it('GUEST without project on doc is forbidden', async () => {
      db.documentAttachment.findUniqueOrThrow.mockResolvedValue({
        id: 'a-1',
        document: { workspaceId: 'ws-1', projectId: null },
      });
      (requireWorkspaceMember as any).mockResolvedValueOnce({ ...defaultMembership, role: 'GUEST' });
      await expect(caller.documents.deleteAttachment({ id: 'a-1' })).rejects.toThrow();
    });
  });
});
