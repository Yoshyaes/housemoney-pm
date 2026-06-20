import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acceptInvitation, acceptPendingInvitations } from './accept-invitation';
import { createMockPrisma, type MockPrisma } from '@/test/helpers/mock-prisma';

describe('acceptInvitation', () => {
  let db: MockPrisma;

  beforeEach(() => {
    db = createMockPrisma();
    db.workspaceMember.upsert.mockResolvedValue({});
    db.projectMember.createMany.mockResolvedValue({ count: 0 });
    db.invitation.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it('upserts a workspace membership with the invitation role', async () => {
    await acceptInvitation(
      db as never,
      {
        id: 'inv-1',
        workspaceId: 'ws-1',
        email: 'new@example.com',
        role: 'MEMBER',
        projectIds: [],
      },
      'user-9'
    );

    expect(db.workspaceMember.upsert).toHaveBeenCalledWith({
      where: { workspaceId_userId: { workspaceId: 'ws-1', userId: 'user-9' } },
      create: {
        workspaceId: 'ws-1',
        userId: 'user-9',
        role: 'MEMBER',
      },
      update: {},
    });
  });

  it('creates project memberships when projectIds are provided', async () => {
    await acceptInvitation(
      db as never,
      {
        id: 'inv-2',
        workspaceId: 'ws-1',
        email: 'guest@example.com',
        role: 'GUEST',
        projectIds: ['proj-a', 'proj-b'],
      },
      'user-7'
    );

    expect(db.projectMember.createMany).toHaveBeenCalledWith({
      data: [
        { projectId: 'proj-a', userId: 'user-7' },
        { projectId: 'proj-b', userId: 'user-7' },
      ],
      skipDuplicates: true,
    });
  });

  it('skips project membership creation when projectIds is empty', async () => {
    await acceptInvitation(
      db as never,
      {
        id: 'inv-3',
        workspaceId: 'ws-1',
        email: 'm@example.com',
        role: 'ADMIN',
        projectIds: [],
      },
      'user-1'
    );

    expect(db.projectMember.createMany).not.toHaveBeenCalled();
  });

  it('marks the invitation as accepted with a recent timestamp', async () => {
    const before = Date.now();
    await acceptInvitation(
      db as never,
      {
        id: 'inv-4',
        workspaceId: 'ws-1',
        email: 'm@example.com',
        role: 'MEMBER',
        projectIds: [],
      },
      'user-1'
    );

    expect(db.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-4' },
      data: { acceptedAt: expect.any(Date) },
    });
    const call = db.invitation.update.mock.calls[0][0] as { data: { acceptedAt: Date } };
    expect(call.data.acceptedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.data.acceptedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('writes an INVITATION_ACCEPTED audit log entry', async () => {
    await acceptInvitation(
      db as never,
      {
        id: 'inv-5',
        workspaceId: 'ws-2',
        email: 'accepted@example.com',
        role: 'MEMBER',
        projectIds: [],
      },
      'user-2'
    );

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'INVITATION_ACCEPTED',
        email: 'accepted@example.com',
        userId: 'user-2',
        workspaceId: 'ws-2',
        metadata: { role: 'MEMBER' },
      }),
    });
  });
});

describe('acceptPendingInvitations', () => {
  let db: MockPrisma;

  beforeEach(() => {
    db = createMockPrisma();
    db.workspaceMember.upsert.mockResolvedValue({});
    db.projectMember.createMany.mockResolvedValue({ count: 0 });
    db.invitation.update.mockResolvedValue({});
    db.auditLog.create.mockResolvedValue({});
  });

  it('finds invitations that are unaccepted and not expired for the email', async () => {
    db.invitation.findMany.mockResolvedValue([]);

    await acceptPendingInvitations(db as never, 'foo@example.com', 'user-1');

    expect(db.invitation.findMany).toHaveBeenCalledWith({
      where: {
        email: 'foo@example.com',
        acceptedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
    });
  });

  it('accepts each pending invitation it finds', async () => {
    db.invitation.findMany.mockResolvedValue([
      { id: 'i1', workspaceId: 'ws-1', email: 'foo@x.com', role: 'MEMBER', projectIds: [] },
      { id: 'i2', workspaceId: 'ws-2', email: 'foo@x.com', role: 'GUEST', projectIds: ['p1'] },
    ]);

    const result = await acceptPendingInvitations(db as never, 'foo@x.com', 'user-7');

    expect(result).toBe(true);
    expect(db.workspaceMember.upsert).toHaveBeenCalledTimes(2);
    expect(db.invitation.update).toHaveBeenCalledTimes(2);
    expect(db.projectMember.createMany).toHaveBeenCalledTimes(1);
  });

  it('returns false when there are no pending invitations', async () => {
    db.invitation.findMany.mockResolvedValue([]);
    const result = await acceptPendingInvitations(db as never, 'nobody@x.com', 'user-3');
    expect(result).toBe(false);
    expect(db.workspaceMember.upsert).not.toHaveBeenCalled();
  });
});
