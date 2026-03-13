# House Money — Project Management System PRD

## Executive Summary

House Money needs an internal project management system built specifically for a 5-person cross-functional team (engineering, design, PM, ops). The goal is a Linear-speed, Asana-simple web app that handles the full task lifecycle — from backlog to shipped — with swimlanes, dependencies, dynamic views, and a comments system. No bloat. No configuration tax. It should feel native to the way the team already works.

---

## Problem Statement

The House Money team is juggling DocuForge development, Property Pilot rollout, and multiple operational workstreams simultaneously. Off-the-shelf tools create one of two problems:

- **Too heavy (Jira, ClickUp):** 5+ second page loads, hundreds of configuration options, and a learning curve that eats sprint time. ClickUp tasks can take 30–120 seconds to update status. Jira requires tutorials before a new hire can file a ticket.
- **Too light (Notion, Trello):** No dependencies, no timeline view, no grouping logic, and no structured workflow state. Fine for one project; breaks down across multiple parallel tracks.

The team needs a tool that loads in under 100ms, takes under 10 minutes to onboard, and handles swimlanes + dependencies as first-class citizens — not add-ons.

---

## Solution Overview

A web-first project management application built for House Money's internal team. The system centers on a **local-first sync architecture** (optimistic updates, sub-100ms interactions), a **Cmd+K command palette** as the universal entry point, and four core views: **Board (with swimlanes), List, Timeline, and Inbox**. Tasks are the atomic unit. Projects group tasks. Labels and dynamic views handle cross-cutting organization.

Phase 2 adds a mobile-responsive layer and AI features (natural language task creation, auto-prioritization). Phase 3 adds Slack integration and automation rules.

---

## Target Users

**Primary:** The House Money core team — 1 PM (Fred), 2 engineers, 1 designer, 1 ops person. All are technically literate. None want to spend time configuring a tool.

**Secondary:** External collaborators or contractors who may need read-only guest access to specific projects (Phase 3).

---

## Core Features

### Phase 1: MVP (Weeks 1–4)

| Feature | Description | Priority | Complexity |
|---|---|---|---|
| Task CRUD | Create/edit/delete tasks with title, assignee, status, priority, due date, description (Markdown), labels | P0 | Low |
| Board View + Swimlanes | Kanban board with status columns; secondary grouping (swimlanes) by assignee, priority, or label. Collapsible rows with item counts | P0 | Med |
| List View | Dense sortable table of all tasks with inline editing | P0 | Low |
| Task Dependencies | `blocks` / `blocked-by` relations. Blocked tasks show badge indicator on card. Filterable | P0 | Med |
| Tags / Labels | Flat, color-coded labels. Workspace-wide. Multi-select per task | P0 | Low |
| Comments + @mentions | Flat chronological thread per task. Rich text (Markdown), file attachments, emoji reactions. Auto-notify assignee + @mentioned users only | P0 | Med |
| Dynamic Views | Save filter/sort/group configs as named views. Views update in real-time as task properties change | P0 | Med |
| Cmd+K Command Palette | Global fuzzy search and action launcher. Context-aware. Shows keyboard shortcuts inline | P0 | Med |
| Keyboard Navigation | Single-key shortcuts: `C` create, `X` select, `J/K` navigate, `G+I` inbox, `G+B` board | P0 | Low |
| Notification Inbox | Centralized in-app inbox. Snooze, archive, inline action. Subscribe on: assigned, @mentioned, created | P0 | Med |
| Auth + User Profiles | Email/password auth + Google OAuth. Avatar, name, role | P0 | Low |
| Projects | Named containers grouping tasks. Status (active/paused/complete), target date, auto-calculated progress | P0 | Low |

### Phase 2: Enhancement (Weeks 5–8)

