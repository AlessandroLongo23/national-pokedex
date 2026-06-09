# Per-binder Mega / regional-variant inclusion toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each pokedex-scope binder two independent flags (include Mega Evolutions / include regional variants) that control whether those forms appear and count in that binder only — surfaced at creation and in binder settings, defaulting to exclude.

**Architecture:** Flags live in the binder's existing `scope_params` jsonb (`includeMegas` / `includeVariants`, absent ⇒ excluded — no migration). A pure `readPokedexFormFlags` reader is the single source of truth. Every binder read surface (detail progress, list progress, print) ANDs the per-binder flag onto the existing `treat*AsSeparate && placement !== "separate"` rule. Base-dex coverage is unchanged (base-only). The print path is brought to parity with the binder by adding variant placeholders.

**Tech Stack:** Next.js 16 App Router, React Server + Client Components, Supabase (jsonb), Zod, Vitest, Playwright, the shared `Toggle` UI component.

Spec: `docs/superpowers/specs/2026-06-09-binder-mega-variant-toggle-design.md`.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `lib/data/binder-scope.ts` | `ScopeParams` pokedex shape + `readPokedexFormFlags` | Modify |
| `app/(dashboard)/_lib/binder-actions.ts` | create schema + `setBinderFormInclusion` action | Modify |
| `app/(dashboard)/binders/_components/NewBinderFlow.tsx` | creation toggles | Modify |
| `app/(dashboard)/binders/[id]/_components/BinderFormSettings.tsx` | settings toggle panel | Create |
| `app/(dashboard)/binders/[id]/_components/BinderDetailClient.tsx` | gate progress + render settings panel | Modify |
| `app/(dashboard)/binders/_components/BinderListPricedGrid.tsx` | gate list coverage | Modify |
| `lib/placeholders/build-print-items.ts` | variant print items + per-flag gating + variant base-exclusion | Modify |
| `app/(dashboard)/binders/[id]/print/page.tsx` | build variantsInRange + gate megas/variants | Modify |
| `tests/unit/binder-scope.test.ts` | `readPokedexFormFlags` tests | Modify |
| `tests/unit/build-print-items.test.ts` | variant + gating tests | Modify |
| `tests/e2e/binder-print.spec.ts` | E2E for exclusion | Modify |

---

## Task 1: Data layer — `ScopeParams` shape + `readPokedexFormFlags`

**Files:**
- Modify: `lib/data/binder-scope.ts`
- Test: `tests/unit/binder-scope.test.ts`

- [ ] **Step 1: Write the failing test** — append to `tests/unit/binder-scope.test.ts`:

```ts
describe("readPokedexFormFlags", () => {
  it("defaults both flags to false when absent", () => {
    expect(readPokedexFormFlags({ dexFrom: 1, dexTo: 1025 })).toEqual({
      includeMegas: false,
      includeVariants: false,
    });
  });

  it("reads explicit booleans, treating only literal true as true", () => {
    expect(
      readPokedexFormFlags({ dexFrom: 1, dexTo: 9, includeMegas: true, includeVariants: false }),
    ).toEqual({ includeMegas: true, includeVariants: false });
    // non-boolean / truthy-but-not-true values do not enable the flag
    expect(
      readPokedexFormFlags({ dexFrom: 1, dexTo: 9, includeMegas: "yes" } as never),
    ).toEqual({ includeMegas: false, includeVariants: false });
  });
});
```

Add `readPokedexFormFlags` to the existing import block at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/binder-scope.test.ts -t "readPokedexFormFlags"`
Expected: FAIL — `readPokedexFormFlags is not a function` / import error.

- [ ] **Step 3: Implement** — in `lib/data/binder-scope.ts`:

Change the pokedex member of `ScopeParams` (around line 66) from:
```ts
  | { dexFrom: number; dexTo: number }
```
to:
```ts
  | { dexFrom: number; dexTo: number; includeMegas?: boolean; includeVariants?: boolean }
```

Add this exported function (place it right after `filterByScope`):
```ts
/** Per-binder Mega/variant inclusion flags for a pokedex-scope binder, read
 * from its `scope_params` jsonb. Absent ⇒ excluded (the default). Only a
 * literal `true` enables a flag. */
