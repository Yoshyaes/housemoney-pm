import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';

export async function analyzeOverdueTasks(workspaceId: string): Promise<number> {
  const now = new Date();

  const overdueTasks = await db.task.findMany({
    where: {
      workspaceId,
      dueDate: { lt: now },
      status: { notIn: ['DONE', 'CANCELLED'] },
    },
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  let created = 0;

  for (const task of overdueTasks) {
    const daysOverdue = Math.floor(
      (now.getTime() - task.dueDate!.getTime()) / (1000 * 60 * 60 * 24)
    );

    const severity = daysOverdue > 7 ? 'critical' : daysOverdue > 3 ? 'high' : 'moderate';
    const confidence = daysOverdue > 7 ? 0.95 : daysOverdue > 3 ? 0.85 : 0.7;

    const assigneeName = task.assignee?.name || 'Unassigned';
    const projectName = task.project?.name;

    const id = await createInsight({
      workspaceId,
      type: 'OVERDUE_ESCALATION',
      targetUserId: task.assigneeId ?? undefined,
      taskId: task.id,
      projectId: task.projectId ?? undefined,
      title: `${task.identifier} is ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`,
      body: `**${task.identifier}** "${task.title}" was due ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago (${severity} severity).\n\nAssigned to: ${assigneeName}${projectName ? `\nProject: ${projectName}` : ''}\nStatus: ${task.status}\n\nConsider updating the due date or escalating if this is blocking other work.`,
      confidence,
    });

    if (id) created++;
  }

  return created;
}
