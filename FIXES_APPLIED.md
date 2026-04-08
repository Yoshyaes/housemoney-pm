# Fixes Applied — Code Review Remediation

Branch: `fix/code-review-issues`

All findings from `code-review.md` have been addressed. Items are listed in priority order.

---

## Critical (P0)

### C1 — Public Storage Buckets
**File:** `src/app/api/upload/route.ts`

Storage buckets are now created with `public: false`. Access is via 1-year signed URLs
(`createSignedUrl`) instead of public URLs. This prevents unauthenticated access to uploaded files.

### C2 — SVG Upload Allowed (XSS Vector)
**File:** `src/app/api/upload/route.ts`

Removed `image/svg+xml` from `ALLOWED_MIME_TYPES`. SVG files rendered from any origin are a
stored XSS vector.

### C3 — `deleteAccount` FK Constraint Gaps (GDPR)
**File:** `src/server/trpc/routers/workspace.ts`

Added `deleteMany` calls for all missing relations before deleting the user record:
`DocumentComment`, `ExperimentComment`, `FeedbackComment`, `DocumentAttachment`,
`TaskAttachment`, `Document`, `Experiment`, `Feedback`, `Decision`, `View`.

Moved Supabase auth deletion **before** the Prisma transaction so a DB failure leaves
the user unable to log back in (safer failure mode than a loginable user with deleted data).

### C4 — `getSession()` Instead of `getUser()` (JWT Not Verified)
**File:** `src/app/api/upload/route.ts`

Replaced `supabaseAuth.auth.getSession()` with `supabaseAuth.auth.getUser()`. `getSession()`
reads the cookie without server-side verification and accepts revoked or crafted JWTs.

---

## High Priority

### H1 — In-Memory Rate Limiter (Broken on Multi-Instance)
**Files:** `src/lib/rate-limit.ts`, `src/app/api/upload/route.ts`, `src/server/trpc/routers/ai.ts`, `src/server/trpc/routers/audit.ts`, `.env.example`

`rateLimit()` is now async and uses an Upstash Redis sliding-window (sorted set pipeline) when
`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are configured. Falls back to the
existing in-process Map for local dev / single-instance deployments. Redis errors fail open.
No extra npm package — uses the Upstash REST API via `fetch`.

All call sites updated to `await rateLimit(...)`.

### H2 — File Upload Magic Bytes Not Validated
**File:** `src/app/api/upload/route.ts`

Added `validateMagicBytes()` which checks the actual file header bytes against known signatures
for JPEG, PNG, GIF, WebP, PDF, ZIP, and DOCX. Files whose content does not match the declared
MIME type are rejected with HTTP 400. Text types pass through (no reliable magic bytes).

### H3 — Task Data Fetched Before Auth Check
**File:** `src/server/trpc/routers/tasks.ts`

The `get` procedure now fetches only `workspaceId` and `projectId` first, performs the
workspace membership and guest-project-access checks, then fetches the full task with all
relations. Prevents timing-based data leakage on unauthorized access.

### H4 — AI Knowledge Query Not Scoped for Guests
**Files:** `src/server/ai/knowledge-query.ts`, `src/server/trpc/routers/ai.ts`

`findRelevantChunks` now accepts an optional `allowedProjectIds: string[] | null` parameter.
The `queryKnowledge` procedure passes the user's accessible project IDs for GUEST users,
restricting SQL results to documents in projects they can access.

### H5 — Private Projects Invisible to Explicitly-Added Members
**File:** `src/server/trpc/routers/projects.ts`

The MEMBER project list `OR` clause now includes `{ members: { some: { userId } } }` so
that members who were explicitly added to a private project can see it, not just its creator.

### H6 — HTML Injection in Invitation Email
**File:** `src/server/invitations/send-invite-email.ts`

Added `escapeHtml()` helper and applied it to `inviterName`, `workspaceName`, and `acceptUrl`
before embedding them in the HTML email template. Prevents an admin with a malicious name
or a crafted workspace name from injecting HTML into outbound email.

### H7 — Every New User Gets ADMIN Role
**Files:** `src/server/trpc/trpc.ts`, `src/app/api/auth/callback/route.ts`

New users joining an existing workspace now receive the `MEMBER` role. `ADMIN` is only granted
to the very first workspace member (when `existingMemberCount === 0`). Applied in both the
tRPC context creation path and the OAuth callback route.

### H8 — HSTS Header Missing
**File:** `next.config.mjs`

Added `Strict-Transport-Security: max-age=31536000; includeSubDomains` to all routes.

### H9 — CSP Includes `unsafe-eval`
**File:** `next.config.mjs`

Removed `'unsafe-eval'` from `script-src`. Also added `object-src 'none'` and `base-uri 'self'`
directives. Note: `'unsafe-inline'` is retained because Next.js App Router inlines per-page
scripts; removing it requires nonce/hash configuration (tracked as future work).

---

## Medium Priority

### M1 — Serial Activity Inserts (N Queries)
**File:** `src/server/trpc/routers/tasks.ts`

Replaced the `for...of activity.create()` loop in the `update` procedure with a single
`activity.createMany()` call, reducing DB round trips proportional to the number of changed fields.

### M3 — cuid() Invitation Tokens (Predictable)
**File:** `src/server/trpc/routers/invitations.ts`

Invitation tokens now use `crypto.randomBytes(32).toString('hex')` (64 hex chars of CSPRNG output)
instead of the schema-level `@default(cuid())` which is timestamp-seeded and partially predictable.

### M4 — Supabase Delete After Prisma in deleteAccount
Resolved as part of C3.

### M5 — Silent `catch {}` in createContext
**File:** `src/server/trpc/trpc.ts`

Changed `catch {}` to `catch (err) { console.error('[createContext] Unexpected error:', err); }`
so unexpected errors are observable in logs.

### M6 — CRON_SECRET Not Documented
**File:** `.env.example`

Added `CRON_SECRET` to `.env.example` with a comment explaining its purpose.

### M7 — Analytics projectId Not Validated Against Workspace
**File:** `src/server/trpc/routers/analytics.ts`

Added `validateProjectScope()` helper that verifies the provided `projectId` belongs to the
requested `workspaceId`. Called in all 8 analytics procedures after the workspace membership check.

### M8 — No Max-Length Validators on Large Inputs
**Files:** `src/server/trpc/routers/tasks.ts`, `src/server/trpc/routers/comments.ts`, `src/server/trpc/routers/documents.ts`, `src/server/trpc/routers/decisions.ts`

Added `.max()` limits at the API boundary:
- Task title: 500 chars
- Task description: 50,000 chars
- Comment body: 10,000 chars
- Document content: 500,000 chars
- Decision body: 100,000 chars

### M9 — `xlsx` Package Has Unfixed CVEs
**Files:** `src/app/api/upload/route.ts`, `src/lib/extract-text.ts`

Removed `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` from allowed
MIME types and removed the `xlsx` parsing branch from `extractTextFromBuffer`. This eliminates
CVEs GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS) at the cost of
disabling `.xlsx` upload support until a safe alternative is available.

---

## Not Fixed / Out of Scope

**M2 — N+1 in Project Progress Calculation:** The current implementation already loads task statuses
in a single include (`tasks: { select: { status: true } }`) rather than issuing per-project queries.
No N+1 was present.

**H1 Redis wiring:** Requires provisioning an Upstash Redis database and setting the env vars
documented in `.env.example`. The rate limiter silently falls back to in-memory without them.

**H9 `unsafe-inline` removal:** Requires nonce/hash wiring in the Next.js custom Document.
Tracked as future work.
