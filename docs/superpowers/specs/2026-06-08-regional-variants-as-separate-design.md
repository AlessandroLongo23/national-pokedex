# Treat regional variants as separate Pokémon — design

**Date:** 2026-06-08
**Status:** Approved (design), pending implementation
**Mirrors:** the existing "Treat Mega Evolutions as separate Pokémon" feature
(`MegaSeparationSetting`, `megas.json`, `parseMegas.ts`, `fetchMegaArtwork.ts`,
`MegaCell`, `binder-scope.ts`, the `mega_placement` prefs).

## Problem

By default an *Alolan Vulpix* card counts toward Vulpix #37, a *Galarian Moltres*
card toward Moltres #146 — a regional form contributes to its base National
Pokédex number. Some collectors think of regional variants (Alolan, Galarian,
Hisuian, Paldean forms) as their own Pokémon and want them tracked in their own
slots.

We already do exactly this for Mega Evolutions: a settings toggle, three
placement modes, a dedicated page, binder-coverage handling, ownership that
stops crediting the base dex, **and distinct official artwork fetched from
PokéAPI** (`MegaForm.artworkId`, resolved by `fetchMegaArtwork.ts`; `MegaCell`
renders `officialArtworkUrl(form.artworkId ?? form.baseDex)`). This feature adds
a **second, independent** settings entry that does the same for regional
variants. Because the artwork mechanism already exists for Megas, regional
variants are an unusually clean mirror — the one substantive difference is the
resolver that decides *which* region-prefixed Pokémon are true variants and picks
the right PokéAPI form.

## Decisions (locked with the maintainer)

1. **Independent feature, mirroring Megas.** A separate toggle
   `treat_variants_as_separate` and a separate `variant_placement`
   (`appended` | `inline` | `separate`). It does **not** piggyback on the Mega
   toggle; a user can enable either, both, or neither.
2. **Scope = the four canonical regional prefixes only:** `Alolan`, `Galarian`,
   `Hisuian`, `Paldean`. No other special forms are in scope.
