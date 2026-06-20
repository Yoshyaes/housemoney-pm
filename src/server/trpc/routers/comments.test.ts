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
import { testUser, testUser2, testUser3 } from '@/test/helpers/fixtures';
import { commentsRouter } from '@/server/trpc/routers/comments';

const appRouter = mockRouter({ comments: commentsRouter });
const createCaller = tTest.createCallerFactory(appRouter);

describe('commentsRouter', () => {
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
    it('returns comments ordered by createdAt', async () => {
      db.task.findUnique.mockResolvedValueOnce({ workspaceId: 'ws-1', projectId: 'proj-1' });
      const comments = [
        { id: 'c-1', body: 'First', createdAt: new Date('2026-03-01'), author: testUser },
        { id: 'c-2', body: 'Second', createdAt: new Date('2026-03-02'), author: testUser2 },
      ];
      db.comment.findMany.mockResolvedValueOnce(comments);

      const result = await caller.comments.list({ taskId: 'task-1' });

      expect(result).toEqual(comments);
      expect(db.comment.findMany).toHaveBeenCalledWith({
        where: { taskId: 'task-1' },
        include: { author: true },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('create', () => {
    const task = {
      id: 'task-1',
      identifier: 'HM-10',
      title: 'Test task',
      assigneeId: testUser2.id,
      createdById: testUser3.id,
    };

    it('creates comment and parses @mentions', async () => {
      db.task.findUnique.mockResolvedValueOnce(task);
      const createdComment = {
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'Hey @[Sarah Chen](user-2) check this',
        author: testUser,
      };
      db.comment.create.mockResolvedValueOnce(createdComment);
      db.notification.createMany.mockResolvedValueOnce({ count: 1 });

      const result = await caller.comments.create({
        taskId: 'task-1',
        body: 'Hey @[Sarah Chen](user-2) check this',
      });

      expect(result).toEqual(createdComment);
      expect(db.comment.create).toHaveBeenCalledWith({
        data: {
          taskId: 'task-1',
          authorId: testUser.id,
          body: 'Hey @[Sarah Chen](user-2) check this',
          attachments: undefined,
        },
        include: { author: true },
      });
    });

    it('notifies mentioned users but not self', async () => {
      const taskSelfAssigned = { ...task, assigneeId: testUser.id, createdById: testUser.id };
      db.task.findUnique.mockResolvedValueOnce(taskSelfAssigned);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: '@[Sarah Chen](user-2) @[Fred Thompson](user-1)',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 1 });

      await caller.comments.create({
        taskId: 'task-1',
        body: '@[Sarah Chen](user-2) @[Fred Thompson](user-1)',
      });

      // Should only notify user-2 (mentioned), not user-1 (self)
      expect(db.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            userId: testUser2.id,
            type: 'MENTIONED',
          }),
        ],
      });
    });

    it('notifies assignee if not author and not already mentioned', async () => {
      db.task.findUnique.mockResolvedValueOnce(task);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'No mentions here',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 2 });

      await caller.comments.create({ taskId: 'task-1', body: 'No mentions here' });

      const callData = db.notification.createMany.mock.calls[0][0].data;
      expect(callData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: testUser2.id,
            type: 'COMMENT',
          }),
        ])
      );
    });

    it('does not notify assignee if assignee is the author', async () => {
      const taskAuthorAssigned = { ...task, assigneeId: testUser.id };
      db.task.findUnique.mockResolvedValueOnce(taskAuthorAssigned);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'My own comment',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 1 });

      await caller.comments.create({ taskId: 'task-1', body: 'My own comment' });

      // Should only notify creator (user-3), not assignee (user-1 = self)
      const callData = db.notification.createMany.mock.calls[0][0].data;
      expect(callData).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: testUser.id }),
        ])
      );
    });

    it('does not notify assignee if already mentioned', async () => {
      db.task.findUnique.mockResolvedValueOnce(task);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'Hey @[Sarah Chen](user-2)',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 2 });

      await caller.comments.create({
        taskId: 'task-1',
        body: 'Hey @[Sarah Chen](user-2)',
      });

      // user-2 should only get MENTIONED, not also COMMENT
      const callData = db.notification.createMany.mock.calls[0][0].data;
      const user2Notifications = callData.filter((n: any) => n.userId === testUser2.id);
      expect(user2Notifications).toHaveLength(1);
      expect(user2Notifications[0].type).toBe('MENTIONED');
    });

    it('notifies creator if not author, not assignee, and not mentioned', async () => {
      db.task.findUnique.mockResolvedValueOnce(task);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'No mentions',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 2 });

      await caller.comments.create({ taskId: 'task-1', body: 'No mentions' });

      const callData = db.notification.createMany.mock.calls[0][0].data;
      expect(callData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userId: testUser3.id,
            type: 'COMMENT',
          }),
        ])
      );
    });

    it('does not notify creator if creator is the author', async () => {
      const taskAuthorCreated = { ...task, createdById: testUser.id };
      db.task.findUnique.mockResolvedValueOnce(taskAuthorCreated);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'My comment',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 1 });

      await caller.comments.create({ taskId: 'task-1', body: 'My comment' });

      // Should only notify assignee (user-2), not creator (user-1 = self)
      const callData = db.notification.createMany.mock.calls[0][0].data;
      expect(callData).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: testUser.id }),
        ])
      );
    });

    it('does not create duplicate notifications', async () => {
      // assignee === creator, both user-2. Mention user-3.
      const taskSameAssigneeCreator = {
        ...task,
        assigneeId: testUser2.id,
        createdById: testUser2.id,
      };
      db.task.findUnique.mockResolvedValueOnce(taskSameAssigneeCreator);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'Hey @[Marcus Johnson](user-3)',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 2 });

      await caller.comments.create({
        taskId: 'task-1',
        body: 'Hey @[Marcus Johnson](user-3)',
      });

      // user-3 gets MENTIONED, user-2 gets COMMENT (as assignee)
      // creator check: createdById (user-2) !== assigneeId (user-2) is false, so no creator notification
      const callData = db.notification.createMany.mock.calls[0][0].data;
      const uniqueUserIds = new Set(callData.map((n: any) => n.userId));
      expect(uniqueUserIds.size).toBe(callData.length);
    });

    it('with no mentions only notifies assignee and creator', async () => {
      db.task.findUnique.mockResolvedValueOnce(task);
      db.comment.create.mockResolvedValueOnce({
        id: 'c-1',
        taskId: 'task-1',
        authorId: testUser.id,
        body: 'Plain comment',
        author: testUser,
      });
      db.notification.createMany.mockResolvedValueOnce({ count: 2 });

      await caller.comments.create({ taskId: 'task-1', body: 'Plain comment' });

      const callData = db.notification.createMany.mock.calls[0][0].data;
      expect(callData).toHaveLength(2);
      expect(callData).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ userId: testUser2.id, type: 'COMMENT' }), // assignee
          expect.objectContaining({ userId: testUser3.id, type: 'COMMENT' }), // creator
        ])
      );
    });
  });

  describe('delete', () => {
    it('allows author to delete their comment', async () => {
      db.comment.findUnique.mockResolvedValueOnce({
        authorId: testUser.id,
        task: { workspaceId: 'ws-1', projectId: 'proj-1' },
      });
      const deletedComment = { id: 'c-1', authorId: testUser.id, body: 'deleted' };
      db.comment.delete.mockResolvedValueOnce(deletedComment);

      const result = await caller.comments.delete({ id: 'c-1' });

      expect(result).toEqual(deletedComment);
      expect(db.comment.delete).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    });

    it('throws for non-author trying to delete', async () => {
      // Default mocked membership is ADMIN — for this test, ensure non-admin
      const trpcMock = await import('@/server/trpc/trpc');
      (trpcMock.requireWorkspaceMember as any).mockResolvedValueOnce({
        id: 'm-1', workspaceId: 'ws-1', userId: testUser.id, role: 'MEMBER',
      });
      db.comment.findUnique.mockResolvedValueOnce({
        authorId: 'user-other',
        task: { workspaceId: 'ws-1', projectId: 'proj-1' },
      });

      await expect(
        caller.comments.delete({ id: 'c-1' })
      ).rejects.toThrow(/author or an admin/);
    });
  });

  describe('addReaction', () => {
    it('adds new emoji reaction', async () => {
      db.comment.findUnique.mockResolvedValueOnce({
        reactions: [],
        task: { workspaceId: 'ws-1', projectId: 'proj-1' },
      });
      const updatedComment = {
        id: 'c-1',
        reactions: [{ emoji: '👍', userIds: [testUser.id] }],
        author: testUser,
      };
      db.comment.update.mockResolvedValueOnce(updatedComment);

      const result = await caller.comments.addReaction({ commentId: 'c-1', emoji: '👍' });

      expect(result).toEqual(updatedComment);
      expect(db.comment.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { reactions: [{ emoji: '👍', userIds: [testUser.id] }] },
        include: { author: true },
      });
    });

    it('toggles off existing reaction (removes user)', async () => {
      db.comment.findUnique.mockResolvedValueOnce({
        reactions: [{ emoji: '👍', userIds: [testUser.id, testUser2.id] }],
        task: { workspaceId: 'ws-1', projectId: 'proj-1' },
      });
      const updatedComment = {
        id: 'c-1',
        reactions: [{ emoji: '👍', userIds: [testUser2.id] }],
        author: testUser,
      };
      db.comment.update.mockResolvedValueOnce(updatedComment);

      await caller.comments.addReaction({ commentId: 'c-1', emoji: '👍' });

      expect(db.comment.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { reactions: [{ emoji: '👍', userIds: [testUser2.id] }] },
        include: { author: true },
      });
    });

    it('removes reaction entry when last user removed', async () => {
      db.comment.findUnique.mockResolvedValueOnce({
        reactions: [{ emoji: '👍', userIds: [testUser.id] }],
        task: { workspaceId: 'ws-1', projectId: 'proj-1' },
      });
      const updatedComment = { id: 'c-1', reactions: [], author: testUser };
      db.comment.update.mockResolvedValueOnce(updatedComment);

      await caller.comments.addReaction({ commentId: 'c-1', emoji: '👍' });

      expect(db.comment.update).toHaveBeenCalledWith({
        where: { id: 'c-1' },
        data: { reactions: [] },
        include: { author: true },
      });
    });
  });
});
