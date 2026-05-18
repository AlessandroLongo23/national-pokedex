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

**Data flow.** [app/(dashboard)/layout.tsx](app/(dashboard)/layout.tsx) is a
server component inside the `(dashboard)` route group that resolves the
current user via [_lib/current-user.ts](app/(dashboard)/_lib/current-user.ts)
(`requireUser()` / `requireUserId()`, which redirect unauthenticated visitors
to `/login`), fetches the user's `owned_cards`, `wishlist_cards`, and
`set_availability` rows from Supabase, and hands them to
[_components/Shell.tsx](app/(dashboard)/_components/Shell.tsx). Shell wraps
children in three optimistic client contexts (`OwnedCardsContext`,
`WishlistContext`, `SetAvailabilityContext`) that each subscribe to Supabase
realtime filtered by `userId`, plus a `UserContext` exposing `userId`/`email`
to client components like [AccountStub.tsx](app/(dashboard)/_components/AccountStub.tsx).
Mutations call Server Actions in
[_lib/card-actions.ts](app/(dashboard)/_lib/card-actions.ts),
[_lib/pack-actions.ts](app/(dashboard)/_lib/pack-actions.ts), and
[_lib/availability-actions.ts](app/(dashboard)/_lib/availability-actions.ts);
every action calls `requireUserId()` and scopes its queries by that ID.

**Auth.** Sessions are managed by `@supabase/ssr` cookies, refreshed on every
request by [proxy.ts](proxy.ts) (Next.js 16's successor to `middleware.ts`)
→ `updateSession()` in [lib/supabase/proxy.ts](lib/supabase/proxy.ts). The middleware also redirects
unauthenticated visitors from `/dashboard/**` to `/login` and authenticated
visitors from `/login` to `/dashboard`. Login is email magic-link only:
[app/login/page.tsx](app/login/page.tsx) submits to
[app/login/actions.ts](app/login/actions.ts) (`signInWithOtp`); the email
link lands on [app/auth/callback/route.ts](app/auth/callback/route.ts) which
exchanges the code for a session. For dev convenience,
[scripts/dev/magic-link.ts](scripts/dev/magic-link.ts) generates a one-shot
magic link via the admin API to bypass Supabase's email rate limit.

**Reference data is static, not queried.** [lib/data/](lib/data/) contains
`pokedex.json` (all 1,025 Pokémon), `sets.json` (TCG catalog filtered to
Scarlet & Violet + Mega Evolution series), `coverage.json`, and `greedy.json`
(precomputed rankings). These are committed to the repo and regenerated only
when running `npm run data:rebuild`, which executes the
[scripts/ingest/](scripts/ingest/) pipeline: clone `pokemon-tcg-data`, filter
by `series`, extract `nationalPokedexNumbers`, recompute coverage + greedy
buying order. **Use the `series` field as the canonical era grouping — do not
parse era from set ID or name** (per README).

**Three Supabase clients.** [lib/supabase/client.ts](lib/supabase/client.ts)
(browser), [server.ts](lib/supabase/server.ts) (RSC, reads cookies), and
[proxy.ts](lib/supabase/proxy.ts) (middleware/edge cookie refresh). Pick the
one matching your execution context.

**Routing** is Next.js App Router under [app/](app/). The
[`(dashboard)/`](app/(dashboard)/) route group holds every authenticated
page (Pokédex, Sets, Cards, Binders, Collection, Packs, Wishlist, Settings)
behind the shared layout described above. [`auth/`](app/auth/) and
[`login/`](app/login/) sit outside the group so they're reachable while
signed out. [`app/page.tsx`](app/page.tsx) is the root.

## MCP

[.mcp.json](.mcp.json) configures the Supabase MCP server against project
`ltftoeltwgdpqkemnnmr`. Use it for migrations, advisors, logs, and SQL
inspection. **Constraint from auto-memory: never call paid Scrydex
endpoints — only the free pokemontcg.io API or the static `pokemon-tcg-data`
GitHub repo are allowed for card data.**

## Things to ignore / not "fix"

- `legacy/` is gitignored and holds the pre-Next.js Python tools
  (`build_pdf.py`, `fetch_data.py`, `irsandsirs.py`, their CSVs and
  generated PDFs) on the maintainer's machine only — not part of the
  deployed app and not present in fresh clones.
- The 3×3 layout of the placeholder PDF deliberately does NOT match the
  4×4 binder layout (see README) — do not "fix" this.
- `SV_ME_Coverage_Dashboard.html` at the repo root is the standalone
  predecessor; the live app is the canonical owner-tracker now.