| Feature | Description | Priority | Complexity |
|---|---|---|---|
| Timeline View | Simplified Gantt: task bars on time axis, drag-to-reschedule, dependency arrows, "today" line, milestone markers. Zoom: day → quarter. Pure div/SVG implementation with 4 zoom levels, pointer-event drag, S-curve dependency arrows, auto-scroll to today | P0 | High | ✅ Done |
| Full-Text Search | Server-side pg_trgm search across tasks, comments, projects. GIN indexes, tRPC search router, debounced Cmd+K integration with categorized results and match highlighting. Falls back to ILIKE for short queries | P1 | Med | ✅ Done |
| GitHub Integration | Link PRs to tasks via webhook. Auto-update task status via PR lifecycle (opened → IN_REVIEW, merged → DONE). HMAC-SHA256 verified webhook, GitHubPR model with status tracking, PR list in task detail panel with author avatars and external links | P1 | Med | ✅ Done |
| Activity Log | Append-only audit trail per task: who changed what, when, old→new value. Toggled separately from comments | P1 | Low | ✅ Done |
| Dark Mode | First-class dark theme. Persisted per user. ThemeProvider with light/dark/system toggle, localStorage persistence, 20 components updated with dark: classes | P1 | Low | ✅ Done |
| Mobile Responsive | All views adapt to mobile viewport. Collapsible sidebar with hamburger menu + overlay, full-screen task detail panel, bottom-sheet create modal, horizontally scrollable filter bar, compact topbar with + button, full-screen notification inbox. Overscroll-behavior disabled on mobile for drag safety | P1 | Med | ✅ Done |

### Phase 3: Scale (Weeks 9–12)

| Feature | Description | Priority | Complexity |
|---|---|---|---|
| AI Task Creation | Natural language: "Create a high-priority bug for the payment flow, assign to Sarah, due Friday" | P1 | Med |
| AI Auto-Triage | Suggest priority, labels, and assignee from task title using LLM inference | P2 | Med |
| Slack Integration | Create/update tasks from Slack messages. Push notifications to Slack channels | P1 | Med |
| Automation Rules | If-then rules (e.g., "When status → Done, notify PM"). Max 10 rules to prevent over-engineering | P2 | High |
| Guest Access | Read-only view for external collaborators scoped to specific projects | P2 | Med |
| Email Digest | Smart daily/weekly digest. Skip if already read in-app. Respect work hours for non-urgent items | P2 | Low |

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────┐
│              Next.js App                │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │  React UI   │  │  Local IndexedDB │  │
│  │  (Tailwind) │  │  (Sync Cache)    │  │
│  └──────┬──────┘  └────────┬─────────┘  │
│         │    Optimistic    │            │
│         │    Updates       │            │
└─────────┼──────────────────┼────────────┘
          │                  │ WebSocket
          ▼                  ▼
   ┌──────────────────────────────┐
   │     Next.js API Routes       │
   │   (tRPC or REST endpoints)   │
   └──────────────┬───────────────┘
                  │
         ┌────────┴─────────┐
         ▼                  ▼
   ┌──────────┐      ┌──────────────┐
   │ Postgres │      │  Redis       │
   │ (Supabase│      │  (Pub/Sub    │
   │  hosted) │      │  for WS)     │
   └──────────┘      └──────────────┘
```

**Local-first sync model:** Every workspace entity is cached in browser IndexedDB via a lightweight sync engine. Reads always come from local cache (sub-50ms). Writes are optimistic — UI updates immediately, then syncs to server via WebSocket. Conflicts resolved with Last-Write-Wins on scalar fields.

### Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React | SSR for first load speed, React for component model, large ecosystem |
| Styling | Tailwind CSS + shadcn/ui | Fast iteration, consistent design tokens, accessible components out of the box |
| State / Sync | Zustand + custom IndexedDB sync layer | Lightweight state management; IndexedDB gives local-first read performance |
| Real-time | Supabase Realtime (WebSocket) | Built on Postgres logical replication; free tier covers House Money's scale |
| Backend API | Next.js API Routes + tRPC | Type-safe end-to-end, eliminates REST boilerplate, auto-generates TypeScript types |
| Database | Supabase (Postgres) | Managed Postgres, free tier generous, built-in auth, Row-Level Security for future guest access |
| ORM | Prisma | Type-safe DB queries, migration management, readable schema |
| Auth | Supabase Auth | Email/password + Google OAuth; JWT tokens; integrates with RLS |
| File Storage | Supabase Storage | Comment attachments; free tier covers small team |
| Search | Postgres full-text search (pg_trgm) | Sufficient at this scale; avoids a separate search service |
| AI (Phase 3) | Anthropic Claude API | Natural language task creation and auto-triage |
| Deployment | Vercel | Zero-config Next.js deploy, edge functions, automatic preview URLs |
| CI/CD | GitHub Actions | Lint, test, type-check on every PR; auto-deploy to Vercel on merge |

**Why not Jira/ClickUp API wrappers?** Building on top of another PM tool's API means inheriting their data model limitations. A custom build on Supabase + Next.js gives full control, costs ~$0/month at this scale, and can be shipped in 4 weeks.

**Why Supabase over PlanetScale/Neon?** Supabase bundles auth, realtime, storage, and Postgres in one platform. For a 5-person team, the operational simplicity is worth the trade-off vs. best-of-breed each service.

### Data Model

```prisma
model Workspace {
  id        String   @id @default(cuid())
  name      String
  slug      String   @unique
  createdAt DateTime @default(now())
  teams     Team[]
  projects  Project[]
  labels    Label[]
  members   WorkspaceMember[]
}

