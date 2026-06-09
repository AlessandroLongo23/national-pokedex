# Per-binder Mega / regional-variant inclusion toggle

**Date:** 2026-06-09
**Status:** Approved (design); implementation pending

## Problem

A pokedex-scope binder currently shows and counts Mega Evolutions and regional
variants whenever the **global** user preferences `treat_megas_as_separate` /
`treat_variants_as_separate` are on (with a non-`separate` placement). Those
global prefs drive megas/variants **everywhere at once** — the Pokédex page, the
Cards page, *and* every pokedex binder.

The maintainer wants megas/variants to stay separate on the Pokédex and Cards
pages, but **not** appear in the pokedex binder. There is no way today to
decouple the binder from the global prefs.

## Goal

Give each **pokedex-scope** binder its own two independent flags —
*include Mega Evolutions* and *include regional variants* — that control whether
those forms appear/count **in that binder only**. Surface the choice:

1. As two toggles when **creating** a pokedex binder (visible, pre-set to
   *exclude*; `Create` works immediately — not a blocking gate).
2. As a settings control on the **binder detail** page so it can be changed
   later.

Only pokedex-scope binders get these flags. The other 8 scope types are
unaffected.

## Locked decisions

These were confirmed with the maintainer during brainstorming:

1. **Slot coverage = base-only.** The per-binder flag governs *only* whether the
   separate Mega/variant slots appear and are counted in the binder. Base-dex
   coverage is unchanged: it keeps following the **global**
   `treat_megas_as_separate` / `treat_variants_as_separate` rule. So when megas
   are excluded from a binder, an owned Mega Charizard still does **not** fill
   slot #6 — #6 stays uncovered unless a non-mega Charizard card is owned. A
   Mega Charizard simply isn't tracked by that binder.
2. **Existing binders default to exclude.** Absent flag ⇒ excluded. This needs
   **no DB migration** and immediately satisfies the request for existing
   pokedex binders. The flag can be re-enabled per binder in settings.
3. **Creation step is visible, pre-set to exclude.** Two toggles default OFF;
   the user always sees the choice and can flip it before creating. `Create`
   works with the defaults — no forced/blocking interaction.

## Storage approach

Store the two flags inside the binder's existing `scope_params` jsonb column,
alongside `dexFrom` / `dexTo`:

```jsonc
{ "dexFrom": 1, "dexTo": 1025, "includeMegas": false, "includeVariants": false }
```

`scope_params` is already a flexible jsonb (`Record<string, unknown>`), so this
needs **no schema migration**, co-locates the flags with the rest of the binder
scope, and gives the "absent ⇒ excluded" default for free. (Rejected
alternatives: dedicated `binders` columns — needs a migration and the columns
are meaningless for the other scope types; a separate `binder_settings` table —
overkill for two booleans.)

## Semantics — the gating rule

Everywhere a binder currently decides whether to show megas, the rule changes
from:

```ts
includeMegas = treatMegasAsSeparate && megaPlacement !== "separate"
```

to (the per-binder flag simply **ANDed on**):

```ts
includeMegas = perBinder.includeMegas && treatMegasAsSeparate && megaPlacement !== "separate"
```

…and identically for variants. Implications:

- **Per-binder OFF (the default):** no separate Mega/variant slots, regardless
  of global prefs. Base-dex coverage still excludes mega/variant cards (because
  global `treat_*_as_separate` is on), so the binder is a clean one-card-per-dex
  view. This is the maintainer's desired state.
- **Per-binder ON:** behaves as the binder does today — separate slots appear
  iff the global pref is on **and** global placement isn't `separate`.
- **Edge case — global placement = `separate`:** megas live on `/megas`, so they
  never enter a pokedex binder even if the per-binder flag is ON. This is
  consistent with the rest of the app and is documented, not "fixed."
