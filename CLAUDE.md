# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server (Next.js)
npm run build            # Production build
npm run lint             # ESLint
npm run db:generate      # Regenerate Prisma client after schema changes
npm run db:push          # Push schema to database (no migration)
npm run db:migrate       # Create and apply migration
npm run db:seed          # Seed database (npx tsx prisma/seed.ts)
npx tsc --noEmit         # Type-check without emitting
```

## Architecture

**Stack:** Next.js 14 (App Router) + tRPC + Prisma (PostgreSQL via Supabase) + Zustand + Tailwind CSS

### Data flow

Client components call tRPC hooks → tRPC procedures run server-side with Prisma → React Query caches results. Zustand stores (`src/lib/stores/`) manage UI-only state (active view, filters, selected task, modals). Server state always flows through tRPC/React Query.

### Route groups

- `src/app/(app)/` — Protected routes. Layout wraps in Providers (tRPC, React Query, ThemeProvider, KeyboardShortcuts).
- `src/app/(auth)/` — Public login/signup pages.
- `src/middleware.ts` — Supabase session check; redirects unauthenticated users to `/login`, authenticated users away from auth pages. API routes bypass auth middleware.

### tRPC setup

- **Server context** (`src/server/trpc/trpc.ts`): Creates context with `db`, `user`, `userId` from Supabase session. Auto-creates Prisma user + default "house-money" workspace on first API call. Exports `protectedProcedure` (requires auth) and `publicProcedure`.
- **Router composition** (`src/server/trpc/routers/_app.ts`): Combines sub-routers — tasks, projects, comments, dependencies, views, notifications, workspace, search, ai.
- **Client** (`src/lib/trpc.ts`): `createTRPCReact<AppRouter>()` with httpBatchLink to `/api/trpc`.
- Uses Superjson transformer for Date serialization.

### Database

Prisma schema at `prisma/schema.prisma`. Uses PostgreSQL adapter. Generated client outputs to `src/generated/prisma/`. Path alias: `@/generated/prisma/client`.

Core entities: Workspace → Project → Task (with Labels, Comments, Activities, Dependencies, GitHubPRs). Task identifiers auto-increment per workspace (e.g., "HM-42") via `workspace.taskCounter`.

### AI integration

`src/server/ai/parse-task.ts` — Anthropic SDK functions for natural language task creation (`parseTaskFromNaturalLanguage`) and auto-triage suggestions (`triageTask`). Both use Claude tool_use for structured extraction. Fuzzy matching helpers resolve names to workspace entity IDs.

### Key patterns

- **Path alias:** `@/*` maps to `src/*`
- **Styling:** Tailwind with `cn()` utility (clsx + tailwind-merge) from `src/lib/utils.ts`. Dark mode via class strategy. Brand color: `brand-amber` (#BA7517).
- **Components:** Feature folders under `src/components/` (board/, list/, timeline/, task/, etc.). Shared reusable components in `shared/`.
- **Keyboard shortcuts:** Global handler in `src/lib/hooks/use-keyboard-shortcuts.ts`. Cmd+K opens command palette.
- **GitHub webhook:** `src/app/api/github/webhook/route.ts` — HMAC-verified, extracts task identifiers from PR title/body, auto-transitions task status on PR events.

## Environment Variables

See `.env.example`. Required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_DATABASE_URL`. Optional: `GITHUB_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`.
