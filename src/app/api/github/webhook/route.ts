import { db } from '@/server/db';
import crypto from 'crypto';

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  // Verify HMAC signature
  if (!secret || !signature) {
    return new Response('Unauthorized', { status: 401 });
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', secret).update(body).digest('hex');

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    return new Response('Invalid signature', { status: 401 });
  }

  const event = req.headers.get('x-github-event');

  // Only handle pull_request events
  if (event !== 'pull_request') {
    return Response.json({ ok: true, skipped: true });
  }

  let payload: { action?: string; pull_request?: Record<string, unknown>; repository?: { full_name?: string } };
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const { action, pull_request } = payload;
  const repo = payload.repository?.full_name;
  if (!repo || !pull_request) {
    return new Response('Malformed payload', { status: 400 });
  }

  // Optional: restrict to allowlisted repos to prevent cross-repo task manipulation
  const allowedRepos = process.env.GITHUB_ALLOWED_REPOS?.split(',').map((r) => r.trim()).filter(Boolean);
  if (allowedRepos && allowedRepos.length > 0 && !allowedRepos.includes(repo)) {
    console.warn(`[GitHub webhook] Rejected event from unlisted repo: ${repo}`);
    return Response.json({ ok: true, skipped: true });
  }

  // Extract task identifiers from PR title + body
  const text = `${pull_request.title} ${pull_request.body || ''}`;
  const matches = [...text.matchAll(/\bHM-(\d+)\b/gi)];
  const identifiers = [...new Set(matches.map((m: RegExpMatchArray) => `HM-${m[1]}`))];

  if (identifiers.length === 0) {
    return Response.json({ ok: true, linked: 0 });
  }

  let linked = 0;

  for (const identifier of identifiers) {
    const task = await db.task.findUnique({ where: { identifier } });
    if (!task) continue;

    if (['opened', 'reopened', 'edited'].includes(action)) {
      await db.gitHubPR.upsert({
        where: { githubId: pull_request.id },
        create: {
          taskId: task.id,
          githubId: pull_request.id,
          number: pull_request.number,
          repo,
          title: pull_request.title,
          url: pull_request.html_url,
          status: 'OPEN',
          authorLogin: pull_request.user.login,
          authorAvatar: pull_request.user.avatar_url,
        },
        update: {
          title: pull_request.title,
          status: 'OPEN',
          taskId: task.id,
        },
      });

      // Auto-transition: TODO/IN_PROGRESS → IN_REVIEW
      if (['TODO', 'IN_PROGRESS'].includes(task.status)) {
        await db.task.update({
          where: { id: task.id },
          data: { status: 'IN_REVIEW' },
        });
        await db.activity.create({
          data: {
            taskId: task.id,
            userId: task.createdById,
            action: 'status_changed',
            field: 'status',
            oldValue: task.status,
            newValue: 'IN_REVIEW',
          },
        });
      }

      linked++;
    } else if (action === 'closed') {
      const prStatus = pull_request.merged ? 'MERGED' : 'CLOSED';

      await db.gitHubPR.updateMany({
        where: { githubId: pull_request.id },
        data: { status: prStatus },
      });

      // Auto-transition on merge: IN_PROGRESS/IN_REVIEW → DONE
      if (
        pull_request.merged &&
        ['IN_PROGRESS', 'IN_REVIEW'].includes(task.status)
      ) {
        await db.task.update({
          where: { id: task.id },
          data: { status: 'DONE' },
        });
        await db.activity.create({
          data: {
            taskId: task.id,
            userId: task.createdById,
            action: 'status_changed',
            field: 'status',
            oldValue: task.status,
            newValue: 'DONE',
          },
        });
      }

      linked++;
    }
  }

  return Response.json({ ok: true, linked });
}
