import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // Create workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'house-money' },
    update: {},
    create: {
      name: 'House Money',
      slug: 'house-money',
      taskCounter: 35,
    },
  });

  // Create users
  const users = [
    { id: 'user-fred', email: 'fred@housemoney.com', name: 'Fred Thompson', avatarColor: '#BA7517' },
    { id: 'user-sarah', email: 'sarah@housemoney.com', name: 'Sarah Evans', avatarColor: '#185FA5' },
    { id: 'user-marcus', email: 'marcus@housemoney.com', name: 'Marcus Kim', avatarColor: '#0F6E56' },
    { id: 'user-priya', email: 'priya@housemoney.com', name: 'Priya Lal', avatarColor: '#99355A' },
    { id: 'user-jordan', email: 'jordan@housemoney.com', name: 'Jordan Osei', avatarColor: '#534AB7' },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: user,
    });

    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: user.id,
        role: user.id === 'user-fred' ? 'ADMIN' : 'MEMBER',
      },
    });
  }

  // Create labels
  const labelDefs = [
    { name: 'Feature', color: '#185FA5', bgColor: 'rgba(53,138,221,.12)' },
    { name: 'Infra', color: '#0F6E56', bgColor: 'rgba(29,158,117,.12)' },
    { name: 'Design', color: '#99355A', bgColor: 'rgba(212,83,126,.12)' },
    { name: 'Docs', color: '#534AB7', bgColor: 'rgba(127,119,221,.12)' },
  ];

  const labels: Record<string, string> = {};
  for (const l of labelDefs) {
    const label = await prisma.label.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: l.name } },
      update: {},
      create: { workspaceId: workspace.id, ...l },
    });
    labels[l.name] = label.id;
  }

  // Create projects
  const projectDefs = [
    { name: 'DocuForge API', color: '#1D9E75', status: 'ACTIVE' as const },
    { name: 'Property Pilot', color: '#BA7517', status: 'ACTIVE' as const },
    { name: 'HM App', color: '#7F77DD', status: 'ACTIVE' as const },
  ];

  const projects: Record<string, string> = {};
  for (const p of projectDefs) {
    const project = await prisma.project.upsert({
      where: { id: `proj-${p.name.toLowerCase().replace(/\s+/g, '-')}` },
      update: {},
      create: { id: `proj-${p.name.toLowerCase().replace(/\s+/g, '-')}`, workspaceId: workspace.id, ...p },
    });
    projects[p.name] = project.id;
  }

  // Create tasks matching the mockup
  const taskDefs = [
    { identifier: 'HM-04', title: 'API rate limit docs', status: 'DONE' as const, priority: 'LOW' as const, assigneeId: 'user-fred', projectId: projects['DocuForge API'], labels: ['Docs'] },
    { identifier: 'HM-06', title: 'Brand system v1', status: 'DONE' as const, priority: 'MEDIUM' as const, assigneeId: 'user-priya', projectId: projects['DocuForge API'], labels: ['Design'] },
    { identifier: 'HM-07', title: 'DB schema v1', status: 'DONE' as const, priority: 'HIGH' as const, assigneeId: 'user-marcus', projectId: projects['DocuForge API'], labels: ['Infra'] },
    { identifier: 'HM-08', title: 'PDF export config', status: 'IN_PROGRESS' as const, priority: 'HIGH' as const, assigneeId: 'user-fred', projectId: projects['DocuForge API'], labels: ['Feature'], dueDate: new Date('2025-06-18') },
    { identifier: 'HM-11', title: 'Base template system', status: 'DONE' as const, priority: 'HIGH' as const, assigneeId: 'user-sarah', projectId: projects['DocuForge API'], labels: ['Infra'] },
    { identifier: 'HM-12', title: 'Webhook retry logic', status: 'TODO' as const, priority: 'HIGH' as const, assigneeId: 'user-fred', projectId: projects['DocuForge API'], labels: ['Infra'], dueDate: new Date('2025-06-20') },
    { identifier: 'HM-15', title: 'API auth middleware', status: 'IN_REVIEW' as const, priority: 'HIGH' as const, assigneeId: 'user-marcus', projectId: projects['DocuForge API'], labels: ['Infra'], dueDate: new Date('2025-06-13') },
    { identifier: 'HM-18', title: 'Stripe Connect integration', status: 'IN_PROGRESS' as const, priority: 'URGENT' as const, assigneeId: 'user-fred', projectId: projects['DocuForge API'], labels: ['Feature'], dueDate: new Date('2025-06-15') },
    { identifier: 'HM-21', title: 'Rate limit dashboard', status: 'BACKLOG' as const, priority: 'MEDIUM' as const, assigneeId: 'user-sarah', projectId: projects['DocuForge API'], labels: ['Feature'] },
    { identifier: 'HM-24', title: 'PDF merge endpoint', status: 'TODO' as const, priority: 'HIGH' as const, assigneeId: 'user-sarah', projectId: projects['DocuForge API'], labels: ['Feature'], dueDate: new Date('2025-06-19') },
    { identifier: 'HM-27', title: 'Auth token refresh', status: 'IN_PROGRESS' as const, priority: 'MEDIUM' as const, assigneeId: 'user-sarah', projectId: projects['DocuForge API'], labels: ['Infra'], dueDate: new Date('2025-06-17') },
    { identifier: 'HM-29', title: 'CI/CD pipeline', status: 'IN_PROGRESS' as const, priority: 'HIGH' as const, assigneeId: 'user-marcus', projectId: projects['DocuForge API'], labels: ['Infra'], dueDate: new Date('2025-06-14') },
    { identifier: 'HM-31', title: 'Component library setup', status: 'IN_REVIEW' as const, priority: 'HIGH' as const, assigneeId: 'user-priya', projectId: projects['DocuForge API'], labels: ['Design'], dueDate: new Date('2025-06-13') },
    { identifier: 'HM-33', title: 'Mobile nav redesign', status: 'TODO' as const, priority: 'MEDIUM' as const, assigneeId: 'user-priya', projectId: projects['HM App'], labels: ['Design'], dueDate: new Date('2025-06-22') },
    { identifier: 'HM-35', title: 'Tenant portal API', status: 'IN_PROGRESS' as const, priority: 'HIGH' as const, assigneeId: 'user-marcus', projectId: projects['DocuForge API'], labels: ['Feature'] },
  ];

  for (const t of taskDefs) {
    const { labels: labelNames, ...taskData } = t;
    const task = await prisma.task.upsert({
      where: { identifier: t.identifier },
      update: {},
      create: {
        ...taskData,
        workspaceId: workspace.id,
        description: getDescription(t.identifier),
        createdById: 'user-fred',
      },
    });

    // Add labels
    for (const labelName of labelNames) {
      const labelId = labels[labelName];
      if (labelId) {
        await prisma.taskLabel.upsert({
          where: { taskId_labelId: { taskId: task.id, labelId } },
          update: {},
          create: { taskId: task.id, labelId },
        });
      }
    }
  }

  // Create dependencies from mockup
  // HM-18 blocks HM-24, HM-15 blocks HM-24
  const hm18 = await prisma.task.findUnique({ where: { identifier: 'HM-18' } });
  const hm15 = await prisma.task.findUnique({ where: { identifier: 'HM-15' } });
  const hm24 = await prisma.task.findUnique({ where: { identifier: 'HM-24' } });

  if (hm18 && hm24) {
    await prisma.dependency.upsert({
      where: { blockingTaskId_blockedTaskId: { blockingTaskId: hm18.id, blockedTaskId: hm24.id } },
      update: {},
      create: { blockingTaskId: hm18.id, blockedTaskId: hm24.id },
    });
  }

  if (hm15 && hm24) {
    await prisma.dependency.upsert({
      where: { blockingTaskId_blockedTaskId: { blockingTaskId: hm15.id, blockedTaskId: hm24.id } },
      update: {},
      create: { blockingTaskId: hm15.id, blockedTaskId: hm24.id },
    });
  }

  // Create sample comments
  if (hm18) {
    await prisma.comment.create({
      data: {
        taskId: hm18.id,
        authorId: 'user-fred',
        body: 'Stripe sandbox keys are in Vercel env. Test with the staging webhook endpoint.',
      },
    }).catch(() => {}); // Ignore if already exists

    await prisma.comment.create({
      data: {
        taskId: hm18.id,
        authorId: 'user-marcus',
        body: 'Middleware is in review — once that merges, we can unblock HM-24. Should be clear EOD.',
      },
    }).catch(() => {});
  }

  // Create sample saved views
  await prisma.view.create({
    data: {
      workspaceId: workspace.id,
      ownerId: 'user-fred',
      name: 'Blocked tasks',
      scope: 'WORKSPACE',
      filters: [{ field: 'isBlocked', operator: 'is', value: true }],
      sort: [{ field: 'priority', direction: 'asc' }],
      displayType: 'list',
    },
  }).catch(() => {});

  await prisma.view.create({
    data: {
      workspaceId: workspace.id,
      ownerId: 'user-fred',
      name: 'This sprint',
      scope: 'WORKSPACE',
      filters: [{ field: 'status', operator: 'isNot', value: ['DONE', 'CANCELLED'] }],
      sort: [{ field: 'priority', direction: 'asc' }],
      displayType: 'board',
    },
  }).catch(() => {});

  await prisma.view.create({
    data: {
      workspaceId: workspace.id,
      ownerId: 'user-fred',
      name: "Sarah's work",
      scope: 'PERSONAL',
      filters: [{ field: 'assigneeId', operator: 'is', value: 'user-sarah' }],
      sort: [{ field: 'priority', direction: 'asc' }],
      displayType: 'list',
    },
  }).catch(() => {});

  console.log('Seed complete!');
}