3. **Region-exclusive species stay on their base slot.** A region-prefixed
   Pokémon becomes a separate variant slot **only if it also has a normal
   (non-regional) counterpart**. Species that exist *only* in a regional line
   (e.g. *Paldean Clodsire* #980, *Hisuian Sneasler* #903, *Galarian Perrserker*
   #863) keep counting toward their base dex — no empty Pokédex slots.
4. **Distinct official artwork per variant**, via `RegionalVariant.artworkId`
   (a PokéAPI form id — exact mirror of `MegaForm.artworkId`), fetched at
   `data:rebuild` time. Source is the free PokéAPI — **not** pokemontcg.io or
   Scrydex — so the card-data API constraint is unaffected.

## Validation (already done, against live data)

The detection + resolution algorithm below was run against the full committed
card set and live PokéAPI. Results, treated as ground truth:

- **66** distinct region-prefixed Pokémon names exist in `lib/data/cards/`
  (supertype `Pokémon`, product suffixes stripped, tag-teams excluded).
- **56** resolve to true variants — **every one resolves to a PokéAPI form with
  official artwork** (0 missing). So the `artworkId ?? baseDex` fallback never
  triggers for the current corpus.
- **10** are region-exclusive and correctly stay on base:
  Obstagoon #862, Perrserker #863, Cursola #864, Sirfetch'd #865, Mr. Rime #866,
  Runerigus #867, Basculegion #902, Sneasler #903, Overqwil #904, Clodsire #980.
- `56 + 10 = 66` reconciles exactly. No unresolved/problem cases.

The naive slug guess `{base}-{region}` is **wrong** for three real variants
(false 404s): Paldean Tauros, Galarian Darmanitan, Hisuian Basculin — PokéAPI
suffixes their forms (`tauros-paldea-combat-breed`, `darmanitan-galar-standard`,
`basculin-white-striped`). The species-varieties resolver below handles all
three; a hand-rolled slug table would not have.

## The resolver (correctness core)

Modelled on `chooseMegaVariety` / `resolveMegaArtwork` in `fetchMegaArtwork.ts`,
which already fetch `pokemon-species/{dex}` and pick the right variety. For each
distinct `(region, baseName, baseDex)` derived from card names — keyed by dex,
never by guessing the form slug:

1. **Fetch the species by dex:** `GET /pokemon-species/{baseDex}`
   (species id == National Pokédex number for all 1025 — reliable).
2. **`chooseVariantVariety(slug, varieties, region)` (pure, unit-testable):**
   select the varieties whose `pokemon.name` contains the region token
   (`alola` | `galar` | `hisui` | `paldea`).
   - **Override** for regional forms PokéAPI does *not* tag with a region token:
     Hisuian Basculin → `basculin-white-striped`. (The only override the 66-name
     corpus needs.)
   - If several match (Tauros has 3 paldea breeds; Darmanitan has galar
     `-standard`/`-zen`; Alolan Raticate has a `-totem`), pick the canonical
     representative: prefer `-standard`, else a name without `zen`/`totem`, else
     the shortest — one slot per TCG name.
   - Return the variety's PokéAPI id (e.g. `10103`) or `null`.
3. **`null` → region-exclusive.** The `(region, dex)` is **not** a variant; emit
   nothing. This drops Clodsire/Sneasler/Perrserker… and also Basculegion (its
   varieties are `-male`/`-female`, no region token — correctly *not* a variant).
4. **id → true variant.** Store it as `artworkId`. This **same resolution decides
   existence and artwork in one pass** — exactly the maintainer's edge-case rule.

Runs **only at ingest** (`npm run data:rebuild`). At app runtime nothing calls
PokéAPI; the committed `variants.json` carries everything (`officialArtworkUrl()`
turns `artworkId` into the sprite URL, same as Megas).

## Data model

### `lib/data/types.ts`

Exact mirror of `MegaForm` (which is `{ formKey, displayName, baseDex, gen,
isPrimal, artworkId? }`):

```ts
export interface RegionalVariant {
  variantKey: string;   // "alola-vulpix", "galar-darmanitan", "hisui-basculin"
  displayName: string;  // "Alolan Vulpix", "Galarian Darmanitan"
  region: "alola" | "galar" | "hisui" | "paldea";
  baseDex: number;      // 37
  gen: Generation;      // genOf(baseDex)
  artworkId?: number;   // PokéAPI form id for THIS form's official artwork
}

export type VariantIndex = Record<string, string[]>; // variantKey → cardId[]
```

`CardEntry` gains an optional `variantFormKey?: string` (mirror of
`megaFormKey?`). A card has **at most one** of `megaFormKey` / `variantFormKey`,
or neither.

`variantKey` is `${region}-${baseSlug}` (`baseSlug` = lower-kebab base name:
`mr-mime`, `farfetchd`). Region is in the key because **one dex can host two
regional variants — Meowth #52 has both Alolan and Galarian forms** (both true
variants); `alola-meowth` and `galar-meowth` coexist with the same `baseDex`.

### New committed data files

- `lib/data/variants.json` — `RegionalVariant[]`, **sorted by (region rank
  `alola < galar < hisui < paldea`, then `baseDex`)** so render order is stable.
- `lib/data/cardIndexByVariant.json` — `VariantIndex` (`variantKey → cardId[]`).

### `lib/data/index.ts` (barrel)

Add `VARIANTS` and `CARD_INDEX_BY_VARIANT` exports next to the existing `MEGAS` /
`CARD_INDEX_BY_MEGA` exports (lines 37–38). Runtime imports come from here.

## The orphan-card invariant (correctness)

`variantFormKey` must be assigned **only after** resolution, never from the name
prefix alone. Otherwise a region-exclusive card (e.g. *Paldean Clodsire*) could
carry a `variantFormKey` that has no entry in `variants.json` — and then
`OwnedCardsContext` would skip it from the base dex while no variant slot exists,
losing the card from coverage entirely.

**Invariant:** a card has `variantFormKey === K` **iff** `variants.json` contains
a variant with `variantKey === K`. Region-prefixed cards whose `(region, dex)`
resolves to region-exclusive get **no** `variantFormKey` and remain ordinary
base-dex cards. Enforced by deriving `variantFormKey` onto cards from the
resolved `cardIndexByVariant` (not from a name match in `parseCards`), plus an
ingest assertion and a unit test.

