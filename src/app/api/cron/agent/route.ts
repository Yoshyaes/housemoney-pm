import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { runPeriodicAnalysis, type ScheduleType } from '@/server/ai/agent-engine';

async function handleCron(req: NextRequest) {
  // Auth: Vercel Cron sends CRON_SECRET via Authorization header automatically.
  // Manual calls can use x-cron-secret header or Authorization: Bearer <secret>.
  const cronSecret =
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    req.headers.get('x-cron-secret');

  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Schedule can come from query param (?schedule=daily) or POST body
  const url = new URL(req.url);
  let schedule: ScheduleType = '15min';

  const querySchedule = url.searchParams.get('schedule');
  if (querySchedule && ['15min', 'daily', 'weekly'].includes(querySchedule)) {
    schedule = querySchedule as ScheduleType;
  } else if (req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    if (body.schedule && ['15min', 'daily', 'weekly'].includes(body.schedule)) {
      schedule = body.schedule as ScheduleType;
    }
  }

  const workspaces = await db.workspace.findMany({
    select: { id: true, name: true },
  });

  const results: Array<{ workspaceId: string; name: string; insights: number }> = [];

  for (const workspace of workspaces) {
    try {
      const insights = await runPeriodicAnalysis(workspace.id, schedule);
      results.push({ workspaceId: workspace.id, name: workspace.name, insights });
    } catch (error) {
      console.error(`Agent analysis failed for workspace ${workspace.id}:`, error);
      results.push({ workspaceId: workspace.id, name: workspace.name, insights: -1 });
    }
  }

  const totalInsights = results.reduce((sum, r) => sum + Math.max(0, r.insights), 0);

  return NextResponse.json({
    schedule,
    workspacesProcessed: workspaces.length,
    totalInsightsCreated: totalInsights,
    results,
  });
}

// Vercel Cron calls GET
export async function GET(req: NextRequest) {
  return handleCron(req);
}

// Manual/external scheduler calls POST
export async function POST(req: NextRequest) {
  return handleCron(req);
}
