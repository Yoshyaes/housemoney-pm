import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';

export async function analyzeDependencyChain(
  completedTaskId: string,
  workspaceId: string,
  autoUnblock: boolean
): Promise<number> {
  // Find all tasks that were blocked by the completed task
  const dependencies = await db.dependency.findMany({
    where: { blockingTaskId: completedTaskId },
    include: {
      blockedTask: {
        include: {
          assignee: { select: { id: true, name: true } },
          blockedBy: {
            include: {
              blockingTask: { select: { id: true, status: true, identifier: true } },
            },
          },
        },
      },
      blockingTask: { select: { identifier: true, title: true } },
    },
  });

  let created = 0;

  for (const dep of dependencies) {
    const blockedTask = dep.blockedTask;

    // Check if ALL blockers are now resolved (DONE or CANCELLED)
    const remainingBlockers = blockedTask.blockedBy.filter(
      (d) => d.blockingTask.status !== 'DONE' && d.blockingTask.status !== 'CANCELLED'
    );

    if (remainingBlockers.length > 0) continue;

    // This task is now fully unblocked
    if (autoUnblock && (blockedTask.status === 'BACKLOG' || blockedTask.status === 'TODO')) {
      // Auto-move to TODO if in BACKLOG
      const newStatus = blockedTask.status === 'BACKLOG' ? 'TODO' : blockedTask.status;

      if (newStatus !== blockedTask.status) {
        await db.task.update({
          where: { id: blockedTask.id },
          data: { status: newStatus },
        });

        await db.activity.create({
          data: {
            taskId: blockedTask.id,
            userId: blockedTask.assigneeId || '',
            action: 'ai_auto_unblock',
            field: 'status',
            oldValue: blockedTask.status,
            newValue: newStatus,
          },
        });
      }

      const id = await createInsight({
        workspaceId,
        type: 'DEPENDENCY_UNBLOCKED',
        targetUserId: blockedTask.assigneeId ?? undefined,
        taskId: blockedTask.id,
        title: `${blockedTask.identifier} is now unblocked and ready to start`,
        body: `**${blockedTask.identifier}** "${blockedTask.title}" was unblocked when ${dep.blockingTask.identifier} "${dep.blockingTask.title}" was completed.\n\nAll blockers are resolved. The task has been automatically moved to TODO.`,
        confidence: 0.95,
        proposedAction: {
          type: 'update_task',
          taskId: blockedTask.id,
          changes: { status: newStatus },
        },
        previousState: { status: blockedTask.status },
      });

      if (id) created++;
    } else {
      // Just notify — suggest action
      const id = await createInsight({
        workspaceId,
        type: 'DEPENDENCY_UNBLOCKED',
        targetUserId: blockedTask.assigneeId ?? undefined,
        taskId: blockedTask.id,
        title: `${blockedTask.identifier} is now unblocked`,
        body: `**${blockedTask.identifier}** "${blockedTask.title}" was unblocked when ${dep.blockingTask.identifier} "${dep.blockingTask.title}" was completed.\n\nAll blockers are resolved — this task is ready to move forward.`,
        confidence: 0.95,
        proposedAction:
          blockedTask.status === 'BACKLOG'
            ? {
                type: 'update_task',
                taskId: blockedTask.id,
                changes: { status: 'TODO' },
              }
            : undefined,
        previousState:
          blockedTask.status === 'BACKLOG'
            ? { status: blockedTask.status }
            : undefined,
      });

      if (id) created++;
    }
  }

  return created;
}
