import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditLog, AuditAction } from './log';
import { createMockPrisma, type MockPrisma } from '@/test/helpers/mock-prisma';

describe('auditLog', () => {
  let db: MockPrisma;

  beforeEach(() => {
    db = createMockPrisma();
    db.auditLog.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('writes an entry to auditLog with the given action', async () => {
    await auditLog(db as never, {
      action: AuditAction.LOGIN_SUCCESS,
      email: 'user@example.com',
      userId: 'user-1',
    });

    expect(db.auditLog.create).toHaveBeenCalledTimes(1);
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LOGIN_SUCCESS',
        email: 'user@example.com',
        userId: 'user-1',
      }),
    });
  });

  it('forwards workspaceId, ipAddress and userAgent', async () => {
    await auditLog(db as never, {
      action: AuditAction.INVITATION_SENT,
      workspaceId: 'ws-1',
      ipAddress: '192.0.2.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 'ws-1',
        ipAddress: '192.0.2.1',
        userAgent: 'Mozilla/5.0',
      }),
    });
  });

  it('serializes metadata via JSON round-trip to strip unsupported values', async () => {
    await auditLog(db as never, {
      action: AuditAction.SIGNUP,
      metadata: { role: 'ADMIN', extra: { nested: true } },
    });

    const call = db.auditLog.create.mock.calls[0][0] as { data: { metadata: unknown } };
    expect(call.data.metadata).toEqual({ role: 'ADMIN', extra: { nested: true } });
  });

  it('passes undefined metadata when omitted', async () => {
    await auditLog(db as never, { action: AuditAction.OAUTH_LOGIN });

    const call = db.auditLog.create.mock.calls[0][0] as { data: { metadata: unknown } };
    expect(call.data.metadata).toBeUndefined();
  });

  it('does not throw when prisma rejects (errors are swallowed)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.auditLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      auditLog(db as never, { action: AuditAction.LOGIN_FAILED, email: 'x@y.com' })
    ).resolves.toBeUndefined();

    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('exposes the documented AuditAction constants', () => {
    expect(AuditAction.LOGIN_SUCCESS).toBe('LOGIN_SUCCESS');
    expect(AuditAction.LOGIN_FAILED).toBe('LOGIN_FAILED');
    expect(AuditAction.SIGNUP).toBe('SIGNUP');
    expect(AuditAction.SIGNUP_FAILED).toBe('SIGNUP_FAILED');
    expect(AuditAction.OAUTH_LOGIN).toBe('OAUTH_LOGIN');
    expect(AuditAction.ACCOUNT_CREATED).toBe('ACCOUNT_CREATED');
    expect(AuditAction.PASSWORD_RESET_REQUESTED).toBe('PASSWORD_RESET_REQUESTED');
    expect(AuditAction.INVITATION_SENT).toBe('INVITATION_SENT');
    expect(AuditAction.INVITATION_ACCEPTED).toBe('INVITATION_ACCEPTED');
    expect(AuditAction.MEMBER_REMOVED).toBe('MEMBER_REMOVED');
  });
});
