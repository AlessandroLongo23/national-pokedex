# National Pokédex Tracker — Design Spec

**Date:** 2026-05-17
**Status:** Draft, awaiting user approval

## 1. Purpose

A private, single-user web app for tracking progress toward owning one Pokémon TCG card per National Pokédex entry (#1–1025). Replaces the existing single-file `SV_ME_Coverage_Dashboard.html` with a polished, persistent, multi-device experience. Personal-collection use only — no pricing, no resale, no multi-user.

The app must do everything the existing HTML dashboard does, plus show actual Pokémon artwork.

## 2. Non-goals

Explicitly **out of scope** for this build:

- Cheapest-card / pricing lookup
- Print-ready PDF of missing list
- Excel export
- Camera scanning, OCR, barcode lookup
- Multi-user sign-up, account management
- Public share links / read-only views
- Mobile native apps (web is mobile-responsive but not native)
- Trade tracking, want-list sharing
- Card-condition / grading metadata

Each of these is feasible as a follow-up project but stays out of this spec.

## 3. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15+ (App Router) |
| Language | TypeScript strict |
| Styling | Tailwind v4 (CSS-variable theme tokens matching the existing dashboard palette) |
| Database | Supabase (Postgres) |
| Auth | Supabase Auth (email magic link) |
| Data fetching | Supabase JS SDK from server components + client (no TanStack Query) |
| Optimistic UI | React `useOptimistic` + server actions for mutations |
| Card images | PokeAPI official-artwork CDN (`raw.githubusercontent.com/PokeAPI/sprites/...`) via `next/image` with remote pattern whitelist |
| Tests | Vitest (units), Playwright (E2E) |
| Hosting | Vercel + Supabase free tiers |
| Package manager | npm |

## 4. Data architecture

Two strictly separated layers.

### 4.1 Reference data (static, committed JSON)

Generated at the developer's discretion (not on every deploy) by `scripts/ingest.ts`. Output is committed to the repo and bundled into the app — zero runtime DB reads for reference data.

**Ingest pipeline:**

1. Shallow-clone `PokemonTCG/pokemon-tcg-data` into `.cache/` (git-ignored)
2. Shallow-clone `smogon/pokemon-showdown` into `.cache/`
3. Parse `data/pokedex.ts` from smogon. Keep entries where `num` is in `[1, 1025]` and `baseSpecies` is not set (canonical species only — drops alt-formes). Result: `[{dex, name, gen}]`.
4. Walk `cards/en/*.json` in pokemon-tcg-data. For each card with `supertype === "Pokémon"` in a set whose `series` is `"Scarlet & Violet"` or `"Mega Evolution"`, collect the union of `nationalPokedexNumbers`. Skip the `sve` set ("Scarlet & Violet Energies") explicitly — it has no Pokémon cards.
5. Build per-set dex coverage `{setId: Set<dex>}`.
6. Compute aggregates:
   - `totalCovered = |union of all setCoverage values|`
   - `totalMissing = 1025 - totalCovered`
   - `byGen[g] = {covered, total}` for g in 1..9
   - `meAdded = (union of ME sets) \ (union of SV sets)`
   - `missingDex = [1..1025] \ union`
7. Compute greedy buy order: starting from empty set, repeatedly pick the set that adds the most new dex numbers; tie-break by earlier release date. Record `(rank, setId, newCount, cumulative)` for each.

**Output files (all in `lib/data/`):**

- `pokedex.json` — `Array<{dex: number, name: string, gen: number}>`, length 1025
- `sets.json` — `Array<{id, name, series, releaseDate, dexNumbers: number[], uniqueCount, distinctPokemonCount}>`
- `coverage.json` — `{totalCovered, totalMissing, byGen: Record<1..9, {covered, total}>, meAdded: number[], missingDex: number[]}`
- `greedy.json` — `Array<{rank, setId, setName, newCount, cumulative, releaseDate}>`

**Trigger:** `npm run data:rebuild`. Run manually when a new set is added to `pokemon-tcg-data` (the README tracks Chaos Rising 2026-05-22, Pitch Black 2026-07-17, etc.).

**Validation:** ingest emits a summary table to stdout (totals, per-gen, top-5 greedy). Unit tests assert the math against a fixture set of 2–3 set JSONs with known expected output.

### 4.2 User data (Supabase)

One table, one policy:

```sql
create table owned_pokemon (
  user_id     uuid not null references auth.users(id) on delete cascade,
  dex_number  int  not null check (dex_number between 1 and 1025),
  acquired_at timestamptz not null default now(),
  primary key (user_id, dex_number)
);

alter table owned_pokemon enable row level security;

create policy "owner_full_access" on owned_pokemon
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

That's the entire schema for v1. Notes/priority/tags can be added later without migration pain (just add nullable columns).

## 5. Routes

App Router structure:

```
/                  → server redirect: authed → /dashboard, else → /login
/login             → magic-link form (server action calls signInWithOtp)
/auth/callback     → route handler: exchanges magic-link code for a session, sets cookie, redirects to /dashboard
/dashboard         → main page, auth-gated, server component
/dashboard/import  → one-shot textarea to paste old localStorage owned-state JSON
```

Single long-scroll dashboard mirrors the HTML's layout. No sub-routing for sections.

## 6. Component decomposition

```
app/
  layout.tsx                   ← root: fonts, theme tokens, <html>/<body>
  page.tsx                     ← redirect logic
  globals.css                  ← Tailwind directives + theme var declarations
  login/
    page.tsx                   ← email input form
    actions.ts                 ← server action: signInWithOtp
  auth/callback/route.ts       ← code → session handler
  dashboard/
    page.tsx                   ← server: load owned set, hand to <DashboardClient>
    DashboardClient.tsx        ← client wrapper providing OwnedContext
    OwnedContext.tsx           ← Set<number> + toggle action + useOptimistic
    actions.ts                 ← server actions: toggleOwned, bulkImportOwned
    import/page.tsx            ← textarea, parses + invokes bulkImportOwned
    sections/
      HeadlineStats.tsx
      CoverageByGen.tsx
      MEAddedList.tsx
      FilterBar.tsx
      PokedexGrid.tsx
      PokemonCell.tsx          ← memoized; click → toggle; hover → tooltip
      Tooltip.tsx              ← portal, fetches artwork lazily
      SetsTable.tsx             ← sortable columns
      GreedyOrder.tsx
      MissingList.tsx           ← search + grid of cards-with-art

lib/
  supabase/
    server.ts                  ← createServerClient (cookies)
    client.ts                  ← createBrowserClient
    middleware.ts              ← session refresh helper
  data/
    pokedex.json               ← generated
    sets.json                  ← generated
    coverage.json              ← generated
    greedy.json                ← generated
    types.ts                   ← TS types for the above
    index.ts                   ← typed exports
  pokeapi.ts                   ← artwork URL builder

scripts/
  ingest.ts                    ← entrypoint
  ingest/
    fetch.ts                   ← clone/update .cache repos
    parsePokedex.ts            ← smogon pokedex.ts → [{dex, name, gen}]
    parseCards.ts              ← pokemon-tcg-data → per-set dex sets
    coverage.ts                ← aggregates
    greedy.ts                  ← greedy algorithm

tests/
  unit/
    coverage.test.ts           ← fixture sets → expected aggregates
    greedy.test.ts             ← greedy algorithm correctness + tie-breaking
    parsePokedex.test.ts       ← alt-forme filter, name cleanup
  e2e/
    auth.spec.ts               ← magic-link redirect, session persistence
    toggle-owned.spec.ts       ← click cell, reload, still owned
    import.spec.ts             ← paste JSON, owned count matches
```

### 6.1 Pokedex grid — the only non-trivial UI piece

1025 cells laid out in 25-column grid (mirrors HTML default; responsive breakpoints to 20/15 cols). Each cell:

- Memoized `<button>` keyed on dex number
- Background color derived from `(isCovered, isOwned)` state
- Default zoom: tiny silhouette artwork (PokeAPI sprite, 24×24, lazy-loaded with `next/image` + `loading="lazy"`)
- Hover (desktop) / long-press (mobile): portal tooltip showing name, dex #, sets it appears in, full official-artwork (lazy)
- Click: toggle owned via `useOptimistic` — UI updates instantly, server action fires `toggleOwned`, error → revert + toast

Performance budget: 1025 lazy `<Image>`s with `loading="lazy"` is fine modern browsers; if scroll perf suffers, add an "art on / art off" toggle (state in localStorage). **Default is art on.**

### 6.2 Tooltip

Single `<Tooltip>` instance in a portal at the root. Cells dispatch `(dexNumber, anchorRect)` to a context. Tooltip positions itself, fetches large artwork via PokeAPI URL on mount, shows skeleton while loading.

## 7. Auth flow

Standard Supabase magic-link:

1. User hits `/login`, enters email
2. Server action: `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '<base>/auth/callback' } })`
3. User clicks email link → `/auth/callback?code=...`
4. Route handler: `supabase.auth.exchangeCodeForSession(code)`, then `redirect('/dashboard')`
5. `middleware.ts` on every request: refresh session cookie; if path starts with `/dashboard` and no session, redirect to `/login`

Single user (the developer) in practice. The schema still scopes by `user_id` so it's safe.

## 8. Mutations

Two server actions:

```ts
// app/dashboard/actions.ts
'use server'