## Ingest pipeline (`scripts/ingest/`)

- **`parseVariants.ts`** (new, modelled on `parseMegas.ts`):
  - `normalizeVariantName(rawName)`: match `^(Alolan|Galarian|Hisuian|Paldean)\s+`,
    strip trailing product suffixes (`-GX`, ` V`, `VMAX`, `VSTAR`, ` ex`, `-EX`…)
    reusing the Mega suffix/tag-team regexes → `{ region, baseName }` or `null`.
    (Detection is by **name prefix** — there is no `VARIANT` subtype, unlike
    Megas' `MEGA` subtype.)
  - `chooseVariantVariety(slug, varieties, region)` — the pure resolver above.
  - `discoverVariants(cardsBySet)` — group region-prefixed Pokémon cards by
    `(region, baseDex)` into candidates with their `cardId[]`.
- **`fetchVariantArtwork.ts`** (new, near-copy of `fetchMegaArtwork.ts`):
  fetch `pokemon-species/{dex}` (concurrency/retry/politeness identical to the
  Mega fetcher), apply `chooseVariantVariety`, return the resolved
  `RegionalVariant[]` (with `artworkId`), **dropping unresolved/region-exclusive
  candidates**. Warn (don't silently drop) on any region-prefixed name that fails
  to resolve, so a future set's new prefix surfaces at build time.
- **`scripts/ingest/index.ts`:** after `discoverMegas` + `resolveMegaArtwork`
  (lines ~120–132), call `discoverVariants` → `fetchVariantArtwork`, derive
  `variantFormKey` onto cards from `cardIndexByVariant`, and `writeJson`
  `variants.json` + `cardIndexByVariant.json` next to the Mega outputs (lines
  ~201–202).
- **`parseCards.ts`:** no name-based variant assignment (per the invariant); it
  only needs the optional `variantFormKey` field present on `CardEntry`.

## Preferences + persistence

- **Migration** `supabase/migrations/<ts>_variant_preferences.sql` (mirror of
  `20260527120000_mega_preferences.sql`):
  ```sql
  alter table public.user_preferences
    add column treat_variants_as_separate boolean not null default false,
    add column variant_placement text not null default 'appended'
      check (variant_placement in ('appended', 'inline', 'separate'));
  ```
- **`_lib/variant-prefs.ts`** (new, client-safe — mirror of `mega-prefs.ts`):
  `VARIANT_PLACEMENTS` + `VariantPlacement`.
- **`user-preferences.ts`:** extend the `select` columns, the `UserPreferences`
  interface, defaults, and re-export `VARIANT_PLACEMENTS` (mirrors the
  `MEGA_PLACEMENTS` re-export at line 6) — loaded in the **same**
  `loadUserPreferences()` query (no extra round-trip).
- **`preferences-actions.ts`:** `updateVariantSettings(treatAsSeparate, placement)`
  — validate placement, upsert, then `revalidatePath` for `/settings`, `/pokedex`,
  `/variants`, `/binders`, `/binders/[id]`, `/cards` (mirror `updateMegaSettings`).
- **`UserContext.tsx`:** add `treatVariantsAsSeparate` + `variantPlacement` to the
  context interface, provider props, and value (alongside the three Mega
  appearances at lines 15/39/55). **`layout.tsx` / `Shell.tsx`** thread them from
  `loadUserPreferences` into `UserProvider`.

## UI

- **`settings/_components/VariantSeparationSetting.tsx`** (new) — copy of
  `MegaSeparationSetting` with variant wording ("By default an Alolan Vulpix card
  counts toward Vulpix #37. Turn this on if you think of Alolan, Galarian,
  Hisuian and Paldean forms as their own Pokémon."), three placement cards mirror
  Megas. Added to `settings/page.tsx` under the Mega setting.
- **`_components/VariantCell.tsx`** (new, copy of `MegaCell`): owned card art when
  available, else `officialArtworkUrl(form.artworkId ?? form.baseDex)` — the
  distinct-art payoff comes free from the resolved `artworkId`. Use a distinct
  accent for the badge/glow (Megas use slate-violet; pick a separate variant
  accent token rather than reusing the Mega color).
- **`variants/page.tsx`** (new): rendered only when
  `treatVariantsAsSeparate && variantPlacement === 'separate'`; uses the grid in
  `mode="variants"` (variant slots only). Shell nav link gated exactly like
  `/megas` (`!isGuest && treatVariantsAsSeparate && variantPlacement === 'separate'`,
  mirroring Shell.tsx lines 110–113).

## Rendering + ownership

### `OwnedCardsContext.tsx`

Mirror every Mega hook (lines 13, 74–80, 82–91, 93–100, 132, 211–215, 222–245):

- Import `CARD_INDEX_BY_VARIANT`; build `CARD_TO_VARIANT` (inverted) like
  `CARD_TO_MEGA`.
- `deriveSpecies(owned, treatMegasAsSeparate, treatVariantsAsSeparate)` — add the
  third param; skip a card when `treatVariantsAsSeparate && CARD_TO_VARIANT[id]`
  (composes with the Mega skip). Update the `useMemo` call + deps (lines 211–214)
  and the `ownedCountForSpecies` skip (line 229) the same way.
- Derive `ownedVariantForms` (toggle-independent, like `ownedMegaForms`) and add
  `isVariantFormOwned` / `ownedCountForVariantForm`; expose them on the context
  value. Destructure `treatVariantsAsSeparate` from `useUser()` (line 132).

### `PokedexGrid.tsx`

Mirror the Mega slot wiring throughout (lines 19–21, 86–87, 132–191, 193–262,
266–279, 431–475):

- `Slot` union gains `{ kind: "variant"; form: RegionalVariant; gen }`.
- `useUser()` also destructures `treatVariantsAsSeparate` / `variantPlacement`;
  `useOwnedCards()` also destructures `ownedVariantForms`.
- `includeVariants` flag parallel to `includeMegas`; `mode === "variants"` shows
  variant slots only.
- **`inline` composition:** for each base dex, push base → its mega(s) → its
  variant(s) (variants in `variants.json` order = region rank then baseDex). A dex
  with both (e.g. **Slowbro #80** = Mega Slowbro + Galarian Slowbro) and a
  dual-region dex (**Meowth #52** = Alolan + Galarian) render deterministically.
- **`appended`:** add an `appendedVariants` memo + a "Regional Variants" section
  rendered **after** the "Mega Evolutions" section.
- `filtered` / `totalOwnedInView` / `gens` / `slotsByGen` memos handle variant
  slots via `ownedVariantForms.has(slot.form.variantKey)` and
  `variantPlacement`, mirroring their Mega branches.
- `renderSlot`: `kind === "variant"` → `<VariantCell form={slot.form} />`.
- Search placeholder: `mode === "variants"` behaves like `"megas"`.

### Card detail

- **`cards/[cardId]/page.tsx`** also passes `variantFormKey={card.variantFormKey ?? null}`
  to `BinderMembership` (mirror line 407).
- **`BinderMembership.tsx`** checks `variantFormKey` and uses
  `isVariantFormOwned` parallel to the Mega path (lines 25/42/55).

## Binder integration (was missed in first draft — confirmed touchpoint)

The Mega feature is **not** a pure runtime overlay: `lib/data/binder-scope.ts`
computes binder dex-range coverage with Mega awareness, and two binder components
thread the prefs in. Variants need the parallel:

- **`lib/data/binder-scope.ts`:**
  - `pickDisplayCardId(..., excludeMegas)` (lines 124–127) — add `excludeVariants`
    and filter out `c.variantFormKey` cards when on.
  - `MegaCoverageOptions` (lines 7–11) → add a sibling `VariantCoverageOptions`
    (`treatVariantsAsSeparate`, `variantPlacement`, `variants: RegionalVariant[]`).
  - `pokedexCoverage(..., mega?, variant?)` (lines 185–221) — exclude
    `variantFormKey` cards from dex contribution when on, and populate
    `variantForms` / `coveredVariantForms` for in-range variants (mirror
    `megaForms` / `coveredMegaForms`, lines 196–217).
- **`binders/_components/BinderListPricedGrid.tsx`** (lines 29–30, 69–71,
  157–159): thread `variant` options into the coverage calls and fold
  `coveredVariantForms` into `ownedCount` / `total`.
- **`binders/[id]/_components/BinderDetailClient.tsx`** (lines 68–107, 183):
  derive `variantsInRange`, add to `total`/`ownedCount`, pass variant prefs to
  `PokedexGrid`, and pass `excludeVariants` to `pickDisplayCardId`.

**Static data is unchanged (verified):** `coverage.json` and `greedy.json` are
computed by `scripts/ingest/coverage.ts` / `greedy.ts` purely over the base 1025
dex and set `dexNumbers` — neither references Megas, so neither needs variant
awareness. The 1025-slot model is preserved; variants are an overlay like Megas.

## Touchpoint checklist (for the implementation plan)

**New files:** `parseVariants.ts`, `fetchVariantArtwork.ts`, `variants.json`,
`cardIndexByVariant.json`, `variant-prefs.ts`, `VariantSeparationSetting.tsx`,
`VariantCell.tsx`, `variants/page.tsx`, the migration.
**Edited files:** `types.ts`, `lib/data/index.ts`, `scripts/ingest/index.ts`,
`parseCards.ts`, `user-preferences.ts`, `preferences-actions.ts`,
`UserContext.tsx`, `layout.tsx`, `Shell.tsx`, `settings/page.tsx`,
`OwnedCardsContext.tsx`, `PokedexGrid.tsx`, `binder-scope.ts`,
`BinderListPricedGrid.tsx`, `BinderDetailClient.tsx`, `cards/[cardId]/page.tsx`,
`BinderMembership.tsx`.
**Reference analogues (read, don't edit):** `parseMegas.ts`,
`fetchMegaArtwork.ts`, `MegaCell.tsx`, `MegaSeparationSetting.tsx`,
`mega-prefs.ts`, `20260527120000_mega_preferences.sql`.
**Explicitly NOT a touchpoint:** `apply-card-filters.ts` / `card-filters.ts` —
the existing `regionalFormOf()` is a name-based filter facet that does **not**
thread the Mega toggle; ownership correctness lives in `OwnedCardsContext`, so no
change is needed there (matches how Megas work).

## Known edge cases & simplifications

- **Dual-region dex** (Meowth #52) → two variant slots, same `baseDex`.
- **Mega + variant on one dex** (Slowbro #80) → both render; `base → mega →
  variant` order under `inline`.
- **Multi-breed/mode/totem varieties** (Tauros, Galarian Darmanitan, Alolan
  Raticate-totem) → one canonical slot per TCG name via the resolver's pick rule.
- **Basculin override** is the single hard-coded variety mapping; everything else
  resolves by region token. A future region-token-less form surfaces as an
  ingest warning (not a silent drop) → extend the tiny override map.
- **Runtime artwork guard:** `VariantCell` falls back to `baseDex` art if a
  variant has no `artworkId` (none in the current corpus) — same degradation as
  Megas.
- Artwork is fetched at build only; runtime never hits PokéAPI.

## Testing

- **Unit (Vitest) `parseVariants.test.ts`:** prefix detection + suffix stripping
  (`Alolan Ninetales-GX` → Ninetales/alola; `Hisuian Zoroark VSTAR` → Zoroark/hisui),
  tag-team exclusion, `chooseVariantVariety` region-token selection, multi-form
  pick (Tauros → combat-breed; Darmanitan → galar-standard; Raticate → non-totem),
  Basculin override, and — explicitly — **region-exclusive rejection** (Clodsire
  #980, Sneasler #903, Perrserker #863, **Basculegion #902** despite its
  male/female varieties → no variant). The resolver takes injected species
  fixtures, no network.
- **Unit:** the orphan-card invariant — every card `variantFormKey` exists in
  `variants.json`; region-exclusive region-prefixed cards carry none.
- **Unit:** ownership derivation skips `CARD_TO_VARIANT` cards iff the toggle is
  on, and composes with the Mega skip; `binder-scope.pokedexCoverage` variant
  exclusion + `coveredVariantForms` counting.
- **E2E (Playwright):** enable the toggle in Settings; assert a variant slot
  appears with its **distinct** artwork; assert a variant-only card stops
  crediting its base dex; assert a region-exclusive card (Clodsire) still credits
  its base dex; check binder coverage counts a variant in range. Repeat across the
  three placement modes for grid shape.