model WorkspaceMember {
  id          String    @id @default(cuid())
  workspaceId String
  userId      String
  role        Role      @default(MEMBER)   // ADMIN | MEMBER
  workspace   Workspace @relation(fields: [workspaceId], references: [id])
  user        User      @relation(fields: [userId], references: [id])
}

model Project {
  id          String        @id @default(cuid())
  workspaceId String
  name        String
  description String?
  status      ProjectStatus @default(ACTIVE)  // ACTIVE | PAUSED | COMPLETED
  targetDate  DateTime?
  createdAt   DateTime      @default(now())
  tasks       Task[]
  workspace   Workspace     @relation(fields: [workspaceId], references: [id])
}

model Task {
  id           String       @id @default(cuid())
  identifier   String       @unique   // e.g. "HM-42"
  title        String
  description  String?      // Markdown
  status       TaskStatus   @default(BACKLOG)
  priority     Priority     @default(NONE)
  projectId    String?
  assigneeId   String?
  dueDate      DateTime?
  createdById  String
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  project      Project?     @relation(fields: [projectId], references: [id])
  assignee     User?        @relation("assignee", fields: [assigneeId], references: [id])
  createdBy    User         @relation("creator", fields: [createdById], references: [id])
  labels       TaskLabel[]
  comments     Comment[]
  activities   Activity[]
  blocking     Dependency[] @relation("blocking")
  blockedBy    Dependency[] @relation("blockedBy")
}

model Dependency {
  id             String @id @default(cuid())
  blockingTaskId String
  blockedTaskId  String
  blockingTask   Task   @relation("blocking", fields: [blockingTaskId], references: [id])
  blockedTask    Task   @relation("blockedBy", fields: [blockedTaskId], references: [id])
  @@unique([blockingTaskId, blockedTaskId])
}

model Comment {
  id          String   @id @default(cuid())
  taskId      String
  authorId    String
  body        String   // Markdown
  createdAt   DateTime @default(now())
  task        Task     @relation(fields: [taskId], references: [id])
  author      User     @relation(fields: [authorId], references: [id])
}

model Label {
  id          String      @id @default(cuid())
  workspaceId String
  name        String
  color       String      // hex
  workspace   Workspace   @relation(fields: [workspaceId], references: [id])
  tasks       TaskLabel[]
}

model Activity {
  id        String   @id @default(cuid())
  taskId    String
  userId    String
  action    String   // "status_changed", "assigned", "priority_changed", etc.
  field     String?
  oldValue  String?
  newValue  String?
  createdAt DateTime @default(now())
  task      Task     @relation(fields: [taskId], references: [id])
  user      User     @relation(fields: [userId], references: [id])
}

model View {
  id          String   @id @default(cuid())
  workspaceId String
  ownerId     String
  name        String
  scope       ViewScope @default(PERSONAL)  // PERSONAL | WORKSPACE
  filters     Json     // [{ field, operator, value }]
  sort        Json     // [{ field, direction }]
  groupBy     String?
  swimlaneBy  String?
  displayType String   // "board" | "list" | "timeline"
  createdAt   DateTime @default(now())
}

enum TaskStatus  { BACKLOG TODO IN_PROGRESS IN_REVIEW DONE CANCELLED }
enum Priority    { URGENT HIGH MEDIUM LOW NONE }
enum ProjectStatus { ACTIVE PAUSED COMPLETED }
enum Role        { ADMIN MEMBER }
enum ViewScope   { PERSONAL WORKSPACE }
```

### API Specifications (tRPC Routers)

```
tasks.create        POST   Create task with all fields
tasks.update        PATCH  Update any task field (triggers optimistic update)
tasks.delete        DELETE Soft delete (sets cancelled status)
tasks.list          GET    Query with filters, sort, group, pagination
tasks.get           GET    Single task with comments + dependencies + activity

