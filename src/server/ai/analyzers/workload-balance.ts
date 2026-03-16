import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';

export async function analyzeWorkloadBalance(workspaceId: string): Promise<number> {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId, role: { not: 'GUEST' } },
    include: { user: { select: { id: true, name: true } } },
  });

  if (members.length < 2) return 0;

  // Count open tasks per assignee
  const workloads: Array<{ userId: string; name: string; count: number }> = [];

  for (const member of members) {
    const count = await db.task.count({
      where: {
        workspaceId,
        assigneeId: member.userId,
        status: { in: ['TODO', 'IN_PROGRESS', 'IN_REVIEW'] },
      },
    });
    workloads.push({ userId: member.userId, name: member.user.name, count });
  }

  // Calculate mean and standard deviation
  const counts = workloads.map((w) => w.count);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev < 2) return 0; // Not enough variance to flag

  let created = 0;

  // Find overloaded members (>2 std devs above mean)
  const overloaded = workloads.filter((w) => w.count > mean + 2 * stdDev);
  const underloaded = workloads
    .filter((w) => w.count < mean)
    .sort((a, b) => a.count - b.count);

  for (const heavy of overloaded) {
    const lightNames = underloaded
      .slice(0, 3)
      .map((u) => `${u.name} (${u.count} tasks)`)
      .join(', ');

    const workloadSummary = workloads
      .sort((a, b) => b.count - a.count)
      .map((w) => `- ${w.name}: ${w.count} open tasks`)
      .join('\n');

    // Find admins to notify
    const admins = members.filter((m) => m.role === 'ADMIN');
    const notifyUserId = admins[0]?.userId || heavy.userId;

    const id = await createInsight({
      workspaceId,
      type: 'WORKLOAD_IMBALANCE',
      targetUserId: notifyUserId,
      title: `${heavy.name} has ${heavy.count} open tasks — significantly above team average of ${Math.round(mean)}`,
      body: `**Workload imbalance detected**\n\n${heavy.name} has ${heavy.count} open tasks, which is ${(heavy.count - mean).toFixed(0)} above the team average.\n\n**Team workload:**\n${workloadSummary}\n\n${underloaded.length > 0 ? `**Possible redistribution targets:** ${lightNames}` : ''}\n\nConsider redistributing work to balance team capacity.`,
      confidence: 0.8,
    });

    if (id) created++;
  }

  return created;
}
