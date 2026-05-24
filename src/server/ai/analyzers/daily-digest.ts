import { db } from '@/server/db';
import { createInsight } from '@/server/ai/agent-engine';
import Anthropic from '@anthropic-ai/sdk';

let _anthropic: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function generateDailyDigest(workspaceId: string): Promise<number> {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: { select: { id: true, name: true } } },
  });

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let created = 0;

  for (const member of members) {
    const userId = member.userId;

    // Tasks assigned to user that changed since yesterday
    const changedTasks = await db.activity.findMany({
      where: {
        task: { workspaceId, assigneeId: userId },
        createdAt: { gte: yesterday },
      },
      include: {
        task: { select: { identifier: true, title: true, status: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    // New tasks assigned to the user
    const newAssignments = await db.task.findMany({
      where: {
        workspaceId,
        assigneeId: userId,
        createdAt: { gte: yesterday },
      },
      select: { identifier: true, title: true, priority: true },
    });

    // Tasks due today or this week
    const now = new Date();
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

    const upcomingDue = await db.task.findMany({
      where: {
        workspaceId,
        assigneeId: userId,
        status: { notIn: ['DONE', 'CANCELLED'] },
        dueDate: { lte: endOfWeek },
      },
      select: { identifier: true, title: true, dueDate: true, priority: true },
      orderBy: { dueDate: 'asc' },
    });

    // Resolved blockers
    const resolvedBlockers = await db.activity.findMany({
      where: {
        task: {
          workspaceId,
          blockedBy: { some: { blockedTaskId: { in: await db.task.findMany({ where: { assigneeId: userId, workspaceId }, select: { id: true } }).then(t => t.map(x => x.id)) } } },
        },
        action: 'status_changed',
        newValue: 'DONE',
        createdAt: { gte: yesterday },
      },
      include: {
        task: { select: { identifier: true, title: true } },
      },
      take: 10,
    });

    // Skip digest if nothing happened
    if (changedTasks.length === 0 && newAssignments.length === 0 && upcomingDue.length === 0) {
      continue;
    }

    // Build raw data for Claude to summarize
    const rawData = {
      changes: changedTasks.map((a) => ({
        task: `${a.task.identifier} "${a.task.title}"`,
        action: a.action,
        by: a.user.name,
        field: a.field,
        oldValue: a.oldValue,
        newValue: a.newValue,
      })),
      newAssignments: newAssignments.map((t) => `${t.identifier} "${t.title}" (${t.priority})`),
      upcomingDue: upcomingDue.map((t) => ({
        task: `${t.identifier} "${t.title}"`,
        dueDate: t.dueDate?.toISOString().split('T')[0],
        priority: t.priority,
      })),
      resolvedBlockers: resolvedBlockers.map((a) => `${a.task.identifier} "${a.task.title}"`),
    };

    const response = await anthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are a project management assistant generating a concise daily digest for a team member. Format the digest as clean markdown with these sections (skip empty sections):
- **Your Focus Today** — top 2-3 items to prioritize based on due dates and urgency
- **Changes Since Yesterday** — brief summary of relevant activity
- **Upcoming Deadlines** — tasks due this week
- **Unblocked Tasks** — tasks that are now ready to start

Keep it concise and actionable. Use task identifiers (e.g., HM-42) in the text.`,
      messages: [
        {
          role: 'user',
          content: `Generate a daily digest for ${member.user.name}. Today is ${new Date().toISOString().split('T')[0]}.\n\nRaw data:\n${JSON.stringify(rawData, null, 2)}`,
        },
      ],
    });

    const digestText = response.content[0]?.type === 'text' ? response.content[0].text : 'No updates today.';
    const digestId = `digest-${userId}-${new Date().toISOString().split('T')[0]}`;

    const id = await createInsight({
      workspaceId,
      type: 'DAILY_DIGEST',
      targetUserId: userId,
      title: `Daily digest for ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
      body: digestText,
      confidence: 1.0,
      digestId,
      expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    });

    if (id) created++;
  }

  return created;
}