projects.create     POST
projects.list       GET
projects.update     PATCH

comments.create     POST   Triggers @mention notifications
comments.delete     DELETE Author-only

dependencies.add    POST   Add blocks/blocked-by relation
dependencies.remove DELETE

views.save          POST   Persist a named view config
views.list          GET

notifications.list  GET    Paginated inbox
notifications.markRead  PATCH
notifications.snooze    PATCH

search.global       GET    Full-text across tasks + comments + projects
```

### Third-Party Integrations

| Service | Purpose | Cost |
|---|---|---|
| Supabase | Postgres DB + Auth + Realtime + Storage | $0 (free tier covers <500MB + 50k MAU) |
| Vercel | Hosting + CI/CD | $0 (hobby) → $20/mo (pro, when needed) |
| GitHub Actions | CI pipeline | $0 (public repo or 2k min/mo free) |
| Anthropic API (Phase 3) | AI task creation + triage | ~$5–20/mo at team scale |
| Slack API (Phase 3) | Notifications + task creation | $0 |
| **Total Phase 1** | | **~$0/mo** |

---

## User Flows

### Creating a Task

1. User presses `C` from anywhere in the app (or opens Cmd+K → "Create task")
2. Modal appears: title field is auto-focused
3. User types task title, presses Tab to cycle through: Project → Assignee → Priority → Due Date → Labels
4. User presses Enter or clicks "Create"
5. Task appears immediately in the active view (optimistic update)
6. Task syncs to server; identifier assigned (e.g., HM-43)
7. Assignee receives in-app notification

### Working with the Board + Swimlanes

1. User navigates to Board view (`G+B`)
2. Default: columns = workflow statuses, no swimlanes
3. User clicks "Group by" → selects "Assignee"
4. Board re-renders with horizontal swimlane rows, one per assignee
5. User drags a card from one column to another → status updates optimistically
6. User collapses a swimlane row by clicking the row header → stores collapse state locally

### Adding a Dependency

1. User opens a task detail panel (click task or `Enter` on selected card)
2. User clicks "+ Add dependency" in the Dependencies section
3. Type-ahead search appears: user searches for blocking task by title or identifier
4. User selects the blocking task → relation created: Task A "blocked by" Task B
5. Task A card now displays a 🔗 dependency badge in all views
6. User can filter "show only unblocked tasks" from the filter bar

### Saving a Dynamic View

1. User applies filters: Assignee = "Sarah", Priority = "Urgent" or "High", Status ≠ "Done"
2. User clicks "Save view" → names it "Sarah's Active Work"
3. View appears in left sidebar under "Saved Views"
4. View updates in real-time as tasks match or stop matching the filter criteria

### Commenting + @mentions

1. User opens task detail panel → scrolls to Comments section
2. User types comment in Markdown-aware input
3. User types `@` → name dropdown appears, user selects teammate
4. User submits → comment appears immediately (optimistic)
5. @mentioned user receives in-app notification (and email if not read within 15 min)
6. Notification includes comment preview and one-click "Open task" action

---

## Non-Functional Requirements

### Performance
- Task list render: < 50ms (reads from local IndexedDB cache)
- Page navigation: < 100ms (local-first; no server round-trip for reads)
- Server sync latency: < 500ms P95 for writes
- Board drag-and-drop: 60fps, no jank
- Search results: < 200ms from keystroke

### Security
- Authentication: Supabase JWT tokens; refresh handled automatically
- Session management: 7-day sliding session; re-auth on sensitive actions
- Data isolation: Workspace-scoped queries enforced at API layer + Postgres RLS
- File attachments: Stored in Supabase Storage with signed URLs; no public access
- No PII in logs

### Scalability
- Phase 1 target: 5 concurrent users, <1,000 tasks
- Architecture supports 100+ users with same stack (Supabase scales to millions of rows)
- Local-first sync means read load doesn't scale linearly with users

### Accessibility
- WCAG 2.1 AA minimum
- Full keyboard navigation for all primary flows
- Screen reader labels on all interactive elements
- Focus traps in modals; focus returns to trigger on close

---

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Daily Active Usage | 5/5 team members using daily by Week 2 | Supabase auth logs |
| Task Creation Time | < 10 seconds from intent to created task | Client-side timing events |
| Onboarding Time | New team member fully onboarded in < 10 min | Manual testing |
| Page Load (P95) | < 100ms for in-app navigation | Vercel Analytics |
| Zero Configuration | Team uses default workflow without customization | Qualitative check at Week 2 |
| Tool Abandonment | 0 team members reverting to Notion/Asana by Week 4 | Qualitative check |

---

## Cost Estimates

### Development (Cursor / Claude Code)

| Phase | Scope | Est. Hours |
|---|---|---|
| Phase 1 MVP | Auth, board, list, tasks, comments, dependencies, views, Cmd+K, notifications | 60–80 hrs |
| Phase 2 | Timeline view, search, GitHub integration, dark mode, mobile | 40–50 hrs |
| Phase 3 | AI features, Slack, automations, guest access | 40–60 hrs |

### Operations (Monthly)

| Service | Phase 1 Cost |
|---|---|
| Supabase | $0 |
| Vercel | $0 |
| GitHub Actions | $0 |
| **Total** | **$0/mo** |

Phase 3 adds ~$5–25/mo for Anthropic API usage.

---

## Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Local-first sync engine complexity delays MVP | High | Med | Use Supabase Realtime as the sync backbone (battle-tested); defer custom CRDT logic to Phase 2+ |
| Team doesn't adopt the tool (reverts to Notion) | High | Low | Involve entire team in feature prioritization; ship MVP in Week 2, not Week 4; migrate 2–3 real projects on Day 1 |
| Timeline view implementation exceeds estimates | Med | High | Ship board + list in Phase 1; timeline is Phase 2. Don't block MVP on the hardest feature |
| IndexedDB sync causes stale data bugs | Med | Med | Add a "force refresh" escape hatch; show sync status indicator; test offline + reconnect scenarios explicitly |
| Scope creep ("can we add docs / chat / goals?") | High | High | Hard freeze on Phase 1 feature list. Every new request goes to a backlog and is evaluated at Phase 2 kickoff |
| Supabase free tier limits hit unexpectedly | Low | Low | Monitor storage + bandwidth weekly; upgrade to Pro ($25/mo) is instant if needed |

---

## Timeline & Milestones

| Week | Milestone | Deliverable |
|---|---|---|
| 1 | Foundation | Auth, DB schema, tRPC setup, local sync skeleton, design system |
| 2 | Core task management | Task CRUD, list view, labels, projects, basic board |
| 3 | Board + swimlanes + dependencies | Full board view, swimlane grouping, dependency UI, Cmd+K |
| 4 | Comments + notifications + views | Comment system, @mentions, notification inbox, saved views, MVP shipped |
| 5–6 | Timeline view | Drag-and-drop timeline, dependency arrows, milestones |
| 7 | Search + GitHub integration | Full-text search, PR ↔ task linking |
| 8 | Dark mode + mobile | Responsive layout, dark theme, Phase 2 complete |
| 9–10 | AI features | Natural language task creation, auto-triage |
| 11–12 | Slack + automations | Slack integration, if-then rules, guest access |

---

## Open Questions

- [ ] Should "Teams" be a concept in Phase 1, or can all 5 members share a single flat workspace?
- [ ] Do we want separate identifier prefixes per role (ENG-42, DES-17) or flat workspace-wide (HM-42)?
- [ ] Should the timeline view default to showing all projects overlaid, or one project at a time?
- [ ] What is the retention policy for notifications and activity logs?

---

## Appendix: Keyboard Shortcuts Reference

| Shortcut | Action |
|---|---|
| `C` | Create new task |
| `Cmd+K` | Open command palette |
| `G+B` | Go to Board view |
| `G+L` | Go to List view |
| `G+T` | Go to Timeline view |
| `G+I` | Go to Inbox |
| `J / K` | Navigate up/down in list |
| `Enter` | Open selected task |
| `Esc` | Close panel / deselect |
| `X` | Select task (for bulk actions) |
| `E` | Edit title inline |
| `P` | Set priority |
| `A` | Assign to team member |
| `D` | Set due date |
| `L` | Add label |
| `?` | Show all shortcuts |