- **Edge case — global `treat_*_as_separate` OFF:** megas fold into the base
  species everywhere (a mega card covers #6). There are no separate mega
  entities to add, so the per-binder flag is moot. The AND with the global pref
  prevents double-counting.

`pokedexCoverage`, `pickDisplayCardId`, and `deriveOwnedSpecies` need **no
changes** — base-only keeps them keyed on the global pref.

## File-by-file changes

### Data & schema

- **`lib/data/binder-scope.ts`**
  - Extend the pokedex member of `ScopeParams` to
    `{ dexFrom: number; dexTo: number; includeMegas?: boolean; includeVariants?: boolean }`.
  - Add `readPokedexFormFlags(scopeParams): { includeMegas: boolean; includeVariants: boolean }`
    — reads the two booleans, **absent ⇒ `false`**. Single source of truth for
    every read surface. (`filterByScope` for pokedex continues to read only
    `dexFrom`/`dexTo`; the extra keys are ignored.)

- **`app/(dashboard)/_lib/binder-actions.ts`**
  - `scopeInputSchema` pokedex branch gains
    `includeMegas: z.boolean().optional()` and
    `includeVariants: z.boolean().optional()`. `createBinder` persists them into
    `scope_params` (they're already spread via `...params`).
  - New server action `setBinderFormInclusion(binderId, { includeMegas, includeVariants })`:
    - Validates `binderId` (uuid) and two booleans.
    - Reuses `assertPokedexBinderOwner` (pokedex-only; throws otherwise).
    - Reads the current `scope_params`, merges the two flags, writes back the
      whole jsonb, bumps `updated_at`.
    - `revalidatePath("/binders")` + `revalidatePath("/binders/${id}")`.

### Creation flow — `app/(dashboard)/binders/_components/NewBinderFlow.tsx`

- Add state `includeMegas` / `includeVariants`, both default `false`.
- In the `scopeType === "pokedex"` section (below the region picker), render an
  **"Include in this binder"** block with two toggles: *Mega Evolutions* and
  *Regional variants*. Styling consistent with the existing pokedex sub-form.
- `buildPayload()` pokedex branch returns
  `{ scopeType, dexFrom, dexTo, includeMegas, includeVariants }`.
- `CreateBinderInput` type already derives from the schema, so it picks up the
  new fields automatically.

### Binder detail settings — `app/(dashboard)/binders/[id]/_components/BinderDetailClient.tsx`

- Read per-binder flags from `binder.scopeParams` via `readPokedexFormFlags`
  (import is server-safe pure fn).
- Change `includeMegasInBinder` / `includeVariantsInBinder` to AND in the
  per-binder flags (the gating rule above). This makes `megasInRange` /
  `variantsInRange` — and therefore the progress `total` and `ownedCount` —
  drop to empty when excluded. The grid already renders base-dex only, so no
  grid change.
- Add a compact **settings control** rendered only for pokedex binders (in the
  header actions cluster, near Print/Delete): a small button revealing two
  toggle switches (same two options). Toggling:
  - Holds optimistic local state (init from `scopeParams`), calls
    `setBinderFormInclusion`, then `router.refresh()`; rolls back local state on
    error — mirroring the existing optimistic override pattern in this file.
- Non-pokedex binders never render the control.

### Binder list — `app/(dashboard)/binders/_components/BinderListPricedGrid.tsx`

- In **both** `BinderListPricedGrid` and `BinderListUnpricedGrid`, for each
  pokedex binder read its per-binder flags and pass *effective* options to
  `pokedexCoverage`: when a flag is OFF, override that form's placement to
  `"separate"` (which zeroes `megaForms` / `variantForms` while leaving
  `treatMegasAsSeparate` true so base-dex exclusion is preserved — exactly
  base-only). Result: the list progress badge stops counting excluded forms.
- The shared `pokedexCoverage` signature is unchanged.

### Print — `app/(dashboard)/binders/[id]/print/page.tsx` + `lib/placeholders/build-print-items.ts`

- **Gate megas:** compute `includeMegas` with the per-binder flag ANDed on;
  `megasInRange` becomes empty when excluded, so no mega placeholders print.
- **Parity fix — add variants to print.** Print currently emits mega
  placeholders but **no variant placeholders at all**. Add variant print items:
  - `print/page.tsx`: build `variantsInRange` (parallel to `megasInRange`),
    gated by the per-binder `includeVariants` flag + global pref, and derive
    `ownedVariantForms` (new `deriveOwnedVariantForms`, parallel to
    `deriveOwnedMegaForms`).
  - `build-print-items.ts`: extend `BuildPrintItemsArgs` with `variantsInRange`,
    `ownedVariantForms`, `treatVariantsAsSeparate`; emit `variant:<variantKey>`
    items (a `variantSpeciesPayload` parallel to `megaSpeciesPayload`); make
    `representativeCard` exclude variant cards too when `treatVariantsAsSeparate`
    (it already takes `excludeMegas`; add an `excludeVariants` parallel).
  - `CARD_TO_VARIANT` index parallel to `CARD_TO_MEGA`, and
    `deriveOwnedSpecies` excludes variant cards when `treatVariantsAsSeparate`
    (parallel to the existing mega handling).
  - This makes the printed binder match the on-screen binder for both forms,
    under the same per-binder gating.

## Out of scope

- When a binder **includes** megas, the detail **grid** still renders base-dex
  cells only (megas/variants are counted in the progress bar but not shown as
  grid cells). This is pre-existing behavior, unchanged here, because the
  default is *exclude*. A follow-up could render included megas/variants as grid
  cells (requires extending the binder's per-dex display/override/picker logic
  to non-dex slots).
- Per-binder **placement** (inline vs appended) — binders use the global
  placement; only on/off is per-binder.

## Testing

- **Unit (Vitest):**
  - `readPokedexFormFlags`: absent ⇒ `{false,false}`; explicit values respected.
  - Effective-options gating: a pokedex binder with `includeMegas:false` yields
    empty `megaForms` from `pokedexCoverage` while base-dex `covered` is
    unchanged (base-only); `includeMegas:true` matches today's behavior.
  - `buildPrintItems`: emits/omits `mega:*` and `variant:*` items per flag;
    base `dex:*` items unaffected.
  - Reuse/extend `binder-scope.test.ts`, `binder-scope-variants.test.ts`,
    `build-print-items.test.ts`.
- **E2E (Playwright):** extend the binder spec(s) — create a pokedex binder with
  both excluded ⇒ progress count is species-only and no mega/variant print
  items; flip a setting ⇒ the form appears. Follow the project's OTP-cookie auth
  pattern (admin magic links don't set SSR cookies).
- **Verification:** `npm run build` (type-check; `npm run lint` is known-broken)
  and `npm test`. Note the pre-existing `coverage.test.ts` `meAdded` failure is
  unrelated.
