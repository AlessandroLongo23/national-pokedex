# Artist attribution gap

Captured 2026-05-18. Artist-scoped binders are silently incomplete because the upstream card data source omits artist credits for ~1/3 of modern cards.

## Symptom

Create an artist-scope binder for a real-world illustrator and the result is missing cards that genuinely exist in English releases. Example: a binder for **Mori Yuu** renders 3 cards (Beautifly `sv6pt5-219`, Inkay `zsv10pt5-33`, Pidove `me2pt5-148`), but Mori Yuu has illustrated more English cards than that — e.g. the Clamperl IR `sv10-195` from Surging Sparks, which is in the catalog but not in the binder.

## Root cause

The artist filter in [lib/data/binder-scope.ts](../../lib/data/binder-scope.ts) is correct — it matches `c.artist === artist` against the result of [getAllCards()](../../lib/data/binder-scope.ts#L107). The data underneath it is wrong.

The catalog is rebuilt from the [`pokemon-tcg-data`](https://github.com/PokemonTCG/pokemon-tcg-data) GitHub repo via [scripts/ingest/](../../scripts/ingest/). For many modern cards, that repo simply has no `artist` field on the raw card object. Example, taken verbatim from `.cache/pokemon-tcg-data/cards/en/sv10.json`:

```json
{
  "id": "sv10-195",
  "name": "Clamperl",
  "rarity": "Illustration Rare",
  "number": "195",
  "nationalPokedexNumbers": [366]
  // no "artist" field
}
```

The community contributors who maintain `pokemon-tcg-data` transcribe basics (name, number, rarity, images) for new sets but routinely skip artist credits. Pulling the latest from upstream does not help — as of writing, the most recent commit is `4ac4eb1 Add Perfect Order (me3)` from 2026-03-27, which already exhibits the gap.

## Scope

Audit of [lib/data/cards/](../../lib/data/cards/) on 2026-05-18:

| Scope | Cards | Missing `artist` |
| --- | --- | --- |
| Whole catalog | 17,027 | 1,105 (6.5%) |
| Scarlet & Violet + Mega Evolution series only | 3,486 | **1,100 (31.6%)** |

Almost every missing-artist card is in a modern set. Artist binders covering recent illustrators are dramatically incomplete by default; legacy-set artists are mostly fine.

## Options

### 1. Local artist-credit overrides

Add `lib/data/artist-overrides.json` keyed by card id (e.g. `{"sv10-195": "Mori Yuu"}`). In [scripts/ingest/parseCards.ts](../../scripts/ingest/parseCards.ts), merge the override into `card.artist` when the raw field is missing. Survives `npm run data:rebuild`. Easiest path; scales linearly with manual effort.

### 2. Backfill from pokemontcg.io API

The free [pokemontcg.io](https://pokemontcg.io) API often returns an `artist` for cards where the GitHub mirror is missing it — different ingestion pipeline upstream. Build a one-shot script that finds every card with no `artist` in our cache, queries the API by id, and writes the answers into `artist-overrides.json` (so the same merge step covers both manual and API-sourced fixes). Stays under the free-data-only constraint in [CLAUDE.md](../../CLAUDE.md).

### 3. Switch artist source entirely

Use pokemontcg.io's API as the authoritative source for `artist`, keeping the GitHub repo for everything else. Higher complexity, but no override file to maintain.

### 4. Surface the gap in the UI (complement, not replacement)

On any artist binder, show a small note like "Catalog is missing artist credits for X cards in this scope" so an empty/short binder doesn't look like a bug. Cheap, useful regardless of which backfill path is taken.

## Recommended path

Start with **option 1 + option 4** to unblock the maintainer's own binders today, then layer in **option 2** as a batch backfill when there's appetite for it. Avoid option 3 until/unless pokemontcg.io proves reliably more complete than the GitHub mirror across all fields we use.

## Relevant code

- Filter: [lib/data/binder-scope.ts](../../lib/data/binder-scope.ts) — `filterByScope` artist branch is what would consume the merged `artist` field unchanged.
- Ingest: [scripts/ingest/parseCards.ts](../../scripts/ingest/parseCards.ts) — `parseSetCards` reads `card.artist` directly; this is where the override merge belongs.
- Card type: [lib/data/types.ts](../../lib/data/types.ts) — `artist?: string` (stays optional regardless of fix).
- Distinct-artist list: [`distinctArtists`](../../lib/data/binder-scope.ts) feeds the artist picker; backfilled credits show up here automatically.
