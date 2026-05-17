# National Pokédex Tracker

Personal web app for tracking progress toward owning one Pokémon TCG card per
National Pokédex entry (#1–1025). Replaces the standalone
`SV_ME_Coverage_Dashboard.html` with a Next.js + Supabase + Tailwind site that
persists state across devices.

## Stack

- Next.js 16 (App Router, Turbopack default) + React 19.2 + TypeScript strict
- Tailwind v4
- Supabase (Postgres + Auth, magic-link email)
- Build-time data ingest from
  [`PokemonTCG/pokemon-tcg-data`](https://github.com/PokemonTCG/pokemon-tcg-data)
  and [`smogon/pokemon-showdown`](https://github.com/smogon/pokemon-showdown)
- Vitest (units) + Playwright (E2E)

## Local setup

Prereqs: Node 20.9+ (24.x recommended), npm. A free Supabase project at supabase.com.

1. Create a Supabase project at https://supabase.com/dashboard.
2. In the project's **SQL Editor**, paste and run the contents of
   `supabase/migrations/20260517120000_owned_pokemon.sql`.
3. In **Authentication → URL Configuration**, set Site URL to your local dev URL
   and add `http://localhost:3000/auth/callback` as a Redirect URL.
4. Copy `.env.example` → `.env.local` and paste your project URL + anon key +
   service role key from **Project Settings → API**.

```sh
npm install
npm run data:rebuild   # clones source repos into .cache/, regenerates JSON in lib/data/
npm run dev
```

Visit http://localhost:3000, enter your email, and click the magic-link email
from Supabase.

## Importing the old dashboard's localStorage state

After signing in, go to `/dashboard/import` for the paste-JSON UI and the
DevTools snippet that extracts `localStorage.sv_me_owned_v1` from the old HTML.

## Regenerating reference data when new sets release

```sh
npm run data:rebuild
git add lib/data/*.json
git commit -m "Refresh reference data"
```

The script pulls (or clones) `pokemon-tcg-data` and `pokemon-showdown` into
`.cache/` (gitignored), then overwrites `lib/data/{pokedex,sets,coverage,greedy}.json`.
Coverage and greedy buy-order are deterministic — same input, same output.

## Tests

```sh
npm test                                   # Vitest unit tests (ingest math)
npx playwright install chromium --with-deps   # one-time
npm run test:e2e                           # Playwright E2E
```

E2E creates test users (`*-e2e@example.com`) in your Supabase Auth table. Clean
them up periodically via the dashboard (Authentication → Users).

## Project layout

- `app/` — Next.js App Router pages, including `/dashboard` (the main site)
- `lib/data/` — generated JSON (committed); do not edit by hand
- `lib/supabase/` — server/browser/proxy clients
- `lib/pokeapi.ts` — sprite + artwork URL builders
- `scripts/ingest/` — the ingest pipeline (TDD'd by `tests/unit/`)
- `supabase/migrations/` — canonical SQL applied via the dashboard SQL editor
- `tests/unit/` — Vitest fixtures + tests for parse/coverage/greedy
- `tests/e2e/` — Playwright tests (need real Supabase env)
- `proxy.ts` — Next 16 root proxy (was `middleware.ts` pre-16)

## Deploying to Vercel

If reusing the same Supabase project for dev and prod:

1. In Vercel, import the GitHub repo. Set env vars:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)
2. In Supabase dashboard → **Authentication → URL Configuration**, add the
   Vercel production URL as a Site URL (or Redirect URL) so magic-link emails
   point there.
3. Push to `master` (or your default branch) → Vercel builds → live.

If you want a separate prod Supabase project, create it the same way as the dev
one and re-apply the migration via the dashboard SQL editor.

## Design + plan documents

- [`docs/superpowers/specs/2026-05-17-pokedex-tracker-design.md`](docs/superpowers/specs/2026-05-17-pokedex-tracker-design.md)
- [`docs/superpowers/plans/2026-05-17-pokedex-tracker.md`](docs/superpowers/plans/2026-05-17-pokedex-tracker.md)

## What this app deliberately doesn't do

- Pricing / cheapest-card lookup
- Print-ready missing PDF
- Excel export
- Multi-user / public sharing
- Camera scanning

Each is a possible follow-up project.
