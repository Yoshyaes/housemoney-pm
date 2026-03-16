import { db } from '@/server/db';
import type { AgentConfig, Prisma } from '@/generated/prisma/client';
import { analyzeStaleTask } from './analyzers/stale-tasks';
import { analyzeOverdueTasks } from './analyzers/overdue-tasks';
import { analyzeDependencyChain } from './analyzers/dependency-chain';
import { detectDuplicates } from './analyzers/duplicate-detector';
import { generateDailyDigest } from './analyzers/daily-digest';
import { analyzeWorkloadBalance } from './analyzers/workload-balance';
import { suggestDecomposition } from './analyzers/task-decomposer';
import { extractMeetingActions } from './analyzers/meeting-notes';

export interface InsightData {
  workspaceId: string;
  type: 'STALE_TASK' | 'OVERDUE_ESCALATION' | 'DEPENDENCY_UNBLOCKED' | 'WORKLOAD_IMBALANCE' | 'PROJECT_HEALTH_ALERT' | 'DUPLICATE_DETECTED' | 'DECOMPOSITION_SUGGESTED' | 'MEETING_ACTION_ITEMS' | 'DAILY_DIGEST';
  targetUserId?: string;
  taskId?: string;
  projectId?: string;
  documentId?: string;
  title: string;
  body: string;
  confidence?: number;
  proposedAction?: Record<string, unknown>;
  previousState?: Record<string, unknown>;
  digestId?: string;
  expiresAt?: Date;
}

async function getOrCreateConfig(workspaceId: string): Promise<AgentConfig> {
  const existing = await db.agentConfig.findUnique({ where: { workspaceId } });
  if (existing) return existing;

  return db.agentConfig.create({
    data: { workspaceId },
  });
}