export function readPokedexFormFlags(
  scopeParams: ScopeParams | Record<string, unknown>,
): { includeMegas: boolean; includeVariants: boolean } {
  const p = scopeParams as { includeMegas?: unknown; includeVariants?: unknown };
  return {
    includeMegas: p.includeMegas === true,
    includeVariants: p.includeVariants === true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/binder-scope.test.ts -t "readPokedexFormFlags"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/data/binder-scope.ts tests/unit/binder-scope.test.ts
git commit -m "feat(binders): readPokedexFormFlags + scope_params Mega/variant flags"
```

---

## Task 2: Create-schema fields + `setBinderFormInclusion` server action

**Files:**
- Modify: `app/(dashboard)/_lib/binder-actions.ts`

(Server action hits Supabase — covered by `npm run build` type-check + the E2E in Task 8, not a unit test.)

- [ ] **Step 1: Extend the create schema** — in `scopeInputSchema`, change the pokedex branch (lines ~21-25) to:

```ts
    z.object({
      scopeType: z.literal("pokedex"),
      dexFrom: z.number().int().min(1).max(1025),
      dexTo: z.number().int().min(1).max(1025),
      includeMegas: z.boolean().optional(),
      includeVariants: z.boolean().optional(),
    }),
```

`createBinder` already spreads `...params` into `scope_params`, so the two flags persist automatically.

- [ ] **Step 2: Add the server action** — append to `app/(dashboard)/_lib/binder-actions.ts`:

```ts
const formInclusionSchema = z.object({
  includeMegas: z.boolean(),
  includeVariants: z.boolean(),
});

/** Update a pokedex binder's per-binder Mega/variant inclusion flags, merged
 * into its existing scope_params jsonb. Pokedex-scope only. */
export async function setBinderFormInclusion(
  binderId: string,
  flags: { includeMegas: boolean; includeVariants: boolean },
): Promise<void> {
  const id = binderIdSchema.parse(binderId);
  const { includeMegas, includeVariants } = formInclusionSchema.parse(flags);
  await assertPokedexBinderOwner(id);

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { data: row, error: readErr } = await supabase
    .from("binders")
    .select("scope_params")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!row) throw new Error("Binder not found");

  const merged = {
    ...(row.scope_params as Record<string, unknown>),
    includeMegas,
    includeVariants,
  };
  const { error } = await supabase
    .from("binders")
    .update({ scope_params: merged, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  revalidatePath("/binders");
  revalidatePath(`/binders/${id}`);
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: compiles (no type errors in `binder-actions.ts`).

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/_lib/binder-actions.ts
git commit -m "feat(binders): setBinderFormInclusion action + pokedex create-schema flags"
```

---

## Task 3: Creation flow toggles — `NewBinderFlow.tsx`

**Files:**
- Modify: `app/(dashboard)/binders/_components/NewBinderFlow.tsx`

- [ ] **Step 1: Add state** — after the `dexTo` state line (~line 87):

```tsx
  const [includeMegas, setIncludeMegas] = useState(false);
  const [includeVariants, setIncludeVariants] = useState(false);
```

- [ ] **Step 2: Import the Toggle** — add to the imports:

```tsx
import { Toggle } from "@/lib/components/ui/Toggle";
```

- [ ] **Step 3: Extend the payload** — in `buildPayload()`, change the pokedex return type member and the pokedex case:

In the return-type union, change `| { scopeType: "pokedex"; dexFrom: number; dexTo: number }` to:
```ts
    | { scopeType: "pokedex"; dexFrom: number; dexTo: number; includeMegas: boolean; includeVariants: boolean }
```
And the `case "pokedex":` return to:
```ts
      case "pokedex":
        return { scopeType, dexFrom, dexTo, includeMegas, includeVariants };
```

- [ ] **Step 4: Render the toggles** — inside the `scopeType === "pokedex"` block, immediately before the closing `</div>` of its `space-y-3` container (right after the species-count `<p>` around line 506), insert:

```tsx
            <div className="space-y-2 border-t border-border pt-3">
              <div className="text-[11px] uppercase tracking-wider text-muted">
                Include in this binder
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Mega Evolutions
                  <span className="block text-xs text-muted">
                    Add a slot per Mega/Primal form whose base Pokémon is in range.
                  </span>
                </span>
                <Toggle
                  checked={includeMegas}
                  onCheckedChange={setIncludeMegas}
                  aria-label="Include Mega Evolutions in this binder"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Regional variants
                  <span className="block text-xs text-muted">
                    Add a slot per Alolan/Galarian/Hisuian/Paldean form in range.
                  </span>
                </span>
                <Toggle
                  checked={includeVariants}
                  onCheckedChange={setIncludeVariants}
                  aria-label="Include regional variants in this binder"
                />
              </label>
            </div>
```

- [ ] **Step 5: Type-check + commit**

Run: `npm run build`
Expected: compiles.

```bash
git add app/(dashboard)/binders/_components/NewBinderFlow.tsx
git commit -m "feat(binders): Mega/variant inclusion toggles in pokedex create flow"
```

---

## Task 4: Binder detail — settings panel + progress gating

**Files:**
- Create: `app/(dashboard)/binders/[id]/_components/BinderFormSettings.tsx`
- Modify: `app/(dashboard)/binders/[id]/_components/BinderDetailClient.tsx`

- [ ] **Step 1: Create the settings panel** — `BinderFormSettings.tsx`:

```tsx
"use client";

import { Toggle } from "@/lib/components/ui/Toggle";

interface Props {
  includeMegas: boolean;
  includeVariants: boolean;
  pending: boolean;
  onChange: (next: { includeMegas: boolean; includeVariants: boolean }) => void;
}

/** Compact inclusion panel for a pokedex-scope binder. Controlled — the
 * parent owns the flag state so the progress count reacts optimistically. */
export function BinderFormSettings({ includeMegas, includeVariants, pending, onChange }: Props) {
  return (
    <div className="rounded-lg border border-border bg-panel p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted">Binder contents</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Mega Evolutions
            <span className="block text-xs text-muted">Show Mega/Primal slots in range.</span>
          </span>
          <Toggle
            checked={includeMegas}
            disabled={pending}
            onCheckedChange={(next) => onChange({ includeMegas: next, includeVariants })}
            aria-label="Include Mega Evolutions in this binder"
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>
            Regional variants
            <span className="block text-xs text-muted">Show Alolan/Galarian/etc. slots in range.</span>
          </span>
          <Toggle
            checked={includeVariants}
            disabled={pending}
            onCheckedChange={(next) => onChange({ includeMegas, includeVariants: next })}
            aria-label="Include regional variants in this binder"
          />
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire flags + gating into `BinderDetailClient.tsx`**

Add imports:
```tsx
import { readPokedexFormFlags } from "@/lib/data/binder-scope"; // extend existing import
import { setBinderFormInclusion } from "../../../_lib/binder-actions"; // add to existing import
import { BinderFormSettings } from "./BinderFormSettings";
```
(`readPokedexFormFlags` is added to the existing `@/lib/data/binder-scope` import; `setBinderFormInclusion` to the existing `../../../_lib/binder-actions` import.)

After the `overrides` state block (~line 178), add flag state seeded from scope_params:
```tsx
  const initialFlags = useMemo(
    () => readPokedexFormFlags(binder.scopeParams),
    [binder.scopeParams],
  );
  const [includeMegasFlag, setIncludeMegasFlag] = useState(initialFlags.includeMegas);
  const [includeVariantsFlag, setIncludeVariantsFlag] = useState(initialFlags.includeVariants);
  useEffect(() => {
    setIncludeMegasFlag(initialFlags.includeMegas);
    setIncludeVariantsFlag(initialFlags.includeVariants);
  }, [initialFlags]);

  function commitFormInclusion(next: { includeMegas: boolean; includeVariants: boolean }) {
    const prevM = includeMegasFlag;
    const prevV = includeVariantsFlag;
    setIncludeMegasFlag(next.includeMegas);
    setIncludeVariantsFlag(next.includeVariants);
    setError(null);
    start(async () => {
      try {
        await setBinderFormInclusion(binder.id, next);
        router.refresh();
      } catch (err) {
        setIncludeMegasFlag(prevM);
        setIncludeVariantsFlag(prevV);
        setError(err instanceof Error ? err.message : "Failed to update binder contents");
      }
    });
  }
```

Change the two `includeMegasInBinder` / `includeVariantsInBinder` definitions (~lines 78-81) to AND the per-binder flags:
```tsx
  const includeMegasInBinder =
    includeMegasFlag && treatMegasAsSeparate && megaPlacement !== "separate";
  const includeVariantsInBinder =
    includeVariantsFlag && treatVariantsAsSeparate && variantPlacement !== "separate";
```
(Move these two below the flag-state declarations if the linter flags use-before-declaration; they only need to precede `megasInRange`/`variantsInRange`.)

- [ ] **Step 3: Render the panel** — inside the `isPokedex && dexRange ?` branch (~line 406), render the panel just above `<PokedexGrid …>`:
```tsx
            <BinderFormSettings
              includeMegas={includeMegasFlag}
              includeVariants={includeVariantsFlag}
              pending={pending}
              onChange={commitFormInclusion}
            />
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: compiles. Manually confirm: a pokedex binder with flags off shows progress denominator = species count only (no megas/variants), and toggling a switch updates the count optimistically.

- [ ] **Step 5: Commit**

```bash
git add app/(dashboard)/binders/[id]/_components/BinderFormSettings.tsx app/(dashboard)/binders/[id]/_components/BinderDetailClient.tsx
git commit -m "feat(binders): per-binder Mega/variant settings panel + progress gating"
```

---

## Task 5: Binder list coverage gating — `BinderListPricedGrid.tsx`

**Files:**
- Modify: `app/(dashboard)/binders/_components/BinderListPricedGrid.tsx`

The two grids call `pokedexCoverage(params, ownedIds, inRange, { …, megas: MEGAS }, { …, variants: VARIANTS })`. Gate by passing an empty form list when the per-binder flag is off (this zeroes `megaForms`/`variantForms` while leaving `treatMegasAsSeparate` true, preserving base-only exclusion).

- [ ] **Step 1: Import the reader** — change the `@/lib/data/binder-scope` import to also include `readPokedexFormFlags`.

- [ ] **Step 2: Apply gating in `BinderListPricedGrid`** — in the `b.scope_type === "pokedex"` branch (~line 69-78), replace the `pokedexCoverage(...)` call with:
```ts
      const flags = readPokedexFormFlags(b.scope_params);
      const cov = pokedexCoverage(
        params,
        ownedIds,
        inRange,
        { treatMegasAsSeparate, megaPlacement, megas: flags.includeMegas ? MEGAS : [] },
        {
          treatVariantsAsSeparate,
          variantPlacement,
          variants: flags.includeVariants ? VARIANTS : [],
        },
      );
```

- [ ] **Step 3: Apply the identical gating in `BinderListUnpricedGrid`** — same replacement in its pokedex branch (~line 165-174).

- [ ] **Step 4: Type-check + commit**

Run: `npm run build`
Expected: compiles.

```bash
git add app/(dashboard)/binders/_components/BinderListPricedGrid.tsx
git commit -m "feat(binders): gate list progress by per-binder Mega/variant flags"
```

---

## Task 6: Print parity — variants + per-flag gating

**Files:**
- Modify: `lib/placeholders/build-print-items.ts`
- Modify: `app/(dashboard)/binders/[id]/print/page.tsx`
- Test: `tests/unit/build-print-items.test.ts`

- [ ] **Step 1: Write failing tests** — append to `tests/unit/build-print-items.test.ts`. First add `RegionalVariant` to the type import and `treatVariantsAsSeparate` to the `args` defaults:

Change the import line to:
```ts
import type { CardEntry, MegaForm, RegionalVariant } from "@/lib/data/types";
```
In the `args` helper defaults object, add after `ownedMegaForms: new Set(),`:
```ts
    ownedVariantForms: new Set(),
    treatVariantsAsSeparate: false,
```

Add this describe block:
```ts
describe("buildPrintItems — variant slots", () => {
  const variants: RegionalVariant[] = [
    {
      variantKey: "alola-vulpix",
      displayName: "Alolan Vulpix",
      region: "alola",
      baseDex: 37,
      gen: 1,
      types: ["ice"],
      artworkId: 10103,
    },
  ];

  it("omits variant slots unless treatVariantsAsSeparate and variantsInRange are provided", () => {
    const off = buildPrintItems(
      args({ scopeType: "pokedex", dexRange: { from: 30, to: 40 }, variantsInRange: variants }),
    );
    expect(off.some((i) => i.key.startsWith("variant:"))).toBe(false);
  });

  it("appends variant slots with their own art + name when enabled", () => {
    const on = buildPrintItems(
      args({
        scopeType: "pokedex",
        dexRange: { from: 30, to: 40 },
        variantsInRange: variants,
        treatVariantsAsSeparate: true,
        ownedVariantForms: new Set(["alola-vulpix"]),
      }),
    );
    const v = on.find((i) => i.key === "variant:alola-vulpix");
    expect(v).toBeDefined();
    expect(v!.owned).toBe(true);
    expect(v!.species!.name).toBe("Alolan Vulpix");
    expect(v!.species!.artworkUrl).toContain("/official-artwork/10103.png");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/build-print-items.test.ts -t "variant slots"`
Expected: FAIL — `variantsInRange`/`ownedVariantForms`/`treatVariantsAsSeparate` not on `BuildPrintItemsArgs`.

- [ ] **Step 3: Implement in `build-print-items.ts`**

(a) Extend imports — change the `@/lib/data` import to add `VARIANTS, CARD_INDEX_BY_VARIANT`, and the types import to add `RegionalVariant`:
```ts
import { SPECIES, MEGAS, VARIANTS, CARD_INDEX, CARD_INDEX_BY_MEGA, CARD_INDEX_BY_VARIANT, formatSetCode } from "@/lib/data";
```
```ts
import {
  RARITY_LABEL,
  RARITY_ORDER,
  genOf,
  type CardEntry,
  type MegaForm,
  type RegionalVariant,
} from "@/lib/data/types";
```

(b) Extend `BuildPrintItemsArgs` with:
```ts
  /** Regional variant forms whose baseDex falls in range — only non-empty when
   * the binder itself shows them (per-binder includeVariants + global pref). */
  variantsInRange?: RegionalVariant[];
  ownedVariantForms?: Set<string>;
  treatVariantsAsSeparate?: boolean;
```

(c) Add a `VARIANT_BY_KEY` map + `variantSpeciesPayload` next to the mega equivalents:
```ts
const VARIANT_BY_KEY = new Map<string, RegionalVariant>(VARIANTS.map((v) => [v.variantKey, v]));

function variantSpeciesPayload(form: RegionalVariant): SpeciesPayload {
  return {
    dex: form.baseDex,
    name: form.displayName,
    gen: form.gen,
    genus: "",
    heightM: 0,
    weightKg: 0,
    types: form.types ?? [],
    artworkUrl: officialArtworkUrl(form.artworkId ?? form.baseDex),
  };
}
```

(d) Make `representativeCard` exclude variant cards too. Change its signature and body:
```ts
function representativeCard(
  variants: CardEntry[],
  overrideId: string | undefined,
  ownedCardIds: Set<string>,
  excludeMegas: boolean,
  excludeVariants: boolean,
): CardEntry | undefined {
  const usable = variants.filter(
    (c) => (!excludeMegas || !c.megaFormKey) && (!excludeVariants || !c.variantFormKey),
  );
  const ownedForDex = usable.filter((c) => ownedCardIds.has(c.id));
  if (overrideId && ownedForDex.some((c) => c.id === overrideId)) {
    return ownedForDex.find((c) => c.id === overrideId);
  }
  const owned = pickHighestRarity(ownedForDex);
  if (owned) return owned;
  return pickHighestRarity(usable);
}
```
(Note: this folds the `excludeMegas`/`excludeVariants` filtering into one `usable` set, so `pickHighestRarity` is called without its own `excludeMegas` arg here.)

In the pokedex branch, update the `representativeCard` call:
```ts
      const rep = representativeCard(
        variants,
        a.overrides?.[dex],
        a.ownedCardIds,
        a.treatMegasAsSeparate,
        a.treatVariantsAsSeparate === true,
      );
```

(e) Add the variant slot block right after the mega slot block in the pokedex branch:
```ts
    // Variant slots, matching the binder's own inclusion rule.
    if (a.treatVariantsAsSeparate && a.variantsInRange) {
      for (const form of a.variantsInRange) {
        const formCards = a.cards.filter((c) => c.variantFormKey === form.variantKey);
        const rep = pickHighestRarity(formCards);
        items.push({
          key: `variant:${form.variantKey}`,
          owned: (a.ownedVariantForms ?? new Set()).has(form.variantKey),
          species: variantSpeciesPayload(form),
          card: rep ? cardPayload(rep) : undefined,
        });
      }
    }
```

(f) In the card-list branch, resolve a variant card to its own art/name (parallel to megas). Change the species resolution:
```ts
    const megaForm = c.megaFormKey ? MEGA_BY_KEY.get(c.megaFormKey) : undefined;
    const variantForm = c.variantFormKey ? VARIANT_BY_KEY.get(c.variantFormKey) : undefined;
    let species: SpeciesPayload | undefined;
    if (megaForm) {
      species = megaSpeciesPayload(megaForm);
    } else if (variantForm) {
      species = variantSpeciesPayload(variantForm);
    } else if (c.supertype === "Pokémon" && c.dex.length > 0) {
      species = speciesPayload(c.dex[0]!);
    }
```

(g) Extend `deriveOwnedSpecies` to also exclude variant cards (parallel to megas), and add `deriveOwnedVariantForms`:
```ts
const CARD_TO_VARIANT: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [variantKey, ids] of Object.entries(CARD_INDEX_BY_VARIANT)) {
    for (const id of ids) m[id] = variantKey;
  }
  return m;
})();

export function deriveOwnedSpecies(
  ownedCardIds: Set<string>,
  treatMegasAsSeparate: boolean,
  treatVariantsAsSeparate: boolean,
): Set<number> {
  const species = new Set<number>();
  for (const id of ownedCardIds) {
    if (treatMegasAsSeparate && CARD_TO_MEGA[id]) continue;
    if (treatVariantsAsSeparate && CARD_TO_VARIANT[id]) continue;
    const dexes = CARD_TO_DEX[id];
    if (!dexes) continue;
    for (const d of dexes) species.add(d);
  }
  return species;
}

export function deriveOwnedVariantForms(ownedCardIds: Set<string>): Set<string> {
  const forms = new Set<string>();
  for (const id of ownedCardIds) {
    const key = CARD_TO_VARIANT[id];
    if (key) forms.add(key);
  }
  return forms;
}
```

- [ ] **Step 4: Update the test file's `deriveOwnedSpecies` callers if any fail** — the unit suite already passes `treatMegasAsSeparate`; the new third positional arg defaults are not optional, so update the print page (next step). The build-print-items test's `args` helper now includes `treatVariantsAsSeparate`, so `buildPrintItems` tests compile. Run:

Run: `npx vitest run tests/unit/build-print-items.test.ts`
Expected: PASS (existing + new variant tests).

- [ ] **Step 5: Wire the print page** — `app/(dashboard)/binders/[id]/print/page.tsx`:

Change imports:
```ts
import { MEGAS, VARIANTS } from "@/lib/data";
import { readPokedexFormFlags, /* …existing… */ } from "@/lib/data/binder-scope";
import {
  buildPrintItems,
  printDefaultStyle,
  deriveOwnedSpecies,
  deriveOwnedMegaForms,
  deriveOwnedVariantForms,
} from "@/lib/placeholders/build-print-items";
```

Change the owned-species derivation to pass both flags:
```ts
  const ownedSpecies = deriveOwnedSpecies(
    ownedCardIds,
    prefs.treatMegasAsSeparate,
    prefs.treatVariantsAsSeparate,
  );
  const ownedMegaForms = deriveOwnedMegaForms(ownedCardIds);
  const ownedVariantForms = deriveOwnedVariantForms(ownedCardIds);
```

In the `scopeType === "pokedex"` block, gate megas by the per-binder flag and build variantsInRange the same way:
```ts
    const flags = readPokedexFormFlags(scopeParams);
    const includeMegas =
      flags.includeMegas && prefs.treatMegasAsSeparate && prefs.megaPlacement !== "separate";
    if (includeMegas) {
      megasInRange = MEGAS.filter((m) => m.baseDex >= dexRange!.from && m.baseDex <= dexRange!.to);
    }
    const includeVariants =
      flags.includeVariants && prefs.treatVariantsAsSeparate && prefs.variantPlacement !== "separate";
    if (includeVariants) {
      variantsInRange = VARIANTS.filter((v) => v.baseDex >= dexRange!.from && v.baseDex <= dexRange!.to);
    }
```
Declare `let variantsInRange = undefined as typeof VARIANTS | undefined;` next to the existing `megasInRange` declaration.

Pass the new fields to `buildPrintItems`:
```ts
  const items = buildPrintItems({
    scopeType,
    cards,
    ownedCardIds,
    ownedSpecies,
    ownedMegaForms,
    ownedVariantForms,
    dexRange,
    overrides,
    megasInRange,
    variantsInRange,
    treatMegasAsSeparate: prefs.treatMegasAsSeparate,
    treatVariantsAsSeparate: prefs.treatVariantsAsSeparate,
  });
```

- [ ] **Step 6: Type-check**

Run: `npm run build`
Expected: compiles (notably `print/page.tsx` and `build-print-items.ts`).

- [ ] **Step 7: Commit**

```bash
git add lib/placeholders/build-print-items.ts app/(dashboard)/binders/[id]/print/page.tsx tests/unit/build-print-items.test.ts
git commit -m "feat(binders): print variant placeholders + gate megas/variants per binder"
```

---

## Task 7: Full unit + type verification

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: PASS except the pre-existing `coverage.test.ts` `meAdded` failure (documented as unrelated). No new failures.

- [ ] **Step 2: Production type-check**

Run: `npm run build`
Expected: success (`npm run lint` is known-broken — do not use it).

---

## Task 8: E2E coverage

**Files:**
- Modify: `tests/e2e/binder-print.spec.ts`

- [ ] **Step 1: Add an exclusion spec** — following the file's existing auth/setup pattern (OTP verify + injected `@supabase/ssr` cookies; do not use the broken admin-magic-link `signIn`). Create a pokedex binder via `createBinder({ scopeType: "pokedex", dexFrom: 1, dexTo: 151, includeMegas: false, includeVariants: false, name: "…" })` (or the UI flow), open its print page, and assert no `mega:*` / `variant:*` print cells render. Then a second case with `includeMegas: true` asserting mega cells appear (guarded by the test account's global prefs). Match the existing spec's helpers and selectors rather than inventing new ones.

- [ ] **Step 2: Run the spec**

Run: `npx playwright test tests/e2e/binder-print.spec.ts`
Expected: PASS (or document any environment-auth limitation per the project's E2E auth note).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/binder-print.spec.ts
git commit -m "test(binders): e2e for per-binder Mega/variant exclusion in print"
```

---

## Self-review notes

- **Spec coverage:** storage (Task 1) · create schema + action (Task 2) · creation toggles (Task 3) · detail gating + settings UI (Task 4) · list gating (Task 5) · print megas-gating + variant parity + `deriveOwnedSpecies` variant exclusion (Task 6) · verification (Task 7) · E2E (Task 8). All spec sections mapped.
- **Type consistency:** `readPokedexFormFlags` returns `{ includeMegas, includeVariants }` everywhere; `setBinderFormInclusion(binderId, {includeMegas, includeVariants})`; `BuildPrintItemsArgs` gains `variantsInRange`/`ownedVariantForms`/`treatVariantsAsSeparate`; `deriveOwnedSpecies` becomes 3-arg (caller updated in Task 6 Step 5).
- **Base-only invariant:** no changes to `pokedexCoverage`'s `treat*AsSeparate` base-exclusion or `pickDisplayCardId`; gating only zeroes the separate-form lists.
