import type { db as prismaDb } from '@/server/db';
import { auditLog, AuditAction } from '@/server/audit/log';

type DB = typeof prismaDb;

interface InvitationData {
  id: string;
  workspaceId: string;
  email?: string;
  role: string;
  projectIds: string[];
}

/**
 * Accepts a single invitation: creates workspace membership, project memberships,
 * and marks the invitation as accepted. Uses upsert/skipDuplicates to be idempotent.
 */
export async function acceptInvitation(db: DB, invitation: InvitationData, userId: string) {
  await db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
    create: {
      workspaceId: invitation.workspaceId,
      userId,
      role: invitation.role as 'ADMIN' | 'MEMBER' | 'GUEST',
    },
    update: {},
  });

  if (invitation.projectIds.length > 0) {
    await db.projectMember.createMany({
      data: invitation.projectIds.map((projectId) => ({
        projectId,
        userId,
      })),
      skipDuplicates: true,
    });
  }

  await db.invitation.update({
    where: { id: invitation.id },
    data: { acceptedAt: new Date() },
  });

  await auditLog(db, {
    action: AuditAction.INVITATION_ACCEPTED,
    email: invitation.email,
    userId,
    workspaceId: invitation.workspaceId,
    metadata: { role: invitation.role },
  });
}

/**
 * Finds and accepts all pending invitations for an email address.
 * Returns true if any invitations were accepted.
 */
export async function acceptPendingInvitations(db: DB, email: string, userId: string): Promise<boolean> {
  const pendingInvitations = await db.invitation.findMany({
    where: {
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  for (const invitation of pendingInvitations) {
    await acceptInvitation(db, invitation, userId);
  }

  return pendingInvitations.length > 0;
}