export async function createInsight(data: InsightData): Promise<string> {
  const config = await getOrCreateConfig(data.workspaceId);

  // Check daily insight limit
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = await db.agentInsight.count({
    where: {
      workspaceId: data.workspaceId,
      createdAt: { gte: todayStart },
    },
  });

  if (todayCount >= config.maxInsightsPerDay) {
    return '';
  }

  // Check for duplicate insight (same type + task within 24h)
  if (data.taskId) {
    const existing = await db.agentInsight.findFirst({
      where: {
        workspaceId: data.workspaceId,
        type: data.type,
        taskId: data.taskId,
        status: 'PENDING',
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (existing) return existing.id;
  }

  const insight = await db.agentInsight.create({
    data: {
      workspaceId: data.workspaceId,
      type: data.type,
      targetUserId: data.targetUserId,
      taskId: data.taskId,
      projectId: data.projectId,
      documentId: data.documentId,
      title: data.title,
      body: data.body,
      confidence: data.confidence ?? 0.5,
      proposedAction: (data.proposedAction as Prisma.InputJsonValue) ?? undefined,
      previousState: (data.previousState as Prisma.InputJsonValue) ?? undefined,
      digestId: data.digestId,
      expiresAt: data.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // Create a notification for the target user
  if (data.targetUserId) {
    // Find a workspace admin to use as the "actor" for AI notifications
    const adminMember = await db.workspaceMember.findFirst({
      where: { workspaceId: data.workspaceId, role: 'ADMIN' },
      select: { userId: true },
    });

    if (adminMember) {
      await db.notification.create({
        data: {
          userId: data.targetUserId,
          type: 'AI_INSIGHT',
          taskId: data.taskId,
          actorId: adminMember.userId,
          message: data.title,
        },
      });
    }
  }

  return insight.id;
}

export async function applyInsightAction(insightId: string): Promise<boolean> {
  const insight = await db.agentInsight.findUnique({ where: { id: insightId } });
  if (!insight || insight.status !== 'PENDING') return false;

  const action = insight.proposedAction as Record<string, unknown> | null;
  if (!action) {
    await db.agentInsight.update({
      where: { id: insightId },
      data: { status: 'ACCEPTED', actedAt: new Date() },
    });
    return true;
  }

  // Apply the action based on type
  if (action.type === 'update_task' && action.taskId && action.changes) {
    const task = await db.task.findUnique({ where: { id: action.taskId as string } });
    if (!task) return false;

    // Save previous state for undo
    const changes = action.changes as Record<string, unknown>;
    const previousState: Record<string, unknown> = {};
    for (const key of Object.keys(changes)) {
      previousState[key] = (task as Record<string, unknown>)[key];
    }

    await db.task.update({
      where: { id: action.taskId as string },
      data: changes,
    });

    await db.agentInsight.update({
      where: { id: insightId },
      data: {
        status: 'ACCEPTED',
        actedAt: new Date(),
        previousState: previousState as Prisma.InputJsonValue,
      },
    });

    // Log activity
    await db.activity.create({
      data: {
        taskId: action.taskId as string,
        userId: insight.targetUserId || '',
        action: 'ai_suggestion_applied',
        field: Object.keys(changes).join(', '),
        oldValue: JSON.stringify(previousState),
        newValue: JSON.stringify(changes),
      },
    });

    return true;
  }

  await db.agentInsight.update({
    where: { id: insightId },
    data: { status: 'ACCEPTED', actedAt: new Date() },
  });
  return true;
}

export async function revertInsightAction(insightId: string): Promise<boolean> {
  const insight = await db.agentInsight.findUnique({ where: { id: insightId } });
  if (!insight) return false;
  if (insight.status !== 'ACCEPTED' && insight.status !== 'AUTO_APPLIED') return false;

  const action = insight.proposedAction as Record<string, unknown> | null;
  const previousState = insight.previousState as Record<string, unknown> | null;

  if (action?.type === 'update_task' && action.taskId && previousState) {
    await db.task.update({
      where: { id: action.taskId as string },
      data: previousState,
    });
  }

  await db.agentInsight.update({
    where: { id: insightId },
    data: { status: 'REVERTED', actedAt: new Date() },
  });

  return true;
}

export type ScheduleType = '15min' | 'daily' | 'weekly';

export async function runPeriodicAnalysis(
  workspaceId: string,
  schedule: ScheduleType
): Promise<number> {
  const config = await getOrCreateConfig(workspaceId);
  let insightsCreated = 0;

  if (schedule === '15min' || schedule === 'daily') {
    // Stale task detection (runs on both 15min and daily)
    insightsCreated += await analyzeStaleTask(workspaceId, config);

    // Overdue task escalation
    if (config.overdueEnabled) {
      insightsCreated += await analyzeOverdueTasks(workspaceId);
    }
  }

  if (schedule === 'daily') {
    // Daily digest
    if (config.digestEnabled) {
      insightsCreated += await generateDailyDigest(workspaceId);
    }
  }

  if (schedule === 'weekly') {
    // Workload balance
    if (config.workloadAlerts) {
      insightsCreated += await analyzeWorkloadBalance(workspaceId);
    }
  }

  return insightsCreated;
}

export async function handleTaskCreated(
  taskId: string,
  workspaceId: string
): Promise<void> {
  const config = await getOrCreateConfig(workspaceId);

  if (config.duplicateCheck) {
    await detectDuplicates(taskId, workspaceId).catch(() => {});
  }

  // Check for decomposition suggestion
  const task = await db.task.findUnique({ where: { id: taskId } });
  if (task?.description && task.description.length > config.decomposeThreshold) {
    await suggestDecomposition(taskId, workspaceId).catch(() => {});
  }
}

export async function handleTaskCompleted(
  taskId: string,
  workspaceId: string
): Promise<void> {
  const config = await getOrCreateConfig(workspaceId);
  await analyzeDependencyChain(taskId, workspaceId, config.autoUnblock).catch(() => {});
}

export async function handleMeetingNotesSaved(
  documentId: string,
  workspaceId: string
): Promise<void> {
  await extractMeetingActions(documentId, workspaceId).catch(() => {});
}