function getDescription(identifier: string): string {
  const descriptions: Record<string, string> = {
    'HM-08': 'Add user-configurable margins, headers, and footers to the PDF export config endpoint. Referenced in the tenant portal sprint.',
    'HM-12': 'Implement exponential backoff for failed webhook deliveries with configurable max retries. Required before beta launch.',
    'HM-15': 'JWT verification middleware with workspace-scoped RLS enforcement. Blocks HM-24 (PDF merge endpoint).',
    'HM-18': 'Full Stripe Connect flow: create connected accounts, handle webhooks for payment events, payout scheduling. P0 for monetization.',
    'HM-24': 'POST /v1/pdfs/merge — accepts array of document IDs and merge config. Blocked on auth middleware completion.',
    'HM-27': 'Sliding session refresh logic — re-auth on token expiry without logging user out. Covers edge cases for long-running PDF jobs.',
    'HM-29': 'GitHub Actions: lint + typecheck + Prisma migrate on PR, auto-deploy to Vercel on merge to main. Staging env on preview URLs.',
    'HM-31': 'shadcn/ui base + House Money design tokens (colors, spacing, type). Covers all P0 components for DocuForge dashboard.',
    'HM-33': 'Redesign bottom navigation for the HM App. Must support 5 primary tabs with clear active states. Figma file linked.',
  };
  return descriptions[identifier] || '';
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
