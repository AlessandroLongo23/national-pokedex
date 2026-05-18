# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Next.js 16 web app that tracks progress on a personal Pokémon TCG binder
project: one card per National Pokédex entry (#1–1025). The app is the
successor to the self-contained `SV_ME_Coverage_Dashboard.html` at the repo
root, which is kept as a historical artifact (its "owned" state lived in
browser `localStorage`; the Next.js app uses Supabase). Background, goal,
acquisition strategy, and data-source methodology live in [README.md](README.md).

## Commands

| Task | Command |
| --- | --- |
| Dev server | `npm run dev` (localhost:3000) |
| Production build | `npm run build` |
| Lint | `npm run lint` |
| Unit tests (Vitest) | `npm test` |
| Unit tests watch | `npm run test:watch` |
| Single Vitest file | `npx vitest run tests/unit/<file>.test.ts` |
| Single Vitest by name | `npx vitest run -t "<test name>"` |
| E2E (Playwright) | `npm run test:e2e` |
| Single Playwright spec | `npx playwright test tests/e2e/<file>.spec.ts` |
| Regenerate reference data | `npm run data:rebuild` |
| Generate dev magic-link | `npx tsx scripts/dev/magic-link.ts <email>` |

There is no separate type-check script; `npm run build` runs `tsc` via Next.
TS is strict with `noUncheckedIndexedAccess` and `noImplicitOverride` on.

## Architecture

**Data flow.** `app/dashboard/page.tsx` is a server component that fetches the
user's `owned_pokemon` rows from Supabase server-side and hands them to
`DashboardClient.tsx`. Client-side, `OwnedContext.tsx` holds the owned set,
subscribes to Supabase realtime for cross-tab/device sync, and exposes
mutations that call Server Actions in `app/dashboard/actions.ts`. Mutations
are optimistic.

**Reference data is static, not queried.** [lib/data/](lib/data/) contains
`pokedex.json` (all 1,025 Pokémon), `sets.json` (TCG catalog filtered to
Scarlet & Violet + Mega Evolution series), `coverage.json`, and `greedy.json`
(precomputed rankings). These are committed to the repo and regenerated only
when running `npm run data:rebuild`, which executes the
[scripts/ingest/](scripts/ingest/) pipeline: clone `pokemon-tcg-data`, filter
by `series`, extract `nationalPokedexNumbers`, recompute coverage + greedy
buying order. **Use the `series` field as the canonical era grouping — do not
parse era from set ID or name** (per README).

**Three Supabase clients.** `lib/supabase/client.ts` (browser),
`server.ts` (RSC, reads cookies), and `proxy.ts` (middleware/edge cookie
refresh). Pick the one matching your execution context.

**Routing** is Next.js App Router under [app/](app/): `auth/`, `login/`,
`dashboard/` (with `sections/` for grid/table/list pieces and `import/` for
bulk import). `app/page.tsx` is the root.

## Auth is currently bypassed (revert before production)

Commit `e22cce2` disabled auth for local development:

- [app/dashboard/dev.ts](app/dashboard/dev.ts) exports a fixed
  `DEV_USER_ID = "00000000-0000-0000-0000-000000000001"` that every read/write
  uses instead of `supabase.auth.getUser()`.
- Migration
  [supabase/migrations/20260517130000_dev_open_access.sql](supabase/migrations/20260517130000_dev_open_access.sql)
  disables RLS on `owned_pokemon` and drops the FK to `auth.users`. The
  exact SQL to restore RLS + FK + owner policy is in the comment block at
  the top of that file.

To restore auth: delete `dev.ts`, swap `DEV_USER_ID` call sites back to
`supabase.auth.getUser()`, and run the SQL from the migration's header
comment. The magic-link infrastructure (`scripts/dev/magic-link.ts`, the
`auth/` and `login/` routes) is already in place; the dev script bypasses
Supabase's email rate limit for repeated local sign-ins.

## MCP

[.mcp.json](.mcp.json) configures the Supabase MCP server against project
`ltftoeltwgdpqkemnnmr`. Use it for migrations, advisors, logs, and SQL
inspection. **Constraint from auto-memory: never call paid Scrydex
endpoints — only the free pokemontcg.io API or the static `pokemon-tcg-data`
GitHub repo are allowed for card data.**

## Things to ignore / not "fix"

- `legacy/` (Python `build_pdf.py`, `fetch_data.py`) is the pre-Next.js
  workflow that produced the printable placeholder PDF — kept for reference,
  not active.
- The 3×3 layout of the placeholder PDF deliberately does NOT match the
  4×4 binder layout (see README) — do not "fix" this.
- `SV_ME_Coverage_Dashboard.html` at the repo root is the standalone
  predecessor; the live app is the canonical owner-tracker now.
