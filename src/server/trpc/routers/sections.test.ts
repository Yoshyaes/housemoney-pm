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
import { sectionsRouter } from '@/server/trpc/routers/sections';
import { requireProjectAccess, requireWorkspaceMember } from '@/server/trpc/trpc';

const appRouter = mockRouter({ sections: sectionsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('sections router', () => {
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
    it('returns sections ordered by order asc', async () => {
      const sections = [{ id: 's-1', name: 'A', order: 0 }, { id: 's-2', name: 'B', order: 1 }];
      db.section.findMany.mockResolvedValue(sections);

      const result = await caller.sections.list({ projectId: 'proj-1' });

      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
      expect(db.section.findMany).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: { order: 'asc' },
      });
      expect(result).toEqual(sections);
    });

    it('rejects when user has no project access', async () => {
      (requireProjectAccess as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(caller.sections.list({ projectId: 'proj-1' })).rejects.toThrow();
    });
  });

  describe('create', () => {
    it('creates section with order = (max existing) + 1', async () => {
      db.section.findFirst.mockResolvedValue({ id: 's-prev', order: 4 });
      const created = { id: 's-new', projectId: 'proj-1', name: 'Backlog', order: 5 };
      db.section.create.mockResolvedValue(created);

      const result = await caller.sections.create({ projectId: 'proj-1', name: 'Backlog' });

      expect(db.section.findFirst).toHaveBeenCalledWith({
        where: { projectId: 'proj-1' },
        orderBy: { order: 'desc' },
      });
      expect(db.section.create).toHaveBeenCalledWith({
        data: { projectId: 'proj-1', name: 'Backlog', order: 5 },
      });
      expect(result).toEqual(created);
    });

    it('uses order 0 when no existing sections', async () => {
      db.section.findFirst.mockResolvedValue(null);
      db.section.create.mockResolvedValue({});

      await caller.sections.create({ projectId: 'proj-1', name: 'First' });

      expect(db.section.create).toHaveBeenCalledWith({
        data: { projectId: 'proj-1', name: 'First', order: 0 },
      });
    });

    it('rejects empty name', async () => {
      await expect(
        caller.sections.create({ projectId: 'proj-1', name: '' })
      ).rejects.toThrow();
    });

    it('rejects when no project access', async () => {
      (requireProjectAccess as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(
        caller.sections.create({ projectId: 'proj-1', name: 'X' })
      ).rejects.toThrow();
    });
  });

  describe('rename', () => {
    it('renames a section after verifying project access', async () => {
      db.section.findUnique.mockResolvedValue({
        id: 's-1',
        project: { id: 'proj-1' },
      });
      const updated = { id: 's-1', name: 'NewName' };
      db.section.update.mockResolvedValue(updated);

      const result = await caller.sections.rename({ id: 's-1', name: 'NewName' });

      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
      expect(db.section.update).toHaveBeenCalledWith({
        where: { id: 's-1' },
        data: { name: 'NewName' },
      });
      expect(result).toEqual(updated);
    });

    it('throws NOT_FOUND when section missing', async () => {
      db.section.findUnique.mockResolvedValue(null);
      await expect(
        caller.sections.rename({ id: 's-missing', name: 'X' })
      ).rejects.toThrow(/Section not found/);
    });

    it('rejects empty name', async () => {
      await expect(
        caller.sections.rename({ id: 's-1', name: '' })
      ).rejects.toThrow();
    });

    it('rejects when no project access', async () => {
      db.section.findUnique.mockResolvedValue({ id: 's-1', project: { id: 'proj-1' } });
      (requireProjectAccess as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(caller.sections.rename({ id: 's-1', name: 'X' })).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('detaches tasks then deletes section', async () => {
      db.section.findUnique.mockResolvedValue({ id: 's-1', project: { id: 'proj-1' } });
      db.task.updateMany.mockResolvedValue({ count: 2 });
      db.section.delete.mockResolvedValue({ id: 's-1' });

      const result = await caller.sections.delete({ id: 's-1' });

      expect(db.task.updateMany).toHaveBeenCalledWith({
        where: { sectionId: 's-1' },
        data: { sectionId: null },
      });
      expect(db.section.delete).toHaveBeenCalledWith({ where: { id: 's-1' } });
      expect(result).toEqual({ id: 's-1' });
    });

    it('throws NOT_FOUND when section missing', async () => {
      db.section.findUnique.mockResolvedValue(null);
      await expect(caller.sections.delete({ id: 's-x' })).rejects.toThrow(/Section not found/);
    });

    it('rejects when no project access', async () => {
      db.section.findUnique.mockResolvedValue({ id: 's-1', project: { id: 'proj-1' } });
      (requireProjectAccess as any).mockRejectedValueOnce(new TRPCError({ code: 'FORBIDDEN' }));
      await expect(caller.sections.delete({ id: 's-1' })).rejects.toThrow();
    });
  });

  describe('moveTask', () => {
    it('updates task sectionId for an admin', async () => {
      db.task.findUnique.mockResolvedValue({ workspaceId: 'ws-1', projectId: 'proj-1' });
      db.section.findUnique.mockResolvedValue({ projectId: 'proj-1' });
      db.task.update.mockResolvedValue({ id: 't-1', sectionId: 's-1' });

      const result = await caller.sections.moveTask({ taskId: 't-1', sectionId: 's-1' });

      expect(requireWorkspaceMember).toHaveBeenCalledWith(expect.anything(), 'ws-1', 'user-1');
      // ADMIN — skips guest-only requireProjectAccess for the task, but still verifies destination section's project
      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { sectionId: 's-1' },
      });
      expect(result).toEqual({ id: 't-1', sectionId: 's-1' });
    });

    it('allows null sectionId (detach)', async () => {
      db.task.findUnique.mockResolvedValue({ workspaceId: 'ws-1', projectId: 'proj-1' });
      db.task.update.mockResolvedValue({});

      await caller.sections.moveTask({ taskId: 't-1', sectionId: null });

      // No section lookup happens when sectionId is null
      expect(db.section.findUnique).not.toHaveBeenCalled();
      expect(db.task.update).toHaveBeenCalledWith({
        where: { id: 't-1' },
        data: { sectionId: null },
      });
    });

    it('throws NOT_FOUND when task missing', async () => {
      db.task.findUnique.mockResolvedValue(null);
      await expect(
        caller.sections.moveTask({ taskId: 't-x', sectionId: null })
      ).rejects.toThrow(/Task not found/);
    });

    it('GUEST without project on task gets FORBIDDEN', async () => {
      db.task.findUnique.mockResolvedValue({ workspaceId: 'ws-1', projectId: null });
      (requireWorkspaceMember as any).mockResolvedValueOnce({
        ...defaultMembership,
        role: 'GUEST',
      });
      await expect(
        caller.sections.moveTask({ taskId: 't-1', sectionId: null })
      ).rejects.toThrow(/No access to this task/);
    });

    it('GUEST with project verifies project access', async () => {
      db.task.findUnique.mockResolvedValue({ workspaceId: 'ws-1', projectId: 'proj-1' });
      (requireWorkspaceMember as any).mockResolvedValueOnce({
        ...defaultMembership,
        role: 'GUEST',
      });
      db.task.update.mockResolvedValue({});

      await caller.sections.moveTask({ taskId: 't-1', sectionId: null });

      expect(requireProjectAccess).toHaveBeenCalledWith(expect.anything(), 'proj-1', 'user-1');
    });

    it('skips section project check when destination section not found', async () => {
      db.task.findUnique.mockResolvedValue({ workspaceId: 'ws-1', projectId: 'proj-1' });
      db.section.findUnique.mockResolvedValue(null);
      db.task.update.mockResolvedValue({});

      await caller.sections.moveTask({ taskId: 't-1', sectionId: 's-missing' });

      // requireProjectAccess should not be called for null section
      expect(requireProjectAccess).not.toHaveBeenCalled();
      expect(db.task.update).toHaveBeenCalled();
    });
  });
});
