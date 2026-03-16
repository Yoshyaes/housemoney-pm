import type { db as prismaDb } from '@/server/db';

type DB = typeof prismaDb;

interface AuditLogParams {
  action: string;
  email?: string;
  userId?: string;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Records an audit log entry. Non-blocking — errors are caught and logged
 * to console so they never break the calling flow.
 */
export async function auditLog(db: DB, params: AuditLogParams) {
  try {
    await db.auditLog.create({
      data: {
        action: params.action,
        email: params.email,
        userId: params.userId,
        workspaceId: params.workspaceId,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}

// Action constants
export const AuditAction = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  SIGNUP: 'SIGNUP',
  SIGNUP_FAILED: 'SIGNUP_FAILED',
  OAUTH_LOGIN: 'OAUTH_LOGIN',
  ACCOUNT_CREATED: 'ACCOUNT_CREATED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  INVITATION_SENT: 'INVITATION_SENT',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
} as const;