export async function toggleOwned(dexNumber: number): Promise<{owned: boolean}>
// upsert if missing, delete if present, return new state

export async function bulkImportOwned(dexNumbers: number[]): Promise<{imported: number}>
// validate 1..1025, dedupe, upsert all in one statement
```

Client uses `useOptimistic` to update the UI immediately; on failure, revert and toast.

## 9. Visual / theme

Tailwind v4 theme tokens reuse the existing HTML palette verbatim:

```css
@theme {
  --color-bg: #0f1115;
  --color-panel: #181b22;
  --color-panel-2: #1f232c;
  --color-text: #e7ecf3;
  --color-muted: #8b95a7;
  --color-accent: #f0b429;
  --color-covered: #3ddc84;
  --color-covered-dark: #1f9959;
  --color-missing: #e35b5b;
  --color-missing-dark: #8c2a2a;
  --color-owned: #f0b429;
  --color-owned-dark: #a87800;
  --color-me-tint: #a78bff;
  --color-sv-tint: #5db8ff;
  --color-border: #2a2f3a;
}
```

Two upgrades over the HTML:

1. **Cell artwork** in the pokedex grid (small silhouettes default, full art on hover)
2. **Missing-list cards** with artwork instead of plain text rows

Everything else (section ordering, density, filter buttons, sets-table columns, greedy-order layout) matches the HTML faithfully so the user has zero re-learning cost.

## 10. localStorage migration

`/dashboard/import` page:

1. Instructions: open the old HTML in a browser, run in DevTools console:
   ```js
   copy(JSON.stringify([...JSON.parse(localStorage.getItem('sv_me_owned_v1') || '[]')]))
   ```
2. Paste into textarea, submit
3. Server action validates the array (all integers 1–1025), upserts via `bulkImportOwned`
4. Redirects to `/dashboard` with toast: "Imported N Pokémon"

One-shot tool. Removed from nav after the user runs it once (no flag — just a low-traffic route).

## 11. Testing

**Unit (Vitest):**

- `coverage.test.ts` — given 2 fixture sets containing dex #s `{1,2,3}` and `{2,3,4}`, expect `totalCovered=4`, `missingDex=[5..1025]`, `meAdded=[4]` if second is ME
- `greedy.test.ts` — given known set coverage, assert ranking and tie-break by release date
- `parsePokedex.test.ts` — assert alt-formes (`baseSpecies` set) are dropped; assert names are clean strings

**E2E (Playwright):**

- `auth.spec.ts` — visit `/dashboard` unauthed → redirected to `/login`. Mock magic-link callback → land on `/dashboard`
- `toggle-owned.spec.ts` — log in, click cell, reload, assert cell still shows owned
- `import.spec.ts` — log in, paste `[1,2,3]`, redirect, assert 3 cells owned

E2E runs against a local Supabase started via `supabase start` (Supabase CLI). Migration + seed scripts live in `supabase/migrations/` and `supabase/seed.sql`. Documented in README.

## 12. Configuration

`.env.local` (committed `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-only; used only for ingest/seed scripts if needed
```

No `pokemontcg.io` API key needed — ingest reads from the GitHub repo, not the API. PokeAPI artwork CDN needs no key.

`next.config.ts` whitelists the PokeAPI sprite CDN under `images.remotePatterns`.

## 13. Deployment

- Vercel project linked to the GitHub repo
- Supabase project provisioned manually (one-time)
- Env vars set in Vercel dashboard
- `vercel.json` not needed; defaults work
- Build command: `next build`. Ingest is **not** part of the build — JSON is committed.

## 14. Open decisions resolved during brainstorming

- **localStorage import:** in scope (one-shot route)
- **Cell artwork by default:** yes, default on
- **TanStack Query:** no
- **Component library (shadcn etc):** not in v1; revisit if forms grow
- **Pages vs App router:** App
- **Tailwind v3 vs v4:** v4
- **Build-time vs runtime data:** build-time (committed JSON)

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| 1025 lazy images tank scroll perf on slow devices | Ship "art off" toggle as a deferred follow-up if profiling shows a problem; ship art-on default since modern lazy-loading handles this well |
| Supabase magic-link emails marked as spam | Configure Supabase SMTP with the user's own domain later; OK with default `noreply@supabase.io` for solo dev use |
| New set added to pokemon-tcg-data → manual ingest re-run needed | Document the one-liner clearly in README; offer cron'd GitHub Action as a v1.1 follow-up |
| User locks themselves out of magic-link (email loss) | Single user, controlled. If it happens, reset via Supabase dashboard. Not engineered around. |

## 16. Success criteria

The v1 build is done when:

1. `npm run data:rebuild` produces all four JSON files from a fresh clone with no extra setup
2. `npm run dev` starts the app; `/login` flow lands on `/dashboard` after magic-link click
3. `/dashboard` renders every section the existing HTML has (headline stats, per-gen bars, ME-added, 1025-cell grid with artwork, sets table, greedy order, missing list)
4. Clicking a cell toggles owned, persists to Supabase, and survives reload
5. `/dashboard/import` accepts a pasted dex-number array and bulk-imports
6. Filter bar (All / Covered / Missing / Owned / Still Needed) works on the grid
7. All unit tests pass; all E2E tests pass against local Supabase
8. Deployed to Vercel + Supabase, accessible from the user's phone and laptop

## 17. Implementation order (preview, not the plan)

Rough order for the writing-plans skill to expand into a real plan:

1. Project scaffolding: Next 15 + TS strict + Tailwind v4 + ESLint + Prettier
2. Supabase project + schema + RLS + local dev setup
3. Ingest script + unit tests + first JSON outputs committed
4. Auth flow + middleware + protected `/dashboard`
5. Static dashboard rendering all sections from JSON (no interactivity)
6. Owned state: server fetch + `OwnedContext` + `useOptimistic` + `toggleOwned` action
7. Filter bar wiring
8. Tooltip + artwork lazy loading
9. `/dashboard/import` route + bulk-import action
10. E2E tests
11. Vercel deploy + production env vars
