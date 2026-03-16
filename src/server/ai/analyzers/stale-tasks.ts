import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';
import type { AgentConfig } from '@/generated/prisma/client';

export async function analyzeStaleTask(
  workspaceId: string,
  config: AgentConfig
): Promise<number> {
  const staleDays = config.staleTaskDays;
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);

  // Find tasks that are IN_PROGRESS or IN_REVIEW but haven't been updated
  const staleTasks = await db.task.findMany({
    where: {
      workspaceId,
      status: { in: ['IN_PROGRESS', 'IN_REVIEW'] },
      updatedAt: { lt: cutoff },
    },
    include: {
      assignee: { select: { id: true, name: true } },
      activities: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true, action: true },
      },
    },
  });

  let created = 0;

  for (const task of staleTasks) {
    // Double-check: was there any recent activity?
    const lastActivity = task.activities[0];
    if (lastActivity && lastActivity.createdAt > cutoff) {
      continue;
    }

    const daysSinceUpdate = Math.floor(
      (Date.now() - task.updatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    const assigneeName = task.assignee?.name || 'Unassigned';

    const id = await createInsight({
      workspaceId,
      type: 'STALE_TASK',
      targetUserId: task.assigneeId ?? undefined,
      taskId: task.id,
      projectId: task.projectId ?? undefined,
      title: `${task.identifier} has been ${task.status === 'IN_PROGRESS' ? 'in progress' : 'in review'} for ${daysSinceUpdate} days`,
      body: `**${task.identifier}** "${task.title}" assigned to ${assigneeName} has had no activity for ${daysSinceUpdate} days.\n\nConsider checking in on progress, re-prioritizing, or moving back to the backlog if it's blocked.`,
      confidence: daysSinceUpdate > staleDays * 2 ? 0.9 : 0.7,
      proposedAction: {
        type: 'update_task',
        taskId: task.id,
        changes: { status: 'TODO' },
      },
      previousState: { status: task.status },
    });

    if (id) created++;
  }

  return created;
}
