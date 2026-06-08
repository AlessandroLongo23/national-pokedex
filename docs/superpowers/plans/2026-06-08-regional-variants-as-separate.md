# Regional Variants as Separate Pokémon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent Settings entry that treats regional variants (Alolan, Galarian, Hisuian, Paldean) as their own Pokédex slots — mirroring the Mega Evolutions feature — each showing its own distinct PokéAPI official artwork.

**Architecture:** A build-time resolver (`parseVariants.ts` + `fetchVariantArtwork.ts`) discovers region-prefixed Pokémon, asks PokéAPI `pokemon-species/{dex}` which varieties exist, and keeps only those with a region-tokened form — that same check both filters out region-exclusive species (Clodsire, Sneasler) and yields the form's `artworkId`. Results are committed to `variants.json` / `cardIndexByVariant.json`. At runtime the feature is a pure overlay over the static 1025-slot model (like Megas): a new `treat_variants_as_separate` pref, a `CARD_TO_VARIANT` ownership skip, a `{ kind: "variant" }` grid slot, a `VariantCell`, a `/variants` page, and `binder-scope` coverage parallels.

**Tech Stack:** Next.js 16 (App Router, RSC + Server Actions), Supabase (`@supabase/ssr`), TypeScript (strict), Vitest (unit), Playwright (e2e), PokéAPI (build-time only). Spec: [docs/superpowers/specs/2026-06-08-regional-variants-as-separate-design.md](../specs/2026-06-08-regional-variants-as-separate-design.md).

---

## Reconciliation decisions (resolved before this plan was finalized)

These were flagged by the drafting agents and are settled here — implement as written:

1. **Tauros override (correctness).** The generic "shortest region-tokened name" pick rule would choose `tauros-paldea-aqua-breed`. The spec wants `tauros-paldea-combat-breed`. **Resolution:** the `VARIETY_OVERRIDE` map carries BOTH `"basculin:hisui" → "basculin-white-striped"` AND `"tauros:paldea" → "tauros-paldea-combat-breed"`, and `chooseVariantVariety` checks the override map FIRST. Task 2's code and test below already encode this.
2. **`computeSpecies` extraction (testability).** `deriveSpecies(owned, treatMegasAsSeparate, treatVariantsAsSeparate)` keeps its contract signature but delegates to an exported pure `computeSpecies(owned, opts)` taking injected maps, so the ownership unit test is deterministic without committed card IDs.
3. **`include*` props in binder detail.** `PokedexGrid` derives mega/variant inclusion from `useUser()` context, NOT from props. So in `BinderDetailClient` do **not** pass `includeMegas`/`includeVariants` to `<PokedexGrid>`; only the `total`/`ownedCount` and `pickDisplayCardId(excludeVariants)` edits apply. (Drafted "step 1e" is dropped — see Task in section E.)
4. **`binders/page.tsx` index threading.** The binder LIST components gain `treatVariantsAsSeparate`/`variantPlacement` props; the index page that renders them must pass these. Added as a task in section E.
5. **Empty-data seeding & ordering.** `variants.json=[]` and `cardIndexByVariant.json={}` are committed early (section A) so the barrel + every downstream import type-checks before the first `npm run data:rebuild`. The real 56-variant corpus + artwork appears only after the rebuild (section F). **Execute sections A→F in order**; within a section, tasks are already dependency-ordered.
6. **Deferred (not in this plan):** variant **hover-preview** cards. `MegaCell` shows a hover preview via `PokemonHoverContext`, whose `HoverTarget` union only knows `"dex"`/`"mega"`. `VariantCell` ships without hover to keep the build green. See "Deferred follow-ups" at the end for how to add it later.
7. **Live migration.** Section B applies a Supabase migration to the remote project `ltftoeltwgdpqkemnnmr` (adds two nullable-with-default columns). This is the one outward-facing, hard-to-fully-reverse step — it is additive and safe, but be aware it touches the live database.

---

## A. Data model & ingest pipeline
### Task 1: Types — `RegionalVariant`, `VariantIndex`, `CardEntry.variantFormKey`

**Files:**
- Modify: `lib/data/types.ts:105` (add `variantFormKey?` to `CardEntry`) and `lib/data/types.ts:122-124` (add `VariantRegion`, `RegionalVariant`, `VariantIndex` after `MegaForm`/`MegaIndex`)

This is a pure type-only change — no runtime behaviour, so the gate is the type-check (`npm run build` runs `tsc`). The downstream `parseVariants.ts`/`fetchVariantArtwork.ts` tasks consume these types and their unit tests are the real proof the shapes are right.

- [ ] **Step 1: Add `variantFormKey` to `CardEntry`.** In `lib/data/types.ts`, replace the end of the `CardEntry` interface (the `megaFormKey?` field block, lines 101–106):

  Before:
  ```ts
    // Set for Pokémon cards whose `subtypes` includes "MEGA" and whose name
    // resolves to a known single-Pokémon Mega/Primal form. Tag-team cards
    // (names containing " & ") never get a megaFormKey even though they carry
    // the MEGA subtype.
    megaFormKey?: string;
  }
  ```
  After:
  ```ts
    // Set for Pokémon cards whose `subtypes` includes "MEGA" and whose name
    // resolves to a known single-Pokémon Mega/Primal form. Tag-team cards
    // (names containing " & ") never get a megaFormKey even though they carry
    // the MEGA subtype.
    megaFormKey?: string;
    // Set for Pokémon cards whose name carries a regional prefix (Alolan /
    // Galarian / Hisuian / Paldean) AND whose (region, baseDex) resolved to a
    // true variant in variants.json. Assigned ONLY from the resolved
    // cardIndexByVariant during ingest (never from the name prefix alone), so
    // region-exclusive region-prefixed cards (e.g. Paldean Clodsire) carry no
    // variantFormKey and remain ordinary base-dex cards. A card has at most one
    // of megaFormKey / variantFormKey, or neither.
    variantFormKey?: string;
  }
  ```

- [ ] **Step 2: Add `VariantRegion`, `RegionalVariant`, `VariantIndex`.** In `lib/data/types.ts`, immediately after the `MegaIndex` type alias (line 124, `export type MegaIndex = Record<string, string[]>;`) and before `SpeciesEntry`, insert:
  ```ts

  export type VariantRegion = "alola" | "galar" | "hisui" | "paldea";

  export interface RegionalVariant {
    variantKey: string; // "alola-vulpix", "galar-darmanitan", "hisui-basculin"
    displayName: string; // "Alolan Vulpix", "Galarian Darmanitan"
    region: VariantRegion;
    baseDex: number; // 37
    gen: Generation; // genOf(baseDex)
    /** PokeAPI "form id" for THIS form's official-artwork sprite
     * (`/official-artwork/{id}.png`) — e.g. 10103 for Alolan Vulpix. Resolved
     * during ingest by `resolveVariantArtwork`; absent only for a form PokeAPI
     * doesn't list, in which case the cell falls back to the base species art. */
    artworkId?: number;
  }

  export type VariantIndex = Record<string, string[]>; // variantKey → cardId[]
  ```

- [ ] **Step 3: Type-check** — Run: `npm run build` — Expected: compiles (no type errors).
- [ ] **Step 4: Commit** — `git add lib/data/types.ts && git commit -m "feat(variants): add RegionalVariant, VariantIndex types and CardEntry.variantFormKey"`

---

### Task 2: `parseVariants.ts` — `normalizeVariantName`, `chooseVariantVariety`, `discoverVariants`

**Files:**
- Create: `scripts/ingest/parseVariants.ts`
- Test: `tests/unit/parseVariants.test.ts`

This unit has three pure functions, so it is fully TDD. Write the failing test first, then implement.

- [ ] **Step 1: Write the failing test.** Create `tests/unit/parseVariants.test.ts`:
  ```ts
  import { describe, it, expect } from "vitest";
  import {
    normalizeVariantName,
    chooseVariantVariety,
    discoverVariants,
  } from "@/scripts/ingest/parseVariants";
  import type { CardEntry } from "@/lib/data/types";

  describe("normalizeVariantName", () => {
    it("normalises a plain regional-prefixed name", () => {
      expect(normalizeVariantName("Alolan Vulpix")).toEqual({
        region: "alola",
        baseName: "Vulpix",
      });
      expect(normalizeVariantName("Galarian Moltres")).toEqual({
        region: "galar",
        baseName: "Moltres",
      });
      expect(normalizeVariantName("Hisuian Zoroark")).toEqual({
        region: "hisui",
        baseName: "Zoroark",
      });
      expect(normalizeVariantName("Paldean Tauros")).toEqual({
        region: "paldea",
        baseName: "Tauros",
      });
    });

    it("strips trailing product suffixes (EX, GX, V, VMAX, VSTAR, lowercase ex)", () => {
      expect(normalizeVariantName("Alolan Ninetales-GX")).toEqual({
        region: "alola",
        baseName: "Ninetales",
      });
      expect(normalizeVariantName("Hisuian Zoroark VSTAR")).toEqual({
        region: "hisui",
        baseName: "Zoroark",
      });
      expect(normalizeVariantName("Alolan Raichu-EX")).toEqual({
        region: "alola",
        baseName: "Raichu",
      });
      expect(normalizeVariantName("Galarian Obstagoon ex")).toEqual({
        region: "galar",
        baseName: "Obstagoon",
      });
    });

    it("rejects tag-team / dual-Pokémon cards", () => {
      expect(
        normalizeVariantName("Alolan Ninetales & Vulpix-GX"),
      ).toBeNull();
    });

    it("rejects names without a recognised regional prefix", () => {
      expect(normalizeVariantName("Vulpix")).toBeNull();
      expect(normalizeVariantName("Mega Charizard X")).toBeNull();
      expect(normalizeVariantName("Mr. Mime")).toBeNull();
    });
  });

  describe("chooseVariantVariety", () => {
    // PokeAPI lists each species' regional forms among `varieties`, each with
    // its own "form id" used in the official-artwork sprite path. Region tokens
    // appear in the variety name: -alola / -galar / -hisui / -paldea.
    it("selects the variety whose name contains the region token", () => {
      const vulpix = [
        { name: "vulpix", id: 37 },
        { name: "vulpix-alola", id: 10103 },
      ];
      expect(chooseVariantVariety("vulpix", vulpix, "alola")).toBe(10103);
    });

    it("returns null when no variety carries the region token (region-exclusive)", () => {
      // Perrserker #863 is Galar-only: its species has no non-Galar counterpart
      // listed as a region-tokened variety, so it must NOT become a variant.
      const perrserker = [{ name: "perrserker", id: 863 }];
      expect(chooseVariantVariety("perrserker", perrserker, "galar")).toBeNull();

      // Clodsire #980 — Paldea-only line, single bare variety, no region token.
      const clodsire = [{ name: "clodsire", id: 980 }];
      expect(chooseVariantVariety("clodsire", clodsire, "paldea")).toBeNull();

      // Sneasler #903 — Hisui-exclusive species, single bare variety.
      const sneasler = [{ name: "sneasler", id: 903 }];
      expect(chooseVariantVariety("sneasler", sneasler, "hisui")).toBeNull();

      // Basculegion #902 — has -male / -female varieties but NO region token,
      // so it is correctly rejected as a variant.
      const basculegion = [
        { name: "basculegion-male", id: 902 },
        { name: "basculegion-female", id: 10248 },
      ];
      expect(chooseVariantVariety("basculegion", basculegion, "hisui")).toBeNull();
    });

    it("applies the Hisuian Basculin override (basculin-white-striped)", () => {
      const basculin = [
        { name: "basculin-red-striped", id: 550 },
        { name: "basculin-blue-striped", id: 10016 },
        { name: "basculin-white-striped", id: 10247 },
      ];
      expect(chooseVariantVariety("basculin", basculin, "hisui")).toBe(10247);
    });

    it("picks a -standard form over -zen (Galarian Darmanitan)", () => {
      const darmanitan = [
        { name: "darmanitan-standard", id: 555 },
        { name: "darmanitan-zen", id: 10017 },
        { name: "darmanitan-galar-standard", id: 10018 },
        { name: "darmanitan-galar-zen", id: 10019 },
      ];
      expect(chooseVariantVariety("darmanitan", darmanitan, "galar")).toBe(10018);
    });

    it("picks the combat-breed Paldean Tauros over fire/water breeds", () => {
      const tauros = [
        { name: "tauros", id: 128 },
        { name: "tauros-paldea-combat-breed", id: 10250 },
        { name: "tauros-paldea-blaze-breed", id: 10251 },
        { name: "tauros-paldea-aqua-breed", id: 10252 },
      ];
      // The generic rule would pick the shortest (aqua-breed); the explicit
      // "tauros:paldea" override pins the canonical Combat Breed.
      expect(chooseVariantVariety("tauros", tauros, "paldea")).toBe(10250);
    });

    it("drops the -totem form for Alolan Raticate", () => {
      const raticate = [
        { name: "raticate", id: 20 },
        { name: "raticate-alola", id: 10092 },
        { name: "raticate-totem-alola", id: 10093 },
      ];
      expect(chooseVariantVariety("raticate", raticate, "alola")).toBe(10092);
    });
  });

  function variantCard(
    id: string,
    name: string,
    dex: number,
  ): CardEntry {
    return {
      id,
      name,
      setId: "test",
      supertype: "Pokémon",
      number: "1",
      numberInt: 1,
      rarity: "Rare",
      rarityRaw: "Rare",
      dex: [dex],
      types: [],
      subtypes: [],
      imageSmall: "",
      imageLarge: "",
    };
  }

  describe("discoverVariants", () => {
    it("groups region-prefixed Pokémon by (region, baseDex) with their cardIds", () => {
      const cardsBySet = {
        a: [
          variantCard("a-1", "Alolan Vulpix", 37),
          variantCard("a-2", "Alolan Vulpix-GX", 37),
          variantCard("a-3", "Galarian Moltres", 146),
        ],
        b: [
          variantCard("b-1", "Alolan Vulpix", 37),
          // Dual-region dex: Meowth #52 hosts both alola and galar.
          variantCard("b-2", "Alolan Meowth", 52),
          variantCard("b-3", "Galarian Meowth", 52),
        ],
      };
      const { candidates } = discoverVariants(cardsBySet);
      const byKey = Object.fromEntries(
        candidates.map((c) => [`${c.region}-${c.baseDex}`, c]),
      );

      expect(byKey["alola-37"]!.baseName).toBe("Vulpix");
      expect(byKey["alola-37"]!.cardIds.sort()).toEqual(["a-1", "a-2", "b-1"]);
      expect(byKey["galar-146"]!.cardIds).toEqual(["a-3"]);
      // Meowth #52 → two distinct candidates, same baseDex.
      expect(byKey["alola-52"]!.cardIds).toEqual(["b-2"]);
      expect(byKey["galar-52"]!.cardIds).toEqual(["b-3"]);
    });

    it("ignores non-Pokémon cards and cards without a regional prefix", () => {
      const cardsBySet = {
        a: [
          variantCard("a-1", "Vulpix", 37),
          { ...variantCard("a-2", "Alolan Vulpix", 37), supertype: "Trainer" as const },
        ],
      };
      const { candidates } = discoverVariants(cardsBySet);
      expect(candidates).toEqual([]);
    });

    it("ignores tag-team regional cards", () => {
      const cardsBySet = {
        a: [variantCard("a-1", "Alolan Ninetales & Vulpix-GX", 38)],
      };
      const { candidates } = discoverVariants(cardsBySet);
      expect(candidates).toEqual([]);
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL** — Run: `npx vitest run tests/unit/parseVariants.test.ts` — Expected: FAIL (`Cannot find module '@/scripts/ingest/parseVariants'`).

- [ ] **Step 3: Implement.** Create `scripts/ingest/parseVariants.ts`. It reuses `parseMegas`' tag-team sentinel and product-suffix regex by replicating them exactly (parseMegas keeps them module-private, so we mirror them the same way `parseMegas` declares them). The `VarietyForm` shape is imported from `fetchMegaArtwork` for reuse.
  ```ts
  import { genOf, type CardEntry, type VariantRegion } from "@/lib/data/types";
  import type { VarietyForm } from "./fetchMegaArtwork";

  // Same trailing card-product suffixes parseMegas strips before extracting a
  // form: "-EX", " GX", " V", " VMAX", " VSTAR" (uppercase) and modern " ex".
  const TRAILING_PRODUCT_SUFFIX = /[-\s]+(EX|GX|V|VMAX|VSTAR|ex)\s*$/;

  // Names containing " & " are tag-team / dual-Pokémon cards (e.g. "Alolan
  // Ninetales & Vulpix-GX"). They are never single-Pokémon variants — they keep
  // contributing to every dex# in their `dex` array regardless of the toggle.
  const TAG_TEAM_SENTINEL = " & ";

  // The four canonical regional prefixes → their PokeAPI region token. Detection
  // is by NAME PREFIX (there is no VARIANT subtype, unlike Megas' MEGA subtype).
  const REGION_PREFIX: { re: RegExp; region: VariantRegion }[] = [
    { re: /^Alolan\s+/i, region: "alola" },
    { re: /^Galarian\s+/i, region: "galar" },
    { re: /^Hisuian\s+/i, region: "hisui" },
    { re: /^Paldean\s+/i, region: "paldea" },
  ];

  /**
   * Detect a regional-prefixed Pokémon name and split off the region + the bare
   * base name (product suffixes stripped). Returns null for tag-team cards and
   * for names without one of the four canonical prefixes. Pure, unit-testable.
   */
  export function normalizeVariantName(
    rawName: string,
  ): { region: VariantRegion; baseName: string } | null {
    if (rawName.includes(TAG_TEAM_SENTINEL)) return null;

    let name = rawName.trim();
    const match = REGION_PREFIX.find((p) => p.re.test(name));
    if (!match) return null;

    name = name.replace(match.re, "").trim();
    // Strip stacked product suffixes defensively.
    while (TRAILING_PRODUCT_SUFFIX.test(name)) {
      name = name.replace(TRAILING_PRODUCT_SUFFIX, "").trim();
    }
    if (!name) return null;

    return { region: match.region, baseName: name };
  }

  // PokeAPI species varieties whose `pokemon.name` carries the region token are
  // the regional forms. The override map covers regional forms PokeAPI does NOT
  // tag with a region token (the only one the 66-name corpus needs).
  const REGION_TOKEN: Record<VariantRegion, string> = {
    alola: "alola",
    galar: "galar",
    hisui: "hisui",
    paldea: "paldea",
  };

  const VARIETY_OVERRIDE: Record<string, string> = {
    // Hisuian Basculin → basculin-white-striped (no `hisui` token in PokeAPI).
    "basculin:hisui": "basculin-white-striped",
    // Paldean Tauros has 3 region-tokened breeds (combat/blaze/aqua). The
    // generic "shortest" rule would pick aqua-breed; the canonical TCG
    // "Paldean Tauros" is the Combat Breed, so pin it explicitly.
    "tauros:paldea": "tauros-paldea-combat-breed",
  };

  /**
   * Pick the PokeAPI variety id for a `(region)` form of `slug`, given the
   * species' varieties. Pure (no network) so the rules are unit-testable:
   *   - an override wins outright (Hisuian Basculin → basculin-white-striped;
   *     Paldean Tauros → tauros-paldea-combat-breed);
   *   - otherwise select varieties whose name contains the region token;
   *   - among several, pick the canonical representative: prefer a `-standard`
   *     form, else a name without `zen`/`totem`, else the shortest (handles
   *     Galarian Darmanitan standard/zen and Alolan Raticate's -totem);
   *   - return null → region-exclusive: the `(region, dex)` is NOT a variant
   *     (drops Clodsire/Sneasler/Perrserker, and Basculegion whose varieties are
   *     `-male`/`-female` with no region token).
   */
  export function chooseVariantVariety(
    slug: string,
    forms: VarietyForm[],
    region: VariantRegion,
  ): number | null {
    const override = VARIETY_OVERRIDE[`${slug}:${region}`];
    if (override) {
      return forms.find((f) => f.name === override)?.id ?? null;
    }

    const token = REGION_TOKEN[region];
    const matching = forms.filter((f) => f.name.includes(token));
    if (matching.length === 0) return null;
    if (matching.length === 1) return matching[0]!.id;

    const standard = matching.find((f) => f.name.includes("standard"));
    if (standard) return standard.id;

    const clean = matching.filter(
      (f) => !f.name.includes("zen") && !f.name.includes("totem"),
    );
    const pool = clean.length > 0 ? clean : matching;
    const shortest = pool.reduce((a, b) => (a.name.length <= b.name.length ? a : b));
    return shortest.id;
  }

  export interface VariantCandidate {
    region: VariantRegion;
    baseName: string;
    baseDex: number;
    gen: ReturnType<typeof genOf>;
    cardIds: string[];
  }

  /**
   * Group region-prefixed Pokémon cards by (region, baseDex) into candidates
   * carrying their cardIds. One dex can host two candidates (Meowth #52 →
   * Alolan + Galarian). Whether a candidate is a true variant is decided later
   * by the species-varieties resolver (`resolveVariantArtwork`), never here.
   */
  export function discoverVariants(
    cardsBySet: Record<string, CardEntry[]>,
  ): { candidates: VariantCandidate[] } {
    const byKey = new Map<string, VariantCandidate & { dexes: Set<number> }>();

    for (const cards of Object.values(cardsBySet)) {
      for (const card of cards) {
        if (card.supertype !== "Pokémon") continue;
        const baseDex = card.dex[0];
        if (baseDex === undefined) continue;
        const normalized = normalizeVariantName(card.name);
        if (!normalized) continue;

        const key = `${normalized.region}-${baseDex}`;
        let entry = byKey.get(key);
        if (!entry) {
          entry = {
            region: normalized.region,
            baseName: normalized.baseName,
            baseDex,
            gen: genOf(baseDex),
            cardIds: [],
            dexes: new Set<number>(),
          };
          byKey.set(key, entry);
        }
        entry.cardIds.push(card.id);
        entry.dexes.add(baseDex);
      }
    }

    const candidates: VariantCandidate[] = [...byKey.values()].map((e) => ({
      region: e.region,
      baseName: e.baseName,
      baseDex: e.baseDex,
      gen: e.gen,
      cardIds: e.cardIds,
    }));

    return { candidates };
  }
  ```

- [ ] **Step 4: Run it, expect PASS** — Run: `npx vitest run tests/unit/parseVariants.test.ts` — Expected: PASS (all describe blocks green).
- [ ] **Step 5: Commit** — `git add scripts/ingest/parseVariants.ts tests/unit/parseVariants.test.ts && git commit -m "feat(variants): parseVariants — normalizeVariantName, chooseVariantVariety, discoverVariants"`

---

### Task 3: `fetchVariantArtwork.ts` — `resolveVariantArtwork`

**Files:**
- Create: `scripts/ingest/fetchVariantArtwork.ts`

Mirrors `resolveMegaArtwork`: fetches `pokemon-species/{dex}` per distinct baseDex (same concurrency / retry / politeness as the Mega fetcher via the shared `fetchJson`), applies `chooseVariantVariety`, and folds detection + artwork into one pass — a candidate that resolves to `null` is dropped (it is region-exclusive), a candidate that resolves to an id becomes a `RegionalVariant` with that `artworkId`. The network shape (`SpeciesVarietiesResp`, `idFromPokemonUrl`) lives in `fetchMegaArtwork.ts` but is module-private there, so we re-declare the same small response shape here exactly as the Mega fetcher does, and reuse the exported `VarietyForm`. Because the only impure surface is the network worker (no unit test seam without a fetch mock), the gate is the build; the pure decision logic it calls (`chooseVariantVariety`) is already covered by `parseVariants.test.ts`.

- [ ] **Step 1: Implement.** Create `scripts/ingest/fetchVariantArtwork.ts`:
  ```ts
  import {
    genOf,
    type RegionalVariant,
    type VariantIndex,
    type VariantRegion,
  } from "@/lib/data/types";
  import type { VarietyForm } from "./fetchMegaArtwork";
  import { chooseVariantVariety, type VariantCandidate } from "./parseVariants";

  // Resolves each region-prefixed candidate to its PokeAPI form id (used in the
  // official-artwork sprite path `/official-artwork/{id}.png`) AND decides, in
  // the same pass, whether it is a true variant at all. A candidate whose
  // (region, dex) has no region-tokened variety is region-exclusive and is
  // dropped (Clodsire #980, Sneasler #903, Perrserker #863, Basculegion #902…).
  // Runs only at ingest (`npm run data:rebuild`); runtime never hits PokeAPI.

  const POKEAPI = "https://pokeapi.co/api/v2";
  const CONCURRENCY = 8;
  const RETRIES = 3;
  const RETRY_DELAY_MS = 800;

  // Region rank for the stable render order required by variants.json:
  // alola < galar < hisui < paldea, then baseDex.
  const REGION_RANK: Record<VariantRegion, number> = {
    alola: 0,
    galar: 1,
    hisui: 2,
    paldea: 3,
  };

  interface SpeciesVarietiesResp {
    /** Species slug, e.g. "vulpix". */
    name: string;
    varieties: { pokemon: { name: string; url: string } }[];
  }

  async function fetchJson<T>(url: string): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < RETRIES; i++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText} (${url})`);
        return (await res.json()) as T;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
      }
    }
    throw lastErr;
  }

  function idFromPokemonUrl(url: string): number | null {
    const m = url.match(/\/pokemon\/(\d+)\/?$/);
    return m ? parseInt(m[1]!, 10) : null;
  }

  function displayNameFor(region: VariantRegion, baseName: string): string {
    const prefix: Record<VariantRegion, string> = {
      alola: "Alolan",
      galar: "Galarian",
      hisui: "Hisuian",
      paldea: "Paldean",
    };
    return `${prefix[region]} ${baseName}`;
  }

  function slugFor(baseName: string): string {
    // Base-name lower-kebab with apostrophes/periods stripped: "Mr. Mime" →
    // "mr-mime", "Farfetch'd" → "farfetchd".
    return baseName
      .toLowerCase()
      .replace(/['’.]/g, "")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  }

  /**
   * Resolve candidates to true `RegionalVariant`s with artwork. Fetches each
   * distinct baseDex's species once, maps its varieties to {name,id}, applies
   * `chooseVariantVariety`, drops unresolved (region-exclusive) candidates with
   * a console.warn, and returns variants sorted by (region rank, baseDex) plus
   * the matching `cardIndexByVariant`.
   */
  export async function resolveVariantArtwork(
    candidates: VariantCandidate[],
  ): Promise<{ variants: RegionalVariant[]; cardIndexByVariant: VariantIndex }> {
    const dexes = [...new Set(candidates.map((c) => c.baseDex))];
    const byDex = new Map<number, { slug: string; forms: VarietyForm[] }>();

    let next = 0;
    async function worker() {
      while (true) {
        const i = next++;
        if (i >= dexes.length) return;
        const dex = dexes[i]!;
        try {
          const sp = await fetchJson<SpeciesVarietiesResp>(
            `${POKEAPI}/pokemon-species/${dex}`,
          );
          const forms = sp.varieties
            .map((v) => ({ name: v.pokemon.name, id: idFromPokemonUrl(v.pokemon.url) }))
            .filter((f): f is VarietyForm => f.id != null);
          byDex.set(dex, { slug: sp.name, forms });
        } catch (err) {
          console.warn(`[variant-art] species dex=${dex} failed: ${(err as Error).message}`);
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    const variants: RegionalVariant[] = [];
    const cardIndexByVariant: VariantIndex = {};

    for (const c of candidates) {
      const entry = byDex.get(c.baseDex);
      if (!entry) {
        console.warn(
          `[variant-art] no species data for ${c.region} ${c.baseName} (dex=${c.baseDex}) — dropping`,
        );
        continue;
      }
      const artworkId = chooseVariantVariety(entry.slug, entry.forms, c.region);
      if (artworkId == null) {
        // Region-exclusive: NOT a variant. Drop it (its cards stay on base dex).
        // Warn so a future set's unrecognised regional form surfaces at build.
        console.warn(
          `[variant-art] region-exclusive (no ${c.region} variety) for ${c.baseName} (dex=${c.baseDex}) — not a variant`,
        );
        continue;
      }
      const variantKey = `${c.region}-${slugFor(c.baseName)}`;
      variants.push({
        variantKey,
        displayName: displayNameFor(c.region, c.baseName),
        region: c.region,
        baseDex: c.baseDex,
        gen: genOf(c.baseDex),
        artworkId,
      });
      cardIndexByVariant[variantKey] = c.cardIds;
    }

    variants.sort(
      (a, b) => REGION_RANK[a.region] - REGION_RANK[b.region] || a.baseDex - b.baseDex,
    );

    return { variants, cardIndexByVariant };
  }
  ```

- [ ] **Step 2: Type-check** — Run: `npm run build` — Expected: compiles.
- [ ] **Step 3: Commit** — `git add scripts/ingest/fetchVariantArtwork.ts && git commit -m "feat(variants): fetchVariantArtwork — resolveVariantArtwork (detect + artwork in one pass)"`

---

### Task 4: Wire `scripts/ingest/index.ts` + barrel exports

**Files:**
- Modify: `scripts/ingest/index.ts:6-7` (imports), `scripts/ingest/index.ts:120-139` (call discoverVariants → resolveVariantArtwork, derive variantFormKey onto cards), `scripts/ingest/index.ts:208-209` (writeJson new files)
- Modify: `lib/data/index.ts:10-11` + `:18-19` + `:37-38` (barrel exports)
- Test: `tests/unit/variantOrphanInvariant.test.ts` (asserts the orphan invariant over the derive step)

The `variantFormKey` is derived onto cards **here** (the orphan invariant), never in `parseCards`. The derive step is pure list-walking, so it gets a focused unit test that proves region-exclusive cards (dropped by the resolver, so absent from `cardIndexByVariant`) carry no `variantFormKey`.

- [ ] **Step 1: Write the failing test** for the orphan invariant. Create `tests/unit/variantOrphanInvariant.test.ts`. It exercises a small exported helper `applyVariantFormKeys` (added in Step 3) so the invariant is testable without running the full network ingest:
  ```ts
  import { describe, it, expect } from "vitest";
  import { applyVariantFormKeys } from "@/scripts/ingest/parseVariants";
  import type { CardEntry, VariantIndex } from "@/lib/data/types";

  function card(id: string, name: string, dex: number): CardEntry {
    return {
      id,
      name,
      setId: "test",
      supertype: "Pokémon",
      number: "1",
      numberInt: 1,
      rarity: "Rare",
      rarityRaw: "Rare",
      dex: [dex],
      types: [],
      subtypes: [],
      imageSmall: "",
      imageLarge: "",
    };
  }

  describe("applyVariantFormKeys (orphan-card invariant)", () => {
    it("assigns variantFormKey ONLY from the resolved cardIndexByVariant", () => {
      const cardsBySet = {
        a: [
          card("a-1", "Alolan Vulpix", 37), // resolved variant
          card("a-2", "Paldean Clodsire", 980), // region-exclusive → dropped
          card("a-3", "Vulpix", 37), // ordinary base card
        ],
      };
      // Resolver kept only alola-vulpix; clodsire never made it into the index.
      const cardIndexByVariant: VariantIndex = { "alola-vulpix": ["a-1"] };

      applyVariantFormKeys(cardsBySet, cardIndexByVariant);

      expect(cardsBySet.a[0]!.variantFormKey).toBe("alola-vulpix");
      // Region-exclusive region-prefixed card carries NO variantFormKey.
      expect(cardsBySet.a[1]!.variantFormKey).toBeUndefined();
      // Ordinary base card unaffected.
      expect(cardsBySet.a[2]!.variantFormKey).toBeUndefined();
    });

    it("every assigned variantFormKey exists as a key in the index", () => {
      const cardsBySet = {
        a: [card("a-1", "Galarian Meowth", 52), card("a-2", "Alolan Meowth", 52)],
      };
      const cardIndexByVariant: VariantIndex = {
        "alola-meowth": ["a-2"],
        "galar-meowth": ["a-1"],
      };
      applyVariantFormKeys(cardsBySet, cardIndexByVariant);
      for (const cards of Object.values(cardsBySet)) {
        for (const c of cards) {
          if (c.variantFormKey !== undefined) {
            expect(cardIndexByVariant[c.variantFormKey]).toBeDefined();
          }
        }
      }
    });
  });
  ```

- [ ] **Step 2: Run it, expect FAIL** — Run: `npx vitest run tests/unit/variantOrphanInvariant.test.ts` — Expected: FAIL (`applyVariantFormKeys` is not exported).

- [ ] **Step 3a: Add `applyVariantFormKeys` to `parseVariants.ts`.** Append to `scripts/ingest/parseVariants.ts` (the import of `VariantIndex` must be added to the existing top-of-file type import):

  Change the first import line from:
  ```ts
  import { genOf, type CardEntry, type VariantRegion } from "@/lib/data/types";
  ```
  to:
  ```ts
  import {
    genOf,
    type CardEntry,
    type VariantIndex,
    type VariantRegion,
  } from "@/lib/data/types";
  ```
  Then append at the end of the file:
  ```ts

  /**
   * Derive `variantFormKey` onto cards from the RESOLVED `cardIndexByVariant`
   * (the orphan-card invariant): a card gets a variantFormKey iff its id appears
   * in the index — i.e. its (region, dex) resolved to a true variant. Cards that
   * were region-exclusive (dropped by the resolver, absent from the index) keep
   * no variantFormKey and remain ordinary base-dex cards. Mutates in place.
   */
  export function applyVariantFormKeys(
    cardsBySet: Record<string, CardEntry[]>,
    cardIndexByVariant: VariantIndex,
  ): void {
    const cardToVariant = new Map<string, string>();
    for (const [variantKey, ids] of Object.entries(cardIndexByVariant)) {
      for (const id of ids) cardToVariant.set(id, variantKey);
    }
    for (const cards of Object.values(cardsBySet)) {
      for (const card of cards) {
        const key = cardToVariant.get(card.id);
        if (key) card.variantFormKey = key;
      }
    }
  }
  ```

- [ ] **Step 3b: Run the invariant test, expect PASS** — Run: `npx vitest run tests/unit/variantOrphanInvariant.test.ts` — Expected: PASS.

- [ ] **Step 3c: Wire `scripts/ingest/index.ts`.** First extend the imports. Replace lines 6–7:

  Before:
  ```ts
  import { discoverMegas, mergeGenericMegaForms } from "./parseMegas";
  import { resolveMegaArtwork } from "./fetchMegaArtwork";
  ```
  After:
  ```ts
  import { discoverMegas, mergeGenericMegaForms } from "./parseMegas";
  import { resolveMegaArtwork } from "./fetchMegaArtwork";
  import { discoverVariants, applyVariantFormKeys } from "./parseVariants";
  import { resolveVariantArtwork } from "./fetchVariantArtwork";
  ```

  Then, after the mega-artwork block (the `console.log` ending at line 139, immediately before `const coverage = computeCoverage(...)` at line 141), insert the variant resolution block:
  ```ts

    const variantDiscovery = discoverVariants(cardsBySet);
    const { variants, cardIndexByVariant } = await resolveVariantArtwork(
      variantDiscovery.candidates,
    );
    // Orphan-card invariant: assign variantFormKey ONLY from the resolved index,
    // never from the name prefix — region-exclusive cards (Clodsire, Sneasler…)
    // get none and stay on their base dex.
    applyVariantFormKeys(cardsBySet, cardIndexByVariant);
    console.log(
      `[ingest] variants: ${variants.length} true variants from ${variantDiscovery.candidates.length} region-prefixed candidates`,
    );
  ```

  Finally, after the two Mega writeJson lines (208–209), add the variant outputs:

  Before:
  ```ts
    writeJson(path.join(dataDir, "megas.json"), megas);
    writeJson(path.join(dataDir, "cardIndexByMega.json"), cardIndexByMega);
  ```
  After:
  ```ts
    writeJson(path.join(dataDir, "megas.json"), megas);
    writeJson(path.join(dataDir, "cardIndexByMega.json"), cardIndexByMega);
    writeJson(path.join(dataDir, "variants.json"), variants);
    writeJson(path.join(dataDir, "cardIndexByVariant.json"), cardIndexByVariant);
  ```

- [ ] **Step 3d: Seed placeholder data files** so the barrel imports resolve before the first real `data:rebuild`. Create `lib/data/variants.json` with content `[]` and `lib/data/cardIndexByVariant.json` with content `{}` (both followed by a trailing newline, matching `writeJson`). These get overwritten by the next `npm run data:rebuild`.

  `lib/data/variants.json`:
  ```json
  []
  ```
  `lib/data/cardIndexByVariant.json`:
  ```json
  {}
  ```

- [ ] **Step 3e: Add barrel exports** in `lib/data/index.ts`. Add the imports after line 11 (`import cardIndexByMega from "./cardIndexByMega.json";`):

  Before:
  ```ts
  import megas from "./megas.json";
  import cardIndexByMega from "./cardIndexByMega.json";
  ```
  After:
  ```ts
  import megas from "./megas.json";
  import cardIndexByMega from "./cardIndexByMega.json";
  import variants from "./variants.json";
  import cardIndexByVariant from "./cardIndexByVariant.json";
  ```

  Add the types to the `import type { … } from "./types"` block (after `MegaIndex,` on line 19):

  Before:
  ```ts
    MegaForm,
    MegaIndex,
    PokedexEntry,
  ```
  After:
  ```ts
    MegaForm,
    MegaIndex,
    PokedexEntry,
    RegionalVariant,
    VariantIndex,
  ```
  (Inserting after `MegaIndex,` keeps it alphabetical-ish like the surrounding block; the exact position within the type-only import list is immaterial.)

  Add the runtime exports after line 38 (`export const CARD_INDEX_BY_MEGA = …`):

  Before:
  ```ts
  export const MEGAS = megas as MegaForm[];
  export const CARD_INDEX_BY_MEGA = cardIndexByMega as MegaIndex;
  ```
  After:
  ```ts
  export const MEGAS = megas as MegaForm[];
  export const CARD_INDEX_BY_MEGA = cardIndexByMega as MegaIndex;
  export const VARIANTS = variants as RegionalVariant[];
  export const CARD_INDEX_BY_VARIANT = cardIndexByVariant as VariantIndex;
  ```

- [ ] **Step 4: Type-check + full unit suite** — Run: `npm run build` — Expected: compiles. Then Run: `npx vitest run tests/unit/parseVariants.test.ts tests/unit/variantOrphanInvariant.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** — `git add scripts/ingest/index.ts scripts/ingest/parseVariants.ts lib/data/index.ts lib/data/variants.json lib/data/cardIndexByVariant.json tests/unit/variantOrphanInvariant.test.ts && git commit -m "feat(variants): wire ingest (discover→resolve→deriveFormKey→writeJson) + barrel VARIANTS/CARD_INDEX_BY_VARIANT"`

> Note: run `npm run data:rebuild` once after merge to populate `variants.json` / `cardIndexByVariant.json` with the real 56-variant corpus (network — fetches PokéAPI). The spec's validation expects 56 true variants / 10 region-exclusive (66 total).

## B. Preferences & migration
### Task 5: Migration — variant preferences columns

**Files:**
- Create: `supabase/migrations/20260608150000_variant_preferences.sql`

Timestamp `20260608150000` is monotonic and strictly after the latest existing migration `20260608140000_group_singles_hardening.sql`. Exact mirror of `20260527120000_mega_preferences.sql`.

- [ ] **Step 1: Create the migration file**
```sql
-- Per-user toggle for treating regional variants (Alolan, Galarian, Hisuian,
-- Paldean forms) as separate Pokémon instead of folding them into their base
-- Pokédex#. When ON, a placement sub-setting decides where variant slots
-- render: appended after #1025, inline next to the base form, or on a
-- dedicated /variants page. Independent of the Mega toggle — a user can enable
-- either, both, or neither.

alter table public.user_preferences
  add column treat_variants_as_separate boolean not null default false,
  add column variant_placement text not null default 'appended'
    check (variant_placement in ('appended', 'inline', 'separate'));

notify pgrst, 'reload schema';
```
- [ ] **Step 2: Apply the migration to the remote project**
Apply via the Supabase MCP (project `ltftoeltwgdpqkemnnmr`): call `mcp__supabase__apply_migration` with `name: "variant_preferences"` and `query` set to the SQL above. If the MCP is unavailable, run the Supabase CLI instead: `supabase db push` (or `supabase migration up`) from the repo root.
- [ ] **Step 3: Verify the columns exist** — Run `mcp__supabase__list_tables` (or `mcp__supabase__execute_sql` with `select column_name, data_type, column_default from information_schema.columns where table_name = 'user_preferences' and column_name in ('treat_variants_as_separate', 'variant_placement');`) — Expected: both columns present, `treat_variants_as_separate` boolean default `false`, `variant_placement` text default `'appended'`.
- [ ] **Step 4: Commit** — `git add supabase/migrations/20260608150000_variant_preferences.sql && git commit -m "feat(variants): add variant preference columns migration"`

---

### Task 6: variant-prefs.ts (client-safe constants)

**Files:**
- Create: `app/(dashboard)/_lib/variant-prefs.ts`

Exact mirror of `app/(dashboard)/_lib/mega-prefs.ts`. Kept separate from `user-preferences.ts` because that file imports the server-only Supabase client and can't be loaded by client components.

- [ ] **Step 1: Create the file**
```ts
// Client-safe constants and types for the "treat regional variants as
// separate" feature. Kept separate from `user-preferences.ts` because that
// file imports the server-only Supabase client and can't be loaded by client
// components.

export const VARIANT_PLACEMENTS = ["appended", "inline", "separate"] as const;
export type VariantPlacement = (typeof VARIANT_PLACEMENTS)[number];
```
- [ ] **Step 2: Type-check** — Run: `npm run build` — Expected: compiles (no consumers yet; this just adds the module).
- [ ] **Step 3: Commit** — `git add "app/(dashboard)/_lib/variant-prefs.ts" && git commit -m "feat(variants): add client-safe variant-prefs constants"`

---

### Task 7: user-preferences.ts — load + re-export variant prefs

**Files:**
- Modify: `app/(dashboard)/_lib/user-preferences.ts:1-44`

Loads the two new columns in the **same** `loadUserPreferences()` query (no extra round-trip), validates `variant_placement` against `VARIANT_PLACEMENTS`, and re-exports `VARIANT_PLACEMENTS`/`VariantPlacement` so `preferences-actions.ts` and UI can import them from here (mirror of the `MEGA_PLACEMENTS` re-export).

- [ ] **Step 1: Add the import + re-export** (mirror line 4/6)

Before:
```ts
import { MEGA_PLACEMENTS, type MegaPlacement } from "./mega-prefs";

export { MEGA_PLACEMENTS, type MegaPlacement };
```
After:
```ts
import { MEGA_PLACEMENTS, type MegaPlacement } from "./mega-prefs";
import { VARIANT_PLACEMENTS, type VariantPlacement } from "./variant-prefs";

export { MEGA_PLACEMENTS, type MegaPlacement };
export { VARIANT_PLACEMENTS, type VariantPlacement };
```

- [ ] **Step 2: Add the default** (mirror line 9)

Before:
```ts
const DEFAULT_PRICE_SOURCE: PriceSource = "tcgplayer";
const DEFAULT_MEGA_PLACEMENT: MegaPlacement = "appended";
```
After:
```ts
const DEFAULT_PRICE_SOURCE: PriceSource = "tcgplayer";
const DEFAULT_MEGA_PLACEMENT: MegaPlacement = "appended";
const DEFAULT_VARIANT_PLACEMENT: VariantPlacement = "appended";
```

- [ ] **Step 3: Extend the `UserPreferences` interface** (mirror lines 16-17)

Before:
```ts
export interface UserPreferences {
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  displayCurrency: Currency;
}
```
After:
```ts
export interface UserPreferences {
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  treatVariantsAsSeparate: boolean;
  variantPlacement: VariantPlacement;
  displayCurrency: Currency;
}
```

- [ ] **Step 4: Extend the select columns** (line 25)

Before:
```ts
    .select("price_source, treat_megas_as_separate, mega_placement, display_currency")
```
After:
```ts
    .select(
      "price_source, treat_megas_as_separate, mega_placement, treat_variants_as_separate, variant_placement, display_currency",
    )
```

- [ ] **Step 5: Validate + return the new fields** (mirror lines 32-43)

Before:
```ts
  const rawPlacement = data?.mega_placement as string | undefined;
  const megaPlacement = MEGA_PLACEMENTS.includes(rawPlacement as MegaPlacement)
    ? (rawPlacement as MegaPlacement)
    : DEFAULT_MEGA_PLACEMENT;
  const rawCurrency = data?.display_currency as string | undefined;
  const displayCurrency = isCurrency(rawCurrency) ? rawCurrency : DEFAULT_DISPLAY_CURRENCY;
  return {
    priceSource,
    treatMegasAsSeparate: data?.treat_megas_as_separate === true,
    megaPlacement,
    displayCurrency,
  };
```
After:
```ts
  const rawPlacement = data?.mega_placement as string | undefined;
  const megaPlacement = MEGA_PLACEMENTS.includes(rawPlacement as MegaPlacement)
    ? (rawPlacement as MegaPlacement)
    : DEFAULT_MEGA_PLACEMENT;
  const rawVariantPlacement = data?.variant_placement as string | undefined;
  const variantPlacement = VARIANT_PLACEMENTS.includes(
    rawVariantPlacement as VariantPlacement,
  )
    ? (rawVariantPlacement as VariantPlacement)
    : DEFAULT_VARIANT_PLACEMENT;
  const rawCurrency = data?.display_currency as string | undefined;
  const displayCurrency = isCurrency(rawCurrency) ? rawCurrency : DEFAULT_DISPLAY_CURRENCY;
  return {
    priceSource,
    treatMegasAsSeparate: data?.treat_megas_as_separate === true,
    megaPlacement,
    treatVariantsAsSeparate: data?.treat_variants_as_separate === true,
    variantPlacement,
    displayCurrency,
  };
```

- [ ] **Step 6: Type-check** — Run: `npm run build` — Expected: compiles (the new interface fields are populated; any consumer that builds a `UserPreferences` object literal lives in `layout.tsx`/`Shell.tsx`, which are wired in the context cluster — note to orchestrator below).
- [ ] **Step 7: Commit** — `git add "app/(dashboard)/_lib/user-preferences.ts" && git commit -m "feat(variants): load variant prefs in loadUserPreferences"`

---

### Task 8: preferences-actions.ts — updateVariantSettings server action

**Files:**
- Modify: `app/(dashboard)/_lib/preferences-actions.ts:8,31-57`

Mirror of `updateMegaSettings`: validate placement against `VARIANT_PLACEMENTS`, `requireUserId()`, upsert the two columns with `updated_at`, then `revalidatePath` the same set as Megas with `/megas` swapped for `/variants`.

- [ ] **Step 1: Extend the import to pull in the variant constants** (line 8)

Before:
```ts
import { MEGA_PLACEMENTS, type MegaPlacement } from "./user-preferences";
```
After:
```ts
import { MEGA_PLACEMENTS, type MegaPlacement } from "./user-preferences";
import { VARIANT_PLACEMENTS, type VariantPlacement } from "./user-preferences";
```

- [ ] **Step 2: Add `updateVariantSettings` immediately after `updateMegaSettings`** (after line 57)

Insert this new function after the closing brace of `updateMegaSettings`:
```ts
export async function updateVariantSettings(
  treatAsSeparate: boolean,
  placement: VariantPlacement,
): Promise<void> {
  if (!VARIANT_PLACEMENTS.includes(placement)) {
    throw new Error(`Invalid variant placement: ${placement}`);
  }
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      treat_variants_as_separate: treatAsSeparate,
      variant_placement: placement,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to update variant settings: ${error.message}`);
  // The toggle affects every page that derives coverage from owned cards.
  revalidatePath("/settings");
  revalidatePath("/pokedex");
  revalidatePath("/variants");
  revalidatePath("/binders");
  revalidatePath("/binders/[id]", "page");
  revalidatePath("/cards");
}
```

- [ ] **Step 3: Type-check** — Run: `npm run build` — Expected: compiles. The action is exported but the only caller, `VariantSeparationSetting.tsx`, is built in the settings/UI cluster, so no caller is required here.
- [ ] **Step 4: Commit** — `git add "app/(dashboard)/_lib/preferences-actions.ts" && git commit -m "feat(variants): add updateVariantSettings server action"`

## C. Contexts, layout & navigation
### Task 9: UserContext — thread treatVariantsAsSeparate + variantPlacement

**Files:**
- Modify: `app/(dashboard)/_lib/UserContext.tsx:9` (import), `:11-22` (interface), `:26-44` (provider props), `:50-61` (value object)

This is a pure type-threading change; the gate is the type-checker (`npm run build`). Mirror the three `treatMegasAsSeparate` / `megaPlacement` sites exactly.

- [ ] **Step 1: Add the `VariantPlacement` import** alongside the existing `MegaPlacement` import.

Before (`app/(dashboard)/_lib/UserContext.tsx:9`):
```ts
import type { MegaPlacement } from "./mega-prefs";
```
After:
```ts
import type { MegaPlacement } from "./mega-prefs";
import type { VariantPlacement } from "./variant-prefs";
```

- [ ] **Step 2: Add the two fields to the `UserCtx` interface.**

Before (`app/(dashboard)/_lib/UserContext.tsx:11-22`):
```ts
interface UserCtx {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  // Memoized bundle for passing into formatPrice/formatPriceCompact.
  display: DisplayConversion;
  isGuest: boolean;
}
```
After:
```ts
interface UserCtx {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  treatVariantsAsSeparate: boolean;
  variantPlacement: VariantPlacement;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  // Memoized bundle for passing into formatPrice/formatPriceCompact.
  display: DisplayConversion;
  isGuest: boolean;
}
```

- [ ] **Step 3: Add the two fields to the provider's destructured params and prop types.**

Before (`app/(dashboard)/_lib/UserContext.tsx:26-44`):
```ts
export function UserProvider({
  userId,
  email,
  priceSource,
  treatMegasAsSeparate,
  megaPlacement,
  displayCurrency,
  latestRatesFromEur,
  children,
}: {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  children: React.ReactNode;
}) {
```
After:
```ts
export function UserProvider({
  userId,
  email,
  priceSource,
  treatMegasAsSeparate,
  megaPlacement,
  treatVariantsAsSeparate,
  variantPlacement,
  displayCurrency,
  latestRatesFromEur,
  children,
}: {
  userId: string;
  email: string;
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  treatVariantsAsSeparate: boolean;
  variantPlacement: VariantPlacement;
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
  children: React.ReactNode;
}) {
```

- [ ] **Step 4: Add the two fields to the provided value object.**

Before (`app/(dashboard)/_lib/UserContext.tsx:50-61`):
```ts
      value={{
        userId,
        email,
        priceSource,
        treatMegasAsSeparate,
        megaPlacement,
        displayCurrency,
        latestRatesFromEur,
        display,
        isGuest: !userId,
      }}
```
After:
```ts
      value={{
        userId,
        email,
        priceSource,
        treatMegasAsSeparate,
        megaPlacement,
        treatVariantsAsSeparate,
        variantPlacement,
        displayCurrency,
        latestRatesFromEur,
        display,
        isGuest: !userId,
      }}
```

- [ ] **Step 5: Type-check** — Run: `npm run build` — Expected: compiles (will surface the now-required props at `Shell.tsx` / `layout.tsx` call sites until those tasks land; that is the expected ordering — see Notes).
- [ ] **Step 6: Commit** — `git add "app/(dashboard)/_lib/UserContext.tsx" && git commit -m "feat(variants): thread variant prefs through UserContext"`

> Depends on `app/(dashboard)/_lib/variant-prefs.ts` existing (prefs cluster). If it is not yet present, replace the import in Step 1 with an inline `import type { VariantPlacement } from "./mega-prefs"`-shaped local until that file lands — but prefer to sequence this task after the prefs file is created.

---

### Task 10: OwnedCardsContext — variant ownership derivation (TDD core)

**Files:**
- Test: `tests/unit/derive-species.test.ts` (new)
- Modify: `app/(dashboard)/_lib/OwnedCardsContext.tsx:13` (import), `:27-54` (ctx interface), `:74-100` (inversion maps + derivers), `:132` (useUser destructure), `:210-245` (memos/callbacks), `:321-338` (value object)

The contract requires `deriveSpecies(owned, treatMegasAsSeparate, treatVariantsAsSeparate)` to be unit-tested, but it is currently module-private and the variant map is sourced from committed JSON that the ingest cluster has not produced yet. To make a deterministic, data-independent, ordering-independent test, extract the branching logic into an **exported pure helper** `computeSpecies(owned, opts)` that takes the inversion maps as injected fields; the exported `deriveSpecies` delegates to it with the module-level maps. The test exercises `computeSpecies` with hand-built fixtures (no real JSON, no network).

- [ ] **Step 1: Write the failing test.**
```ts
// tests/unit/derive-species.test.ts
import { describe, it, expect } from "vitest";
import { computeSpecies } from "@/app/(dashboard)/_lib/OwnedCardsContext";

// Fixture maps mirror the real module shape:
//   cardToDex:     card-id -> dex[]
//   cardToMega:    card-id -> mega formKey (only mega cards present)
//   cardToVariant: card-id -> variant variantKey (only variant cards present)
const cardToDex: Record<string, number[]> = {
  "plain-25": [25], // Pikachu, ordinary
  "mega-65": [65], // Alakazam, a Mega card
  "var-37": [37], // Alolan Vulpix card -> Vulpix #37
  "megavar-80": [80], // hypothetical card that is BOTH (defensive; never happens in data)
};
const cardToMega: Record<string, string> = {
  "mega-65": "mega-alakazam",
  "megavar-80": "mega-slowbro",
};
const cardToVariant: Record<string, string> = {
  "var-37": "alola-vulpix",
  "megavar-80": "galar-slowbro",
};

function opts(treatMegasAsSeparate: boolean, treatVariantsAsSeparate: boolean) {
  return { cardToDex, cardToMega, cardToVariant, treatMegasAsSeparate, treatVariantsAsSeparate };
}

function owned(...ids: string[]): Map<string, number> {
  return new Map(ids.map((id) => [id, 1]));
}

describe("computeSpecies", () => {
  it("both toggles off: every owned card credits its base dex", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(false, false));
    expect(s).toEqual(new Set([25, 65, 37]));
  });

  it("mega toggle on, variant toggle off: only mega card is skipped", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(true, false));
    expect(s).toEqual(new Set([25, 37])); // 65 dropped, 37 (variant) still credits base
  });

  it("variant toggle on, mega toggle off: only variant card is skipped", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(false, true));
    expect(s).toEqual(new Set([25, 65])); // 37 dropped, 65 (mega) still credits base
  });

  it("both toggles on: mega and variant skips compose", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(true, true));
    expect(s).toEqual(new Set([25])); // both 65 and 37 dropped
  });

  it("a card that is both mega and variant is skipped if either applicable toggle is on", () => {
    expect(computeSpecies(owned("megavar-80"), opts(true, false))).toEqual(new Set());
    expect(computeSpecies(owned("megavar-80"), opts(false, true))).toEqual(new Set());
    expect(computeSpecies(owned("megavar-80"), opts(false, false))).toEqual(new Set([80]));
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `npx vitest run tests/unit/derive-species.test.ts` — Expected: FAIL (`computeSpecies` is not exported / does not exist).

- [ ] **Step 3: Implement.**

3a. Import `CARD_INDEX_BY_VARIANT` (`app/(dashboard)/_lib/OwnedCardsContext.tsx:13`).

Before:
```ts
import { CARD_INDEX, CARD_INDEX_BY_MEGA } from "@/lib/data";
```
After:
```ts
import { CARD_INDEX, CARD_INDEX_BY_MEGA, CARD_INDEX_BY_VARIANT } from "@/lib/data";
```

3b. Extend the `OwnedCardsCtx` interface with the three variant members (`app/(dashboard)/_lib/OwnedCardsContext.tsx:27-54`). Add `ownedVariantForms` next to `ownedMegaForms`, `isVariantFormOwned` next to `isMegaFormOwned`, and `ownedCountForVariantForm` next to `ownedCountForMegaForm`.

Before:
```ts
  /** Distinct Mega form keys the user owns at least one card for. Always
   * derived, regardless of the toggle, so consumers can query it. */
  ownedMegaForms: Set<string>;
  isOwned: (cardId: string) => boolean;
  isSpeciesOwned: (dex: number) => boolean;
  isMegaFormOwned: (formKey: string) => boolean;
  /** Distinct cards of this species the user owns (variants covered). */
  ownedCountForSpecies: (dex: number) => number;
  ownedCountForMegaForm: (formKey: string) => number;
```
After:
```ts
  /** Distinct Mega form keys the user owns at least one card for. Always
   * derived, regardless of the toggle, so consumers can query it. */
  ownedMegaForms: Set<string>;
  /** Distinct regional-variant keys the user owns at least one card for.
   * Always derived, regardless of the toggle, so consumers can query it. */
  ownedVariantForms: Set<string>;
  isOwned: (cardId: string) => boolean;
  isSpeciesOwned: (dex: number) => boolean;
  isMegaFormOwned: (formKey: string) => boolean;
  isVariantFormOwned: (variantKey: string) => boolean;
  /** Distinct cards of this species the user owns (variants covered). */
  ownedCountForSpecies: (dex: number) => number;
  ownedCountForMegaForm: (formKey: string) => number;
  ownedCountForVariantForm: (variantKey: string) => number;
```

3c. Add the `CARD_TO_VARIANT` inversion map + the extracted pure `computeSpecies` + rewrite `deriveSpecies` to delegate, and add `deriveVariantForms` (`app/(dashboard)/_lib/OwnedCardsContext.tsx:74-100`).

Before:
```ts
const CARD_TO_MEGA: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [formKey, cardIds] of Object.entries(CARD_INDEX_BY_MEGA)) {
    for (const id of cardIds) m[id] = formKey;
  }
  return m;
})();

function deriveSpecies(owned: Map<string, number>, treatMegasAsSeparate: boolean): Set<number> {
  const species = new Set<number>();
  for (const id of owned.keys()) {
    if (treatMegasAsSeparate && CARD_TO_MEGA[id]) continue;
    const dexes = CARD_TO_DEX[id];
    if (!dexes) continue;
    for (const d of dexes) species.add(d);
  }
  return species;
}

function deriveMegaForms(owned: Map<string, number>): Set<string> {
  const forms = new Set<string>();
  for (const id of owned.keys()) {
    const key = CARD_TO_MEGA[id];
    if (key) forms.add(key);
  }
  return forms;
}
```
After:
```ts
const CARD_TO_MEGA: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [formKey, cardIds] of Object.entries(CARD_INDEX_BY_MEGA)) {
    for (const id of cardIds) m[id] = formKey;
  }
  return m;
})();

// card-id → variant variantKey, populated only for cards that resolved to a
// true regional variant (region-exclusive region-prefixed cards are absent and
// keep contributing to dex# regardless of the toggle).
const CARD_TO_VARIANT: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [variantKey, cardIds] of Object.entries(CARD_INDEX_BY_VARIANT)) {
    for (const id of cardIds) m[id] = variantKey;
  }
  return m;
})();

/** Pure species derivation with injectable maps so it is unit-testable
 * without the committed indexes. `deriveSpecies` delegates to it. */
export function computeSpecies(
  owned: Map<string, number>,
  opts: {
    cardToDex: Record<string, number[]>;
    cardToMega: Record<string, string>;
    cardToVariant: Record<string, string>;
    treatMegasAsSeparate: boolean;
    treatVariantsAsSeparate: boolean;
  },
): Set<number> {
  const species = new Set<number>();
  for (const id of owned.keys()) {
    if (opts.treatMegasAsSeparate && opts.cardToMega[id]) continue;
    if (opts.treatVariantsAsSeparate && opts.cardToVariant[id]) continue;
    const dexes = opts.cardToDex[id];
    if (!dexes) continue;
    for (const d of dexes) species.add(d);
  }
  return species;
}

function deriveSpecies(
  owned: Map<string, number>,
  treatMegasAsSeparate: boolean,
  treatVariantsAsSeparate: boolean,
): Set<number> {
  return computeSpecies(owned, {
    cardToDex: CARD_TO_DEX,
    cardToMega: CARD_TO_MEGA,
    cardToVariant: CARD_TO_VARIANT,
    treatMegasAsSeparate,
    treatVariantsAsSeparate,
  });
}

function deriveMegaForms(owned: Map<string, number>): Set<string> {
  const forms = new Set<string>();
  for (const id of owned.keys()) {
    const key = CARD_TO_MEGA[id];
    if (key) forms.add(key);
  }
  return forms;
}

function deriveVariantForms(owned: Map<string, number>): Set<string> {
  const forms = new Set<string>();
  for (const id of owned.keys()) {
    const key = CARD_TO_VARIANT[id];
    if (key) forms.add(key);
  }
  return forms;
}
```

3d. Destructure `treatVariantsAsSeparate` from `useUser()` (`app/(dashboard)/_lib/OwnedCardsContext.tsx:132`).

Before:
```ts
  const { treatMegasAsSeparate } = useUser();
```
After:
```ts
  const { treatMegasAsSeparate, treatVariantsAsSeparate } = useUser();
```

3e. Update the `ownedSpecies` memo call + deps and add the `ownedVariantForms` memo (`app/(dashboard)/_lib/OwnedCardsContext.tsx:210-215`).

Before:
```ts
  const ownedSet = useMemo(() => new Set(optimistic.keys()), [optimistic]);
  const ownedSpecies = useMemo(
    () => deriveSpecies(optimistic, treatMegasAsSeparate),
    [optimistic, treatMegasAsSeparate],
  );
  const ownedMegaForms = useMemo(() => deriveMegaForms(optimistic), [optimistic]);
```
After:
```ts
  const ownedSet = useMemo(() => new Set(optimistic.keys()), [optimistic]);
  const ownedSpecies = useMemo(
    () => deriveSpecies(optimistic, treatMegasAsSeparate, treatVariantsAsSeparate),
    [optimistic, treatMegasAsSeparate, treatVariantsAsSeparate],
  );
  const ownedMegaForms = useMemo(() => deriveMegaForms(optimistic), [optimistic]);
  const ownedVariantForms = useMemo(() => deriveVariantForms(optimistic), [optimistic]);
```

3f. Update the `ownedCountForSpecies` skip + deps to compose the variant skip, and add `ownedCountForVariantForm` next to `ownedCountForMegaForm` (`app/(dashboard)/_lib/OwnedCardsContext.tsx:222-246`).

Before:
```ts
  const ownedCountForSpecies = useCallback(
    (dex: number) => {
      const ids = CARD_INDEX[dex];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) {
        if (!optimistic.has(id)) continue;
        if (treatMegasAsSeparate && CARD_TO_MEGA[id]) continue;
        n++;
      }
      return n;
    },
    [optimistic, treatMegasAsSeparate],
  );

  const ownedCountForMegaForm = useCallback(
    (formKey: string) => {
      const ids = CARD_INDEX_BY_MEGA[formKey];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) if (optimistic.has(id)) n++;
      return n;
    },
    [optimistic],
  );
```
After:
```ts
  const ownedCountForSpecies = useCallback(
    (dex: number) => {
      const ids = CARD_INDEX[dex];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) {
        if (!optimistic.has(id)) continue;
        if (treatMegasAsSeparate && CARD_TO_MEGA[id]) continue;
        if (treatVariantsAsSeparate && CARD_TO_VARIANT[id]) continue;
        n++;
      }
      return n;
    },
    [optimistic, treatMegasAsSeparate, treatVariantsAsSeparate],
  );

  const ownedCountForMegaForm = useCallback(
    (formKey: string) => {
      const ids = CARD_INDEX_BY_MEGA[formKey];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) if (optimistic.has(id)) n++;
      return n;
    },
    [optimistic],
  );

  const ownedCountForVariantForm = useCallback(
    (variantKey: string) => {
      const ids = CARD_INDEX_BY_VARIANT[variantKey];
      if (!ids) return 0;
      let n = 0;
      for (const id of ids) if (optimistic.has(id)) n++;
      return n;
    },
    [optimistic],
  );
```

3g. Expose the new fields on the provided value object (`app/(dashboard)/_lib/OwnedCardsContext.tsx:321-338`).

Before:
```ts
      value={{
        ownedCards: ownedSet,
        ownedSpecies,
        ownedMegaForms,
        isOwned: (id) => optimistic.has(id),
        isSpeciesOwned: (dex) => ownedSpecies.has(dex),
        isMegaFormOwned: (formKey) => ownedMegaForms.has(formKey),
        ownedCountForSpecies,
        ownedCountForMegaForm,
        quantityOf: (id) => optimistic.get(id) ?? 0,
        totalCopies,
        toggle,
        adjust,
        setQuantity,
        isPending,
      }}
```
After:
```ts
      value={{
        ownedCards: ownedSet,
        ownedSpecies,
        ownedMegaForms,
        ownedVariantForms,
        isOwned: (id) => optimistic.has(id),
        isSpeciesOwned: (dex) => ownedSpecies.has(dex),
        isMegaFormOwned: (formKey) => ownedMegaForms.has(formKey),
        isVariantFormOwned: (variantKey) => ownedVariantForms.has(variantKey),
        ownedCountForSpecies,
        ownedCountForMegaForm,
        ownedCountForVariantForm,
        quantityOf: (id) => optimistic.get(id) ?? 0,
        totalCopies,
        toggle,
        adjust,
        setQuantity,
        isPending,
      }}
```

- [ ] **Step 4: Run it, expect PASS** — Run: `npx vitest run tests/unit/derive-species.test.ts` — Expected: PASS.
- [ ] **Step 5: Type-check** — Run: `npm run build` — Expected: compiles (requires `CARD_INDEX_BY_VARIANT` exported from `@/lib/data` and `variant-prefs.ts`/UserContext variant field — see Notes for ordering).
- [ ] **Step 6: Commit** — `git add tests/unit/derive-species.test.ts "app/(dashboard)/_lib/OwnedCardsContext.tsx" && git commit -m "feat(variants): variant ownership derivation in OwnedCardsContext"`

> Note: `import { computeSpecies } from "@/app/(dashboard)/_lib/OwnedCardsContext"` pulls in `"use client"` + React, which Vitest handles fine for the other context-free pure exports already in this repo's test suite. `computeSpecies` itself touches no React/browser API. If the test runner objects to the route-group parens in the alias path, fall back to a relative import: `import { computeSpecies } from "../../app/(dashboard)/_lib/OwnedCardsContext";` from `tests/unit/`.

---

### Task 11: layout.tsx — pass variant prefs into Shell/UserProvider

**Files:**
- Modify: `app/(dashboard)/layout.tsx:13-25` (guest branch), `:60-73` (authed branch)

Type-threading only; gate is `npm run build`. Mirror the `treatMegasAsSeparate` / `megaPlacement` props in both Shell invocations.

- [ ] **Step 1: Guest branch — default the variant props.**

Before (`app/(dashboard)/layout.tsx:13-25`):
```tsx
      <Shell
        userId=""
        email=""
        priceSource="tcgplayer"
        treatMegasAsSeparate={false}
        megaPlacement="appended"
        displayCurrency="USD"
        latestRatesFromEur={latestRatesFromEur}
        initialOwned={[]}
        initialWishlist={[]}
        initialFavorites={[]}
        initialAvailability={[]}
      >
```
After:
```tsx
      <Shell
        userId=""
        email=""
        priceSource="tcgplayer"
        treatMegasAsSeparate={false}
        megaPlacement="appended"
        treatVariantsAsSeparate={false}
        variantPlacement="appended"
        displayCurrency="USD"
        latestRatesFromEur={latestRatesFromEur}
        initialOwned={[]}
        initialWishlist={[]}
        initialFavorites={[]}
        initialAvailability={[]}
      >
```

- [ ] **Step 2: Authed branch — thread from `prefs`.**

Before (`app/(dashboard)/layout.tsx:60-73`):
```tsx
    <Shell
      userId={user.id}
      email={user.email ?? ""}
      priceSource={prefs.priceSource}
      treatMegasAsSeparate={prefs.treatMegasAsSeparate}
      megaPlacement={prefs.megaPlacement}
      displayCurrency={prefs.displayCurrency}
      latestRatesFromEur={latestRatesFromEur}
      initialOwned={initialOwned}
      initialWishlist={initialWishlist}
      initialFavorites={initialFavorites}
      initialAvailability={initialAvailability}
    >
```
After:
```tsx
    <Shell
      userId={user.id}
      email={user.email ?? ""}
      priceSource={prefs.priceSource}
      treatMegasAsSeparate={prefs.treatMegasAsSeparate}
      megaPlacement={prefs.megaPlacement}
      treatVariantsAsSeparate={prefs.treatVariantsAsSeparate}
      variantPlacement={prefs.variantPlacement}
      displayCurrency={prefs.displayCurrency}
      latestRatesFromEur={latestRatesFromEur}
      initialOwned={initialOwned}
      initialWishlist={initialWishlist}
      initialFavorites={initialFavorites}
      initialAvailability={initialAvailability}
    >
```

- [ ] **Step 3: Type-check** — Run: `npm run build` — Expected: compiles (requires `UserPreferences` to carry `treatVariantsAsSeparate` / `variantPlacement` from the prefs cluster, and the Shell task below to accept the new props).
- [ ] **Step 4: Commit** — `git add "app/(dashboard)/layout.tsx" && git commit -m "feat(variants): pass variant prefs from layout into Shell"`

---

### Task 12: Shell.tsx — accept variant props + gated /variants nav link

**Files:**
- Modify: `app/(dashboard)/_components/Shell.tsx:49` (import), `:51-64` (ShellProps), `:66-89` (Shell signature + UserProvider), `:110-118` (ShellInner gate/memo), `:187-209` (buildNavGroups)

Type-threading + nav wiring; gate is `npm run build`. Mirror the `treatMegasAsSeparate`/`megaPlacement` prop plumbing and the `/megas` `showMegasNav` gate exactly. Use the `Sparkles` icon that is already imported (Megas use it too) for the variants link.

- [ ] **Step 1: Import `VariantPlacement`.**

Before (`app/(dashboard)/_components/Shell.tsx:49`):
```ts
import type { MegaPlacement } from "../_lib/mega-prefs";
```
After:
```ts
import type { MegaPlacement } from "../_lib/mega-prefs";
import type { VariantPlacement } from "../_lib/variant-prefs";
```

- [ ] **Step 2: Add the props to `ShellProps`.**

Before (`app/(dashboard)/_components/Shell.tsx:54-58`):
```ts
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  displayCurrency: Currency;
```
After:
```ts
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  treatVariantsAsSeparate: boolean;
  variantPlacement: VariantPlacement;
  displayCurrency: Currency;
```

- [ ] **Step 3: Destructure the props in `Shell` and forward them to `UserProvider`.**

Before (`app/(dashboard)/_components/Shell.tsx:66-89`):
```tsx
export function Shell({
  userId,
  email,
  priceSource,
  treatMegasAsSeparate,
  megaPlacement,
  displayCurrency,
  latestRatesFromEur,
  initialOwned,
  initialWishlist,
  initialFavorites,
  initialAvailability,
  children,
}: ShellProps) {
  return (
    <UserProvider
      userId={userId}
      email={email}
      priceSource={priceSource}
      treatMegasAsSeparate={treatMegasAsSeparate}
      megaPlacement={megaPlacement}
      displayCurrency={displayCurrency}
      latestRatesFromEur={latestRatesFromEur}
    >
```
After:
```tsx
export function Shell({
  userId,
  email,
  priceSource,
  treatMegasAsSeparate,
  megaPlacement,
  treatVariantsAsSeparate,
  variantPlacement,
  displayCurrency,
  latestRatesFromEur,
  initialOwned,
  initialWishlist,
  initialFavorites,
  initialAvailability,
  children,
}: ShellProps) {
  return (
    <UserProvider
      userId={userId}
      email={email}
      priceSource={priceSource}
      treatMegasAsSeparate={treatMegasAsSeparate}
      megaPlacement={megaPlacement}
      treatVariantsAsSeparate={treatVariantsAsSeparate}
      variantPlacement={variantPlacement}
      displayCurrency={displayCurrency}
      latestRatesFromEur={latestRatesFromEur}
    >
```

- [ ] **Step 4: In `ShellInner`, derive `showVariantsNav` and feed it into `buildNavGroups`.**

Before (`app/(dashboard)/_components/Shell.tsx:110-118`):
```tsx
  const { isGuest, email, treatMegasAsSeparate, megaPlacement } = useUser();
  const pathname = usePathname();
  const breadcrumbItems = useBreadcrumbs(pathname);
  const showMegasNav = !isGuest && treatMegasAsSeparate && megaPlacement === "separate";

  const navGroups = useMemo<SidebarNavGroup[]>(
    () => buildNavGroups({ showMegasNav, isGuest }),
    [showMegasNav, isGuest],
  );
```
After:
```tsx
  const { isGuest, email, treatMegasAsSeparate, megaPlacement, treatVariantsAsSeparate, variantPlacement } =
    useUser();
  const pathname = usePathname();
  const breadcrumbItems = useBreadcrumbs(pathname);
  const showMegasNav = !isGuest && treatMegasAsSeparate && megaPlacement === "separate";
  const showVariantsNav =
    !isGuest && treatVariantsAsSeparate && variantPlacement === "separate";

  const navGroups = useMemo<SidebarNavGroup[]>(
    () => buildNavGroups({ showMegasNav, showVariantsNav, isGuest }),
    [showMegasNav, showVariantsNav, isGuest],
  );
```

- [ ] **Step 5: Add `showVariantsNav` to `buildNavGroups` and push the gated spec after the Mega spec.**

Before (`app/(dashboard)/_components/Shell.tsx:187-209`):
```tsx
function buildNavGroups({
  showMegasNav,
  isGuest,
}: {
  showMegasNav: boolean;
  isGuest: boolean;
}): SidebarNavGroup[] {
  const specs: FlatNavSpec[] = [
    { name: "Pokédex", url: "/pokedex", icon: PokeballIcon, group: "Browse" },
    ...(showMegasNav
      ? ([
          {
            name: "Mega Evolutions",
            url: "/megas",
            icon: Sparkles,
            group: "Browse" as const,
          },
        ] satisfies FlatNavSpec[])
      : []),
    { name: "Sets", url: "/sets", icon: Layers, group: "Browse" },
    { name: "Cards", url: "/cards", icon: CreditCard, group: "Browse" },
    { name: "Other cards", url: "/other", icon: MoreHorizontal, group: "Browse" },
  ];
```
After:
```tsx
function buildNavGroups({
  showMegasNav,
  showVariantsNav,
  isGuest,
}: {
  showMegasNav: boolean;
  showVariantsNav: boolean;
  isGuest: boolean;
}): SidebarNavGroup[] {
  const specs: FlatNavSpec[] = [
    { name: "Pokédex", url: "/pokedex", icon: PokeballIcon, group: "Browse" },
    ...(showMegasNav
      ? ([
          {
            name: "Mega Evolutions",
            url: "/megas",
            icon: Sparkles,
            group: "Browse" as const,
          },
        ] satisfies FlatNavSpec[])
      : []),
    ...(showVariantsNav
      ? ([
          {
            name: "Regional Variants",
            url: "/variants",
            icon: Sparkles,
            group: "Browse" as const,
          },
        ] satisfies FlatNavSpec[])
      : []),
    { name: "Sets", url: "/sets", icon: Layers, group: "Browse" },
    { name: "Cards", url: "/cards", icon: CreditCard, group: "Browse" },
    { name: "Other cards", url: "/other", icon: MoreHorizontal, group: "Browse" },
  ];
```

- [ ] **Step 6: Type-check** — Run: `npm run build` — Expected: compiles.
- [ ] **Step 7: Commit** — `git add "app/(dashboard)/_components/Shell.tsx" && git commit -m "feat(variants): gated /variants nav link + variant prop plumbing in Shell"`

> The spec suggests a distinct accent vs. Megas for the variant *cell* badge, but the nav icon for Megas is `Sparkles` and there is no separate variant icon imported. Reusing `Sparkles` matches the existing `/megas` link 1:1; if the orchestrator wants a distinct nav icon, add an import (e.g. `Globe`) in Step 1 and swap it in Step 5.

## D. Settings UI, cells, grid & /variants page
### Task 13: Variant accent design token

Adds a distinct teal accent for regional-variant cells/sections so they read as a different family from the slate-violet Megas (`--color-mega`, hue 290) and the emerald `covered` (hue 165). Exposes Tailwind utilities `bg-variant`, `text-variant`, `border-variant`, `ring-variant` and a glow rgb for the cell `--type-glow`.

**Files:**
- Modify: `app/globals.css:96-108` (light `:root` pokédex tokens), `app/globals.css:110-122` (`.dark`), `app/globals.css:198-200` (Tailwind `@theme inline` surface)

- [ ] **Step 1: Implement — add the light-mode token.** In `app/globals.css`, the `:root` pokédex block currently ends:
```css
  --pokedex-mega:            oklch(0.555 0.180 290);   /* violet */
  --pokedex-me-tint:         oklch(0.555 0.180 290);
  --pokedex-sv-tint:         oklch(0.555 0.155 234);   /* SV blue */
}
```
Change to (insert the two `--pokedex-variant*` lines after `--pokedex-mega`):
```css
  --pokedex-mega:            oklch(0.555 0.180 290);   /* violet */
  --pokedex-variant:         oklch(0.560 0.110 195);   /* teal — regional variants */
  --pokedex-variant-dark:    oklch(0.430 0.100 195);
  --pokedex-me-tint:         oklch(0.555 0.180 290);
  --pokedex-sv-tint:         oklch(0.555 0.155 234);   /* SV blue */
}
```
- [ ] **Step 2: Implement — add the dark-mode token.** The `.dark` pokédex block currently ends:
```css
  --pokedex-mega:            oklch(0.715 0.170 290);   /* ≈ #a78bff */
  --pokedex-me-tint:         oklch(0.715 0.170 290);
  --pokedex-sv-tint:         oklch(0.745 0.135 234);   /* ≈ #5db8ff */
}
```
Change to:
```css
  --pokedex-mega:            oklch(0.715 0.170 290);   /* ≈ #a78bff */
  --pokedex-variant:         oklch(0.770 0.110 192);   /* ≈ #2dd4bf teal */
  --pokedex-variant-dark:    oklch(0.560 0.110 188);
  --pokedex-me-tint:         oklch(0.715 0.170 290);
  --pokedex-sv-tint:         oklch(0.745 0.135 234);   /* ≈ #5db8ff */
}
```
- [ ] **Step 3: Implement — expose the Tailwind utilities.** The `@theme inline` block currently has:
```css
  --color-mega:                         var(--pokedex-mega);
  --color-me-tint:                      var(--pokedex-me-tint);
  --color-sv-tint:                      var(--pokedex-sv-tint);
```
Change to:
```css
  --color-mega:                         var(--pokedex-mega);
  --color-variant:                      var(--pokedex-variant);
  --color-variant-dark:                 var(--pokedex-variant-dark);
  --color-me-tint:                      var(--pokedex-me-tint);
  --color-sv-tint:                      var(--pokedex-sv-tint);
```
- [ ] **Step 4: Type-check gate** — Run: `npm run build` — Expected: compiles (CSS-only change; utilities `bg-variant`/`text-variant`/`border-variant`/`ring-variant` become available to later tasks).
- [ ] **Step 5: Commit** — `git add app/globals.css && git commit -m "feat(variants): add teal variant accent token"`

---

### Task 14: VariantCell component

Copy of `MegaCell.tsx` for regional variants. Renders owned card art when supplied, else `officialArtworkUrl(form.artworkId ?? form.baseDex)` (the distinct PokéAPI form artwork). Ownership comes from `useOwnedCards().isVariantFormOwned` / `ownedCountForVariantForm` keyed on `form.variantKey`; the partial count uses `CARD_INDEX_BY_VARIANT`. Uses the teal `variant` accent and the teal `--type-glow`, and a region-initial badge (A/G/H/P). Note: unlike `MegaCell`, this does NOT call `usePokemonHover` — `HoverTarget` (in `PokemonHoverContext.tsx`) only knows `"dex"` and `"mega"` kinds, and extending it is outside this cluster; omitting the hover preview keeps `npm run build` green. The cell is still fully interactive (click + focus ring).

**Files:**
- Create: `app/(dashboard)/_components/VariantCell.tsx`

- [ ] **Step 1: Implement** — full new file:
```tsx
"use client";

import Image from "next/image";
import { memo, useRef } from "react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { CARD_INDEX_BY_VARIANT } from "@/lib/data";
import type { CardEntry, RegionalVariant } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { OwnedBadge } from "./OwnedBadge";

interface Props {
  form: RegionalVariant;
  onClick?: (form: RegionalVariant) => void;
  /** When set, the cell shows this card's art (letterboxed) instead of the
   * silhouette fallback. */
  displayCard?: CardEntry | null;
}

const REGION_BADGE: Record<RegionalVariant["region"], string> = {
  alola: "A",
  galar: "G",
  hisui: "H",
  paldea: "P",
};

function CellBase({ form, onClick, displayCard }: Props) {
  const { isVariantFormOwned, ownedCountForVariantForm } = useOwnedCards();
  const owned = isVariantFormOwned(form.variantKey);
  const ref = useRef<HTMLButtonElement>(null);
  const totalVariants = CARD_INDEX_BY_VARIANT[form.variantKey]?.length ?? 0;
  const ownedVariants = ownedCountForVariantForm(form.variantKey);
  const partial = owned && ownedVariants < totalVariants;
  const showCardArt = Boolean(displayCard);

  // Variant slots are always "covered" by construction (the form only exists
  // because at least one card prints it). So just two states: owned vs not.
  const stateClass = owned
    ? showCardArt
      ? "border-variant/45 bg-bg"
      : "border-variant/60 bg-panel-2"
    : "border-variant/25 bg-panel/60 hover:border-variant/45";

  return (
    <button
      ref={ref}
      type="button"
      data-variant-form={form.variantKey}
      onClick={onClick ? () => onClick(form) : undefined}
      className={[
        "pokemon-cell group/cell relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-md border select-none",
        onClick ? "cursor-pointer" : "cursor-default",
        "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out hover:z-10 hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-variant",
        stateClass,
      ].join(" ")}
      style={{ "--type-glow": "rgb(45 212 191 / 0.55)" } as React.CSSProperties}
      aria-label={`${form.displayName}${owned ? " owned" : ""}`}
    >
      {showCardArt && displayCard ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={displayCard.imageSmall}
          alt={displayCard.name}
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain p-[3%]"
          style={{ filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.45))" }}
        />
      ) : (
        <Image
          src={officialArtworkUrl(form.artworkId ?? form.baseDex)}
          alt=""
          width={112}
          height={112}
          unoptimized
          loading="lazy"
          className="pointer-events-none absolute inset-[6%] h-[88%] w-[88%] object-contain opacity-100 transition-[filter] duration-150"
          style={{
            filter: owned
              ? "drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))"
              : "drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))",
          }}
        />
      )}

      {/* Region badge — teal, top-left (A/G/H/P) */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 left-1 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-sm bg-variant/85 px-[3px] text-[9px] font-bold leading-none text-bg shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
      >
        {REGION_BADGE[form.region]}
      </span>

      {/* Owned badge — top-right, matches PokemonCell. */}
      {owned && <OwnedBadge size="sm" className="absolute top-1 right-1" />}

      {/* Partial-variant chip */}
      {partial && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1 bottom-1 rounded-sm bg-bg/75 px-1 text-[9px] font-semibold leading-[1.3] text-owned/95 nums tabular-nums backdrop-blur-sm"
          title={`${ownedVariants} / ${totalVariants} variants owned`}
        >
          {ownedVariants}/{totalVariants}
        </span>
      )}
    </button>
  );
}

export const VariantCell = memo(CellBase);
```
- [ ] **Step 2: Type-check gate** — Run: `npm run build` — Expected: compiles. (Depends on: `RegionalVariant` + `CardEntry.variantFormKey` in `lib/data/types.ts`, `VARIANTS`/`CARD_INDEX_BY_VARIANT` in `lib/data/index.ts`, and `isVariantFormOwned`/`ownedCountForVariantForm` on `useOwnedCards()` — all from the types/data/context clusters. If those are not yet merged, this build fails on missing symbols; sequence after them.)
- [ ] **Step 3: Commit** — `git add "app/(dashboard)/_components/VariantCell.tsx" && git commit -m "feat(variants): VariantCell with teal accent + distinct artwork"`

---

### Task 15: VariantSeparationSetting component

Copy of `MegaSeparationSetting.tsx` with regional-variant wording, using `VARIANT_PLACEMENTS`/`VariantPlacement` and the `updateVariantSettings` server action.

**Files:**
- Create: `app/(dashboard)/settings/_components/VariantSeparationSetting.tsx`

- [ ] **Step 1: Implement** — full new file:
```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VARIANT_PLACEMENTS, type VariantPlacement } from "../../_lib/variant-prefs";
import { updateVariantSettings } from "../../_lib/preferences-actions";
import { Toggle } from "@/lib/components/ui/Toggle";

interface Props {
  initialEnabled: boolean;
  initialPlacement: VariantPlacement;
}

const PLACEMENT_COPY: Record<VariantPlacement, { label: string; hint: string }> = {
  appended: {
    label: "Appended after #1025",
    hint: "Regional variants render as a section at the end of the Pokédex grid.",
  },
  inline: {
    label: "Inline next to base form",
    hint: "Each variant slot sits right after the Pokémon it's a regional form of.",
  },
  separate: {
    label: "Dedicated page",
    hint: "Variants live on their own page; the Pokédex stays exactly 1025 slots.",
  },
};

export function VariantSeparationSetting({ initialEnabled, initialPlacement }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [placement, setPlacement] = useState<VariantPlacement>(initialPlacement);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(nextEnabled: boolean, nextPlacement: VariantPlacement) {
    const prevEnabled = enabled;
    const prevPlacement = placement;
    setEnabled(nextEnabled);
    setPlacement(nextPlacement);
    setError(null);
    start(async () => {
      try {
        await updateVariantSettings(nextEnabled, nextPlacement);
        router.refresh();
      } catch (err) {
        setEnabled(prevEnabled);
        setPlacement(prevPlacement);
        setError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div id="variant-separation-label" className="text-sm font-semibold tracking-tight">
            Treat regional variants as separate Pokémon
          </div>
          <p id="variant-separation-desc" className="mt-1 text-xs text-muted">
            By default an Alolan Vulpix card counts toward Vulpix #37. Turn this on if you think of
            Alolan, Galarian, Hisuian and Paldean forms as their own Pokémon — each form gets its
            own slot and stops contributing to its base Pokédex number.
          </p>
        </div>
        <Toggle
          checked={enabled}
          onCheckedChange={(next) => commit(next, placement)}
          disabled={pending}
          aria-labelledby="variant-separation-label"
          aria-describedby="variant-separation-desc"
        />
      </div>

      {enabled && (
        <div className="mt-5 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">Where to show them</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {VARIANT_PLACEMENTS.map((p) => {
              const active = placement === p;
              const copy = PLACEMENT_COPY[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => commit(enabled, p)}
                  disabled={pending}
                  aria-pressed={active}
                  className={[
                    "rounded-md border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "border-accent bg-accent/10 text-text"
                      : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
                    pending ? "opacity-60" : "",
                  ].join(" ")}
                >
                  <div className="text-sm font-medium">{copy.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{copy.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-missing/40 bg-missing/10 p-2 text-xs text-missing">
          {error}
        </p>
      )}
    </div>
  );
}
```
- [ ] **Step 2: Type-check gate** — Run: `npm run build` — Expected: compiles. (Depends on: `app/(dashboard)/_lib/variant-prefs.ts` exporting `VARIANT_PLACEMENTS`/`VariantPlacement`, and `updateVariantSettings` in `preferences-actions.ts` — both from the prefs cluster. Sequence after them.)
- [ ] **Step 3: Commit** — `git add "app/(dashboard)/settings/_components/VariantSeparationSetting.tsx" && git commit -m "feat(variants): VariantSeparationSetting toggle + placement cards"`

---

### Task 16: Render VariantSeparationSetting on the Settings page

Render `<VariantSeparationSetting />` directly under `<MegaSeparationSetting />`, reading `prefs.treatVariantsAsSeparate` / `prefs.variantPlacement`.

**Files:**
- Modify: `app/(dashboard)/settings/page.tsx:7` (import) and `app/(dashboard)/settings/page.tsx:22-25` (render)

- [ ] **Step 1: Implement — add the import.** Current:
```tsx
import { MegaSeparationSetting } from "./_components/MegaSeparationSetting";
```
Change to:
```tsx
import { MegaSeparationSetting } from "./_components/MegaSeparationSetting";
import { VariantSeparationSetting } from "./_components/VariantSeparationSetting";
```
- [ ] **Step 2: Implement — render under the Mega setting.** Current:
```tsx
      <MegaSeparationSetting
        initialEnabled={prefs.treatMegasAsSeparate}
        initialPlacement={prefs.megaPlacement}
      />
    </div>
```
Change to:
```tsx
      <MegaSeparationSetting
        initialEnabled={prefs.treatMegasAsSeparate}
        initialPlacement={prefs.megaPlacement}
      />
      <VariantSeparationSetting
        initialEnabled={prefs.treatVariantsAsSeparate}
        initialPlacement={prefs.variantPlacement}
      />
    </div>
```
- [ ] **Step 3: Type-check gate** — Run: `npm run build` — Expected: compiles. (Depends on: `UserPreferences` gaining `treatVariantsAsSeparate`/`variantPlacement` in `user-preferences.ts` — prefs cluster. Sequence after it.)
- [ ] **Step 4: Commit** — `git add "app/(dashboard)/settings/page.tsx" && git commit -m "feat(variants): show VariantSeparationSetting on settings page"`

---

### Task 17: PokedexGrid — variant slots, inline/appended/separate

Mirror the Mega slot wiring throughout. Add a `{ kind: "variant"; form: RegionalVariant; gen }` member to `Slot`; destructure `treatVariantsAsSeparate`/`variantPlacement` from `useUser()` and `ownedVariantForms` from `useOwnedCards()`; build `variantSlots` from `VARIANTS`; add an `includeVariants` flag and a `mode === "variants"` branch; compose inline (`base → mega(s) → variant(s)` per baseDex); add an `appendedVariants` memo + a "Regional Variants" appended section rendered AFTER the Mega section; extend `filtered`/`gens`/`slotsByGen`/`totalOwnedInView`/per-gen owned+total memos; route `renderSlot` to `<VariantCell />`; treat the search placeholder for `"variants"` like `"megas"`. Each edit cites the read line anchors above.

**Files:**
- Modify: `app/(dashboard)/_components/PokedexGrid.tsx` — imports `5,12,17`; `Slot` union `19-21`; props doc + `mode` type `24-27`; hooks `90-91`; `MEGA_GROUP_LABEL` const `55`; `includeMegas` `136-142`; `allSlots` `144-195`; `filtered` `197-225`; `gens` `230-239`; `slotsByGen` `241-250`; `appendedMegas` `252-255`; `totalOwnedInView` `258-266`; `renderSlot` `270-283`; per-gen `ownedInGen`/`totalInGen` `374-394`; appended section `435-479`; search placeholder `325`

- [ ] **Step 1: Implement — imports.** Current `app/(dashboard)/_components/PokedexGrid.tsx:5`:
```tsx
import { MEGAS, POKEDEX } from "@/lib/data";
```
Change to:
```tsx
import { MEGAS, POKEDEX, VARIANTS } from "@/lib/data";
```
Current line 12 (the type import block close) + line 17:
```tsx
  type MegaForm,
} from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useUser } from "../_lib/UserContext";
import { FilterBar, type GridFilter } from "./FilterBar";
import { PokemonCell } from "./PokemonCell";
import { MegaCell } from "./MegaCell";
```
Change to:
```tsx
  type MegaForm,
  type RegionalVariant,
} from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useUser } from "../_lib/UserContext";
import { FilterBar, type GridFilter } from "./FilterBar";
import { PokemonCell } from "./PokemonCell";
import { MegaCell } from "./MegaCell";
import { VariantCell } from "./VariantCell";
```
- [ ] **Step 2: Implement — Slot union (19-21).** Current:
```tsx
type Slot =
  | { kind: "dex"; key: string; dex: number; name: string; gen: Generation }
  | { kind: "mega"; key: string; form: MegaForm; gen: Generation };
```
Change to:
```tsx
type Slot =
  | { kind: "dex"; key: string; dex: number; name: string; gen: Generation }
  | { kind: "mega"; key: string; form: MegaForm; gen: Generation }
  | { kind: "variant"; key: string; form: RegionalVariant; gen: Generation };
```
- [ ] **Step 3: Implement — `mode` type + doc (24-27) and `MEGA_GROUP_LABEL` (55).** Current 24-27:
```tsx
  /** Defaults to "pokedex" (renders the 1025 base species + optional Megas).
   * When "megas", the grid renders ONLY mega forms — used by the /megas
   * route when placement === "separate". */
  mode?: "pokedex" | "megas";
```
Change to:
```tsx
  /** Defaults to "pokedex" (renders the 1025 base species + optional Megas
   * and/or regional variants). When "megas", the grid renders ONLY mega
   * forms (the /megas route, placement === "separate"); when "variants", ONLY
   * regional-variant forms (the /variants route, placement === "separate"). */
  mode?: "pokedex" | "megas" | "variants";
```
Current line 55:
```tsx
const MEGA_GROUP_LABEL = "Mega Evolutions";
```
Change to:
```tsx
const MEGA_GROUP_LABEL = "Mega Evolutions";
const VARIANT_GROUP_LABEL = "Regional Variants";
```
- [ ] **Step 4: Implement — hooks (90-91).** Current:
```tsx
  const { ownedSpecies, ownedMegaForms } = useOwnedCards();
  const { isGuest, treatMegasAsSeparate, megaPlacement } = useUser();
```
Change to:
```tsx
  const { ownedSpecies, ownedMegaForms, ownedVariantForms } = useOwnedCards();
  const {
    isGuest,
    treatMegasAsSeparate,
    megaPlacement,
    treatVariantsAsSeparate,
    variantPlacement,
  } = useUser();
```
- [ ] **Step 5: Implement — `includeMegas` + new `includeVariants` (136-142).** Current:
```tsx
  const includeMegas =
    mode === "megas"
      ? true
      : !restrict &&
        !displayCardByDex &&
        treatMegasAsSeparate &&
        megaPlacement !== "separate";
```
Change to:
```tsx
  const includeMegas =
    mode === "megas"
      ? true
      : mode === "variants"
      ? false
      : !restrict &&
        !displayCardByDex &&
        treatMegasAsSeparate &&
        megaPlacement !== "separate";

  const includeVariants =
    mode === "variants"
      ? true
      : mode === "megas"
      ? false
      : !restrict &&
        !displayCardByDex &&
        treatVariantsAsSeparate &&
        variantPlacement !== "separate";
```
- [ ] **Step 6: Implement — `allSlots` (144-195).** Replace the whole memo. Current:
```tsx
  const allSlots: Slot[] = useMemo(() => {
    if (mode === "megas") {
      return MEGAS.map((form) => ({
        kind: "mega" as const,
        key: `mega:${form.formKey}`,
        form,
        gen: form.gen,
      }));
    }

    const baseDex: Slot[] = (restrict ? POKEDEX.filter((p) => restrict.has(p.dex)) : POKEDEX).map(
      (p) => ({
        kind: "dex" as const,
        key: `dex:${p.dex}`,
        dex: p.dex,
        name: p.name,
        gen: p.gen,
      }),
    );

    if (!includeMegas) return baseDex;

    const megaSlots: Slot[] = MEGAS.map((form) => ({
      kind: "mega" as const,
      key: `mega:${form.formKey}`,
      form,
      gen: form.gen,
    }));

    if (megaPlacement === "inline") {
      // Insert each Mega slot immediately after the last slot for its
      // baseDex (handles multiple Megas sharing a baseDex like X/Y).
      const byBaseDex = new Map<number, Slot[]>();
      for (const m of megaSlots) {
        const arr = byBaseDex.get(m.kind === "mega" ? m.form.baseDex : -1);
        if (arr) arr.push(m);
        else byBaseDex.set(m.kind === "mega" ? m.form.baseDex : -1, [m]);
      }
      const out: Slot[] = [];
      for (const slot of baseDex) {
        out.push(slot);
        if (slot.kind === "dex") {
          const megas = byBaseDex.get(slot.dex);
          if (megas) out.push(...megas);
        }
      }
      return out;
    }

    // Appended placement → Megas tacked on at the end.
    return [...baseDex, ...megaSlots];
  }, [mode, restrict, includeMegas, megaPlacement]);
```
Change to:
```tsx
  const allSlots: Slot[] = useMemo(() => {
    if (mode === "megas") {
      return MEGAS.map((form) => ({
        kind: "mega" as const,
        key: `mega:${form.formKey}`,
        form,
        gen: form.gen,
      }));
    }
    if (mode === "variants") {
      return VARIANTS.map((form) => ({
        kind: "variant" as const,
        key: `variant:${form.variantKey}`,
        form,
        gen: form.gen,
      }));
    }

    const baseDex: Slot[] = (restrict ? POKEDEX.filter((p) => restrict.has(p.dex)) : POKEDEX).map(
      (p) => ({
        kind: "dex" as const,
        key: `dex:${p.dex}`,
        dex: p.dex,
        name: p.name,
        gen: p.gen,
      }),
    );

    if (!includeMegas && !includeVariants) return baseDex;

    const megaSlots: Slot[] = includeMegas
      ? MEGAS.map((form) => ({
          kind: "mega" as const,
          key: `mega:${form.formKey}`,
          form,
          gen: form.gen,
        }))
      : [];

    const variantSlots: Slot[] = includeVariants
      ? VARIANTS.map((form) => ({
          kind: "variant" as const,
          key: `variant:${form.variantKey}`,
          form,
          gen: form.gen,
        }))
      : [];

    const megaInline = includeMegas && megaPlacement === "inline";
    const variantInline = includeVariants && variantPlacement === "inline";

    if (megaInline || variantInline) {
      // Insert each inline Mega/variant slot immediately after the slots for
      // its baseDex. Order per dex is base → mega(s) → variant(s); megas and
      // variants are each already in their canonical render order.
      const megasByBaseDex = new Map<number, Slot[]>();
      if (megaInline) {
        for (const m of megaSlots) {
          const dex = m.kind === "mega" ? m.form.baseDex : -1;
          const arr = megasByBaseDex.get(dex);
          if (arr) arr.push(m);
          else megasByBaseDex.set(dex, [m]);
        }
      }
      const variantsByBaseDex = new Map<number, Slot[]>();
      if (variantInline) {
        for (const v of variantSlots) {
          const dex = v.kind === "variant" ? v.form.baseDex : -1;
          const arr = variantsByBaseDex.get(dex);
          if (arr) arr.push(v);
          else variantsByBaseDex.set(dex, [v]);
        }
      }
      const out: Slot[] = [];
      for (const slot of baseDex) {
        out.push(slot);
        if (slot.kind === "dex") {
          const megas = megasByBaseDex.get(slot.dex);
          if (megas) out.push(...megas);
          const variants = variantsByBaseDex.get(slot.dex);
          if (variants) out.push(...variants);
        }
      }
      // Any non-inline (appended) megas/variants still tack on at the end.
      const appended: Slot[] = [];
      if (includeMegas && !megaInline) appended.push(...megaSlots);
      if (includeVariants && !variantInline) appended.push(...variantSlots);
      return [...out, ...appended];
    }

    // Both appended (or only one feature on, appended) → tack on at the end,
    // megas before variants.
    return [...baseDex, ...megaSlots, ...variantSlots];
  }, [
    mode,
    restrict,
    includeMegas,
    includeVariants,
    megaPlacement,
    variantPlacement,
  ]);
```
- [ ] **Step 7: Implement — `filtered` (197-225).** Current `switch` cases and the Mega name check handle only `dex`/`mega`. Replace the whole `filtered` memo. Current:
```tsx
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const isNumeric = needle !== "" && !Number.isNaN(Number(needle));
    return allSlots.filter((slot) => {
      if (needle) {
        if (slot.kind === "dex") {
          if (!slot.name.toLowerCase().includes(needle) && String(slot.dex) !== needle) {
            return false;
          }
        } else {
          // Numeric searches don't apply to Megas (they have no dex#).
          if (isNumeric) return false;
          if (!slot.form.displayName.toLowerCase().includes(needle)) return false;
        }
      }
      switch (filter) {
        case "all":
          return true;
        case "owned":
          return slot.kind === "mega"
            ? ownedMegaForms.has(slot.form.formKey)
            : ownedSpecies.has(slot.dex);
        case "needed":
          return slot.kind === "mega"
            ? !ownedMegaForms.has(slot.form.formKey)
            : !ownedSpecies.has(slot.dex);
      }
    });
  }, [allSlots, query, filter, ownedSpecies, ownedMegaForms]);
```
Change to:
```tsx
  const slotOwned = useCallback(
    (slot: Slot) =>
      slot.kind === "mega"
        ? ownedMegaForms.has(slot.form.formKey)
        : slot.kind === "variant"
        ? ownedVariantForms.has(slot.form.variantKey)
        : ownedSpecies.has(slot.dex),
    [ownedMegaForms, ownedVariantForms, ownedSpecies],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const isNumeric = needle !== "" && !Number.isNaN(Number(needle));
    return allSlots.filter((slot) => {
      if (needle) {
        if (slot.kind === "dex") {
          if (!slot.name.toLowerCase().includes(needle) && String(slot.dex) !== needle) {
            return false;
          }
        } else {
          // Numeric searches don't apply to Megas/variants (no dex#).
          if (isNumeric) return false;
          if (!slot.form.displayName.toLowerCase().includes(needle)) return false;
        }
      }
      switch (filter) {
        case "all":
          return true;
        case "owned":
          return slotOwned(slot);
        case "needed":
          return !slotOwned(slot);
      }
    });
  }, [allSlots, query, filter, slotOwned]);
```
Also add `useCallback` to the React import. Current `app/(dashboard)/_components/PokedexGrid.tsx:3`:
```tsx
import { useEffect, useMemo, useState } from "react";
```
Change to:
```tsx
import { useCallback, useEffect, useMemo, useState } from "react";
```
- [ ] **Step 8: Implement — `gens` (230-239) and `slotsByGen` (241-250).** Current `gens`:
```tsx
  const gens: Generation[] = useMemo(() => {
    const set = new Set<Generation>();
    for (const slot of filtered) {
      if (mode === "megas") set.add(slot.gen);
      else if (slot.kind === "dex") set.add(slot.gen);
      else if (megaPlacement === "inline") set.add(slot.gen);
      // appended Megas go in the synthetic group, not a real gen
    }
    return [...set].sort((a, b) => a - b);
  }, [filtered, mode, megaPlacement]);
```
Change to:
```tsx
  const gens: Generation[] = useMemo(() => {
    const set = new Set<Generation>();
    for (const slot of filtered) {
      if (mode === "megas" || mode === "variants") set.add(slot.gen);
      else if (slot.kind === "dex") set.add(slot.gen);
      else if (slot.kind === "mega" && megaPlacement === "inline") set.add(slot.gen);
      else if (slot.kind === "variant" && variantPlacement === "inline") set.add(slot.gen);
      // appended Megas/variants go in their synthetic groups, not a real gen
    }
    return [...set].sort((a, b) => a - b);
  }, [filtered, mode, megaPlacement, variantPlacement]);
```
Current `slotsByGen`:
```tsx
  const slotsByGen = useMemo(() => {
    const map = new Map<Generation, Slot[]>();
    for (const slot of filtered) {
      if (mode !== "megas" && slot.kind === "mega" && megaPlacement === "appended") continue;
      const arr = map.get(slot.gen);
      if (arr) arr.push(slot);
      else map.set(slot.gen, [slot]);
    }
    return map;
  }, [filtered, mode, megaPlacement]);
```
Change to:
```tsx
  const slotsByGen = useMemo(() => {
    const map = new Map<Generation, Slot[]>();
    for (const slot of filtered) {
      if (mode === "pokedex" && slot.kind === "mega" && megaPlacement === "appended") continue;
      if (mode === "pokedex" && slot.kind === "variant" && variantPlacement === "appended")
        continue;
      const arr = map.get(slot.gen);
      if (arr) arr.push(slot);
      else map.set(slot.gen, [slot]);
    }
    return map;
  }, [filtered, mode, megaPlacement, variantPlacement]);
```
- [ ] **Step 9: Implement — `appendedMegas` + new `appendedVariants` (252-255).** Current:
```tsx
  const appendedMegas = useMemo(() => {
    if (mode === "megas" || megaPlacement !== "appended" || !includeMegas) return [];
    return filtered.filter((s) => s.kind === "mega");
  }, [filtered, mode, megaPlacement, includeMegas]);
```
Change to:
```tsx
  const appendedMegas = useMemo(() => {
    if (mode !== "pokedex" || megaPlacement !== "appended" || !includeMegas) return [];
    return filtered.filter((s) => s.kind === "mega");
  }, [filtered, mode, megaPlacement, includeMegas]);

  const appendedVariants = useMemo(() => {
    if (mode !== "pokedex" || variantPlacement !== "appended" || !includeVariants) return [];
    return filtered.filter((s) => s.kind === "variant");
  }, [filtered, mode, variantPlacement, includeVariants]);
```
- [ ] **Step 10: Implement — `totalOwnedInView` (258-266).** Current:
```tsx
  const totalOwnedInView = useMemo(
    () =>
      filtered.filter((slot) =>
        slot.kind === "mega"
          ? ownedMegaForms.has(slot.form.formKey)
          : ownedSpecies.has(slot.dex),
      ).length,
    [filtered, ownedSpecies, ownedMegaForms],
  );
```
Change to:
```tsx
  const totalOwnedInView = useMemo(
    () => filtered.filter(slotOwned).length,
    [filtered, slotOwned],
  );
```
- [ ] **Step 11: Implement — `renderSlot` (270-283).** Current:
```tsx
  const renderSlot = (slot: Slot) => {
    if (slot.kind === "mega") {
      return <MegaCell key={slot.key} form={slot.form} onClick={onMegaClick} />;
    }
    return (
      <PokemonCell
        key={slot.key}
        dex={slot.dex}
        onClick={onCellClick}
        selected={selectedDex?.has(slot.dex)}
        displayCard={displayCardByDex?.get(slot.dex)}
      />
    );
  };
```
Change to:
```tsx
  const renderSlot = (slot: Slot) => {
    if (slot.kind === "mega") {
      return <MegaCell key={slot.key} form={slot.form} onClick={onMegaClick} />;
    }
    if (slot.kind === "variant") {
      return <VariantCell key={slot.key} form={slot.form} />;
    }
    return (
      <PokemonCell
        key={slot.key}
        dex={slot.dex}
        onClick={onCellClick}
        selected={selectedDex?.has(slot.dex)}
        displayCard={displayCardByDex?.get(slot.dex)}
      />
    );
  };
```
- [ ] **Step 12: Implement — per-gen `ownedInGen` + `totalInGen` (374-394).** Current:
```tsx
            const ownedInGen = items.filter((s) =>
              s.kind === "mega"
                ? ownedMegaForms.has(s.form.formKey)
                : ownedSpecies.has(s.dex),
            ).length;
            // Denominator considers ALL slots that would belong to this
            // gen group (ignoring the current filter, so percentages stay
            // honest even when filtering down).
            const totalInGen = (() => {
              if (mode === "megas") {
                return MEGAS.filter((m) => m.gen === g).length;
              }
              const dexCount = restrict
                ? POKEDEX.filter((p) => restrict.has(p.dex) && p.gen === g).length
                : hi - lo + 1;
              const megaCount =
                includeMegas && megaPlacement === "inline"
                  ? MEGAS.filter((m) => m.gen === g).length
                  : 0;
              return dexCount + megaCount;
            })();
```
Change to:
```tsx
            const ownedInGen = items.filter(slotOwned).length;
            // Denominator considers ALL slots that would belong to this
            // gen group (ignoring the current filter, so percentages stay
            // honest even when filtering down).
            const totalInGen = (() => {
              if (mode === "megas") {
                return MEGAS.filter((m) => m.gen === g).length;
              }
              if (mode === "variants") {
                return VARIANTS.filter((v) => v.gen === g).length;
              }
              const dexCount = restrict
                ? POKEDEX.filter((p) => restrict.has(p.dex) && p.gen === g).length
                : hi - lo + 1;
              const megaCount =
                includeMegas && megaPlacement === "inline"
                  ? MEGAS.filter((m) => m.gen === g).length
                  : 0;
              const variantCount =
                includeVariants && variantPlacement === "inline"
                  ? VARIANTS.filter((v) => v.gen === g).length
                  : 0;
              return dexCount + megaCount + variantCount;
            })();
```
- [ ] **Step 13: Implement — appended "Regional Variants" section after the Mega section (after 479).** The existing appended-Megas `<details>` block ends at line 479 with `</details>` then `)}` (closing `appendedMegas.length > 0 &&`). Insert the variants section immediately after that closing `)}` and before the surrounding `</div>` at 480. Current (tail of the grouped branch):
```tsx
              <div>{renderGrid(appendedMegas)}</div>
            </details>
          )}
        </div>
      ) : (
        renderGrid(filtered)
      )}
```
Change to:
```tsx
              <div>{renderGrid(appendedMegas)}</div>
            </details>
          )}
          {appendedVariants.length > 0 && (
            <details open className="group">
              <summary className="mb-3 flex cursor-pointer list-none items-end gap-4">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted nums">
                    Bonus
                  </span>
                  <h2 className="text-base font-semibold tracking-tight">{VARIANT_GROUP_LABEL}</h2>
                  <span className="text-[11px] text-muted nums">{VARIANTS.length} forms</span>
                </div>
                <div className="flex flex-1 items-center gap-3">
                  {isGuest ? (
                    <div className="flex-1" />
                  ) : (
                    (() => {
                      const owned = appendedVariants.filter(
                        (s) => s.kind === "variant" && ownedVariantForms.has(s.form.variantKey),
                      ).length;
                      const total = VARIANTS.length;
                      const pct = total > 0 ? (owned / total) * 100 : 0;
                      return (
                        <>
                          <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-border">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-variant transition-[width] duration-300 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] nums tabular-nums">
                            <span className="font-semibold text-variant">{owned}</span>
                            <span className="text-muted"> / {total}</span>
                          </span>
                        </>
                      );
                    })()
                  )}
                  <ChevronRight
                    aria-hidden
                    className="ml-1 h-3.5 w-3.5 text-muted transition-transform group-open:rotate-90"
                  />
                </div>
              </summary>
              <div>{renderGrid(appendedVariants)}</div>
            </details>
          )}
        </div>
      ) : (
        renderGrid(filtered)
      )}
```
- [ ] **Step 14: Implement — search placeholder (325).** Current:
```tsx
              placeholder={mode === "megas" ? "Name" : "Name or #"}
```
Change to:
```tsx
              placeholder={mode === "megas" || mode === "variants" ? "Name" : "Name or #"}
```
- [ ] **Step 15: Type-check gate** — Run: `npm run build` — Expected: compiles. (Depends on: `VARIANTS`/`RegionalVariant`, `ownedVariantForms` on `useOwnedCards()`, `treatVariantsAsSeparate`/`variantPlacement` on `useUser()`, and `VariantCell`. Sequence after those.)
- [ ] **Step 16: Commit** — `git add "app/(dashboard)/_components/PokedexGrid.tsx" && git commit -m "feat(variants): wire variant slots into PokedexGrid (inline/appended/separate)"`

---

### Task 18: Variants page (/variants)

Copy of `megas/page.tsx` + `MegasPageClient`. The server page gates on `treatVariantsAsSeparate && variantPlacement === "separate"` (else redirect to `/pokedex`); the client renders `<PokedexGrid mode="variants" />` with a progress header. No variant picker exists yet, so the grid is read-only (no `onMegaClick` analogue) — clicking a variant cell does nothing, matching a clean separate-page view.

**Files:**
- Create: `app/(dashboard)/variants/page.tsx`
- Create: `app/(dashboard)/variants/_components/VariantsPageClient.tsx`

- [ ] **Step 1: Implement — the server page.** Full new file `app/(dashboard)/variants/page.tsx`:
```tsx
import { redirect } from "next/navigation";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { VariantsPageClient } from "./_components/VariantsPageClient";

export default async function VariantsPage() {
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  if (!prefs.treatVariantsAsSeparate || prefs.variantPlacement !== "separate") {
    redirect("/pokedex");
  }
  return <VariantsPageClient />;
}
```
- [ ] **Step 2: Implement — the client.** Full new file `app/(dashboard)/variants/_components/VariantsPageClient.tsx`:
```tsx
"use client";

import { Globe2 } from "lucide-react";
import { VARIANTS } from "@/lib/data";
import { PageHeader } from "../../_components/PageHeader";
import { PokedexGrid } from "../../_components/PokedexGrid";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import { useUser } from "../../_lib/UserContext";

export function VariantsPageClient() {
  const { ownedVariantForms } = useOwnedCards();
  const { isGuest } = useUser();
  const total = VARIANTS.length;
  const owned = ownedVariantForms.size;
  const pct = total > 0 ? (owned / total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader
        icon={Globe2}
        title="Regional Variants"
        subtitle="Each Alolan, Galarian, Hisuian and Paldean form printed in the TCG, tracked separately from the base Pokédex."
        actions={
          isGuest ? null : (
            <div className="flex w-full flex-col gap-1.5 md:w-[260px]">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="uppercase tracking-wider text-muted">Variant progress</span>
                <span className="nums tabular-nums">
                  <span className="font-semibold text-variant">{owned}</span>
                  <span className="text-muted"> / {total}</span>
                  <span className="ml-1.5 text-muted">({pct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="relative h-1 overflow-hidden rounded-full bg-border">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-variant transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        }
      />
      <PokedexGrid mode="variants" storageKey="variants" groupByGenDefault fitToViewport />
    </div>
  );
}
```
- [ ] **Step 3: Type-check gate** — Run: `npm run build` — Expected: compiles. (Depends on: `loadUserPreferences` returning `treatVariantsAsSeparate`/`variantPlacement`, `VARIANTS`, `ownedVariantForms`, and PokedexGrid's `mode="variants"` from the prior task. Sequence last.)
- [ ] **Step 4: Commit** — `git add "app/(dashboard)/variants/page.tsx" "app/(dashboard)/variants/_components/VariantsPageClient.tsx" && git commit -m "feat(variants): dedicated /variants page (separate placement)"`

## E. Binder coverage & card detail
### Task 19: binder-scope.ts — VariantCoverageOptions + variant-aware coverage (test-first)

Depends on the types task having added `RegionalVariant` (with `variantKey`, `displayName`, `region`, `baseDex`, `gen`, `artworkId?`) and the optional `variantFormKey?: string` field on `CardEntry` in `lib/data/types.ts`. The unit test for this task is the gate.

**Files:**
- Create/Test: `tests/unit/binder-scope-variants.test.ts`
- Modify: `lib/data/binder-scope.ts:1-11` (imports + `VariantCoverageOptions`), `lib/data/binder-scope.ts:121-146` (`pickDisplayCardId`), `lib/data/binder-scope.ts:165-221` (`PokedexCoverageResult` + `pokedexCoverage`)

- [ ] **Step 1: Write the failing test** (new file, mirrors the existing `tests/unit/binder-scope.test.ts` fixture style)
```ts
import { describe, it, expect } from "vitest";
import { pokedexCoverage, pickDisplayCardId } from "@/lib/data/binder-scope";
import type { CardEntry, RegionalVariant } from "@/lib/data/types";

function card(overrides: Partial<CardEntry>): CardEntry {
  return {
    id: "x-1",
    name: "Card",
    setId: "x",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "Common",
    rarityRaw: "Common",
    dex: [1],
    types: ["Grass"],
    subtypes: ["Basic"],
    artist: "Alpha",
    imageSmall: "",
    imageLarge: "",
    ...overrides,
  };
}

// Alolan Vulpix #37 variant card; base Vulpix #37 card; region-exclusive
// Clodsire #980 card (region-prefixed name in real data but NO variantFormKey,
// per the orphan-card invariant) credits its base dex like any ordinary card.
const baseVulpix = card({ id: "set-37base", dex: [37] });
const alolanVulpix = card({ id: "set-37alola", dex: [37], variantFormKey: "alola-vulpix" });
const clodsire = card({ id: "set-980", dex: [980] }); // region-exclusive: no variantFormKey

const variants: RegionalVariant[] = [
  { variantKey: "alola-vulpix", displayName: "Alolan Vulpix", region: "alola", baseDex: 37, gen: 1 },
];

describe("pokedexCoverage — variant awareness", () => {
  it("variant card still credits base dex when toggle is OFF", () => {
    const owned = new Set(["set-37alola"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
    );
    expect(cov.covered.has(37)).toBe(true);
    expect(cov.variantForms).toEqual([]);
    expect(cov.coveredVariantForms.size).toBe(0);
  });

  it("variant card is excluded from dex contribution when toggle is ON", () => {
    const owned = new Set(["set-37alola"]); // only the Alolan card owned
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    // #37 NOT covered: the only owned #37 card is a variant.
    expect(cov.covered.has(37)).toBe(false);
    // The variant form is surfaced and counted as covered.
    expect(cov.variantForms.map((f) => f.variantKey)).toEqual(["alola-vulpix"]);
    expect([...cov.coveredVariantForms]).toEqual(["alola-vulpix"]);
  });

  it("base card still credits #37 when only the base print is owned and toggle ON", () => {
    const owned = new Set(["set-37base"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "inline", variants },
    );
    expect(cov.covered.has(37)).toBe(true);
    expect(cov.variantForms.map((f) => f.variantKey)).toEqual(["alola-vulpix"]);
    expect(cov.coveredVariantForms.size).toBe(0); // variant form not owned
  });

  it("placement 'separate' yields no variantForms in the binder", () => {
    const owned = new Set(["set-37alola"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "separate", variants },
    );
    expect(cov.covered.has(37)).toBe(false); // variant card still excluded from dex
    expect(cov.variantForms).toEqual([]);
    expect(cov.coveredVariantForms.size).toBe(0);
  });

  it("variantForms are filtered to forms whose baseDex is in range", () => {
    const owned = new Set<string>();
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 30 }, // #37 out of range
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    expect(cov.variantForms).toEqual([]);
  });

  it("region-exclusive (no variantFormKey) card credits its base dex with toggle ON", () => {
    const owned = new Set(["set-980"]);
    const cov = pokedexCoverage(
      { dexFrom: 950, dexTo: 1000 },
      owned,
      [clodsire],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    expect(cov.covered.has(980)).toBe(true);
    expect(cov.variantForms).toEqual([]);
  });

  it("megas and variants compose: both excluded from dex, both surfaced", () => {
    const megaCharizard = card({ id: "set-6mega", dex: [6], megaFormKey: "mega-charizard-x" });
    const alolanVulpix2 = card({ id: "set-37alola", dex: [37], variantFormKey: "alola-vulpix" });
    const owned = new Set(["set-6mega", "set-37alola"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [megaCharizard, alolanVulpix2],
      {
        treatMegasAsSeparate: true,
        megaPlacement: "appended",
        megas: [
          { formKey: "mega-charizard-x", displayName: "Mega Charizard X", baseDex: 6, gen: 1, isPrimal: false },
        ],
      },
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    expect(cov.covered.has(6)).toBe(false);
    expect(cov.covered.has(37)).toBe(false);
    expect([...cov.coveredMegaForms]).toEqual(["mega-charizard-x"]);
    expect([...cov.coveredVariantForms]).toEqual(["alola-vulpix"]);
  });
});

describe("pickDisplayCardId — excludeVariants", () => {
  it("filters out variant cards when excludeVariants is true", () => {
    const base = card({ id: "set-37base", dex: [37], rarity: "Rare" });
    const variant = card({ id: "set-37alola", dex: [37], rarity: "UltraRare", variantFormKey: "alola-vulpix" });
    // Without exclusion the higher-rarity variant would win.
    expect(pickDisplayCardId(undefined, [base, variant], false, false)).toBe("set-37alola");
    // With exclusion the variant drops out and the base print represents #37.
    expect(pickDisplayCardId(undefined, [base, variant], false, true)).toBe("set-37base");
  });

  it("a stale override pointing at a variant card falls through when excludeVariants is true", () => {
    const base = card({ id: "set-37base", dex: [37], rarity: "Rare" });
    const variant = card({ id: "set-37alola", dex: [37], rarity: "UltraRare", variantFormKey: "alola-vulpix" });
    expect(pickDisplayCardId("set-37alola", [base, variant], false, true)).toBe("set-37base");
  });

  it("excludeMegas and excludeVariants compose", () => {
    const base = card({ id: "set-6base", dex: [6], rarity: "Rare" });
    const mega = card({ id: "set-6mega", dex: [6], rarity: "UltraRare", megaFormKey: "mega-charizard-x" });
    const variant = card({ id: "set-6var", dex: [6], rarity: "SecretRare", variantFormKey: "galar-something" });
    expect(pickDisplayCardId(undefined, [base, mega, variant], true, true)).toBe("set-6base");
  });
});
```
- [ ] **Step 2: Run it, expect FAIL**
Run: `npx vitest run tests/unit/binder-scope-variants.test.ts` — Expected: FAIL (`pokedexCoverage` doesn't accept a 5th arg / result has no `variantForms`; `pickDisplayCardId` doesn't accept a 4th arg)
- [ ] **Step 3: Implement** — three edits to `lib/data/binder-scope.ts`.

3a. Imports + `VariantCoverageOptions` (lines 1-11). Replace:
```ts
import { SETS, loadSetCards } from ".";
import { OTHER_SUBTYPE_PREDICATES } from "./other-subtypes";
import { RARITY_ORDER, type CardEntry, type MegaForm } from "./types";

export type MegaPlacementForCoverage = "appended" | "inline" | "separate";

export interface MegaCoverageOptions {
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacementForCoverage;
  megas: MegaForm[];
}
```
with:
```ts
import { SETS, loadSetCards } from ".";
import { OTHER_SUBTYPE_PREDICATES } from "./other-subtypes";
import {
  RARITY_ORDER,
  type CardEntry,
  type MegaForm,
  type RegionalVariant,
} from "./types";

export type MegaPlacementForCoverage = "appended" | "inline" | "separate";

export interface MegaCoverageOptions {
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacementForCoverage;
  megas: MegaForm[];
}

export interface VariantCoverageOptions {
  treatVariantsAsSeparate: boolean;
  variantPlacement: "appended" | "inline" | "separate";
  variants: RegionalVariant[];
}
```

3b. `pickDisplayCardId` — add `excludeVariants` param (lines 110-146). Replace the doc comment block + signature + `eligible` line (lines 110-128). Replace:
```ts
/** For a pokedex-scope binder cell: pick which owned card's art to show.
 * Returns the override if it's still owned, otherwise the highest-rarity
 * owned card (tie-broken by id), otherwise null when nothing is owned.
 * `ownedCardsForDex` is the pre-filtered list of cards the user owns that
 * include this dex# in their `dex` array.
 *
 * When `excludeMegas` is true (the `treat_megas_as_separate` toggle is on),
 * any owned card carrying a `megaFormKey` is filtered out — a Mega Charizard X
 * can't represent slot #6 Charizard. An override pointing at a now-excluded
 * Mega card is treated as stale and falls through to the rarity fallback.
 */
export function pickDisplayCardId(
  overrideCardId: string | undefined,
  ownedCardsForDex: CardEntry[],
  excludeMegas = false,
): string | null {
  const eligible = excludeMegas
    ? ownedCardsForDex.filter((c) => !c.megaFormKey)
    : ownedCardsForDex;
```
with:
```ts
/** For a pokedex-scope binder cell: pick which owned card's art to show.
 * Returns the override if it's still owned, otherwise the highest-rarity
 * owned card (tie-broken by id), otherwise null when nothing is owned.
 * `ownedCardsForDex` is the pre-filtered list of cards the user owns that
 * include this dex# in their `dex` array.
 *
 * When `excludeMegas` is true (the `treat_megas_as_separate` toggle is on),
 * any owned card carrying a `megaFormKey` is filtered out — a Mega Charizard X
 * can't represent slot #6 Charizard. When `excludeVariants` is true (the
 * `treat_variants_as_separate` toggle is on), cards carrying a `variantFormKey`
 * are likewise dropped — an Alolan Vulpix can't represent slot #37 Vulpix. An
 * override pointing at a now-excluded card is treated as stale and falls
 * through to the rarity fallback.
 */
export function pickDisplayCardId(
  overrideCardId: string | undefined,
  ownedCardsForDex: CardEntry[],
  excludeMegas = false,
  excludeVariants = false,
): string | null {
  const eligible = ownedCardsForDex.filter(
    (c) =>
      (!excludeMegas || !c.megaFormKey) &&
      (!excludeVariants || !c.variantFormKey),
  );
```

3c. `PokedexCoverageResult` + `pokedexCoverage` (lines 165-221). Replace the result interface (lines 165-172):
```ts
export interface PokedexCoverageResult {
  dexNumbers: number[];
  covered: Set<number>;
  /** Mega forms whose `baseDex` falls in [dexFrom, dexTo]. Populated only
   * when the toggle is on and placement is not "separate". */
  megaForms: MegaForm[];
  coveredMegaForms: Set<string>;
}
```
with:
```ts
export interface PokedexCoverageResult {
  dexNumbers: number[];
  covered: Set<number>;
  /** Mega forms whose `baseDex` falls in [dexFrom, dexTo]. Populated only
   * when the toggle is on and placement is not "separate". */
  megaForms: MegaForm[];
  coveredMegaForms: Set<string>;
  /** Regional variant forms whose `baseDex` falls in [dexFrom, dexTo].
   * Populated only when the toggle is on and placement is not "separate". */
  variantForms: RegionalVariant[];
  coveredVariantForms: Set<string>;
}
```
Then replace the function body region from the signature through the `return` (lines 185-221):
```ts
export function pokedexCoverage(
  range: { dexFrom: number; dexTo: number },
  ownedCardIds: Set<string>,
  cards: CardEntry[],
  mega?: MegaCoverageOptions,
): PokedexCoverageResult {
  const lo = Math.min(range.dexFrom, range.dexTo);
  const hi = Math.max(range.dexFrom, range.dexTo);
  const dexNumbers: number[] = [];
  for (let d = lo; d <= hi; d++) dexNumbers.push(d);

  const excludeMegasFromDex = mega?.treatMegasAsSeparate === true;
  const covered = new Set<number>();
  for (const c of cards) {
    if (!ownedCardIds.has(c.id)) continue;
    if (excludeMegasFromDex && c.megaFormKey) continue;
    for (const d of c.dex) {
      if (d >= lo && d <= hi) covered.add(d);
    }
  }

  const includeMegasInBinder =
    mega?.treatMegasAsSeparate === true && mega.megaPlacement !== "separate";
  const megaForms = includeMegasInBinder
    ? mega.megas.filter((f) => f.baseDex >= lo && f.baseDex <= hi)
    : [];
  const coveredMegaForms = new Set<string>();
  if (includeMegasInBinder) {
    const wantedKeys = new Set(megaForms.map((f) => f.formKey));
    for (const c of cards) {
      if (!c.megaFormKey || !wantedKeys.has(c.megaFormKey)) continue;
      if (ownedCardIds.has(c.id)) coveredMegaForms.add(c.megaFormKey);
    }
  }

  return { dexNumbers, covered, megaForms, coveredMegaForms };
}
```
with:
```ts
export function pokedexCoverage(
  range: { dexFrom: number; dexTo: number },
  ownedCardIds: Set<string>,
  cards: CardEntry[],
  mega?: MegaCoverageOptions,
  variant?: VariantCoverageOptions,
): PokedexCoverageResult {
  const lo = Math.min(range.dexFrom, range.dexTo);
  const hi = Math.max(range.dexFrom, range.dexTo);
  const dexNumbers: number[] = [];
  for (let d = lo; d <= hi; d++) dexNumbers.push(d);

  const excludeMegasFromDex = mega?.treatMegasAsSeparate === true;
  const excludeVariantsFromDex = variant?.treatVariantsAsSeparate === true;
  const covered = new Set<number>();
  for (const c of cards) {
    if (!ownedCardIds.has(c.id)) continue;
    if (excludeMegasFromDex && c.megaFormKey) continue;
    if (excludeVariantsFromDex && c.variantFormKey) continue;
    for (const d of c.dex) {
      if (d >= lo && d <= hi) covered.add(d);
    }
  }

  const includeMegasInBinder =
    mega?.treatMegasAsSeparate === true && mega.megaPlacement !== "separate";
  const megaForms = includeMegasInBinder
    ? mega.megas.filter((f) => f.baseDex >= lo && f.baseDex <= hi)
    : [];
  const coveredMegaForms = new Set<string>();
  if (includeMegasInBinder) {
    const wantedKeys = new Set(megaForms.map((f) => f.formKey));
    for (const c of cards) {
      if (!c.megaFormKey || !wantedKeys.has(c.megaFormKey)) continue;
      if (ownedCardIds.has(c.id)) coveredMegaForms.add(c.megaFormKey);
    }
  }

  const includeVariantsInBinder =
    variant?.treatVariantsAsSeparate === true &&
    variant.variantPlacement !== "separate";
  const variantForms = includeVariantsInBinder
    ? variant.variants.filter((f) => f.baseDex >= lo && f.baseDex <= hi)
    : [];
  const coveredVariantForms = new Set<string>();
  if (includeVariantsInBinder) {
    const wantedKeys = new Set(variantForms.map((f) => f.variantKey));
    for (const c of cards) {
      if (!c.variantFormKey || !wantedKeys.has(c.variantFormKey)) continue;
      if (ownedCardIds.has(c.id)) coveredVariantForms.add(c.variantFormKey);
    }
  }

  return {
    dexNumbers,
    covered,
    megaForms,
    coveredMegaForms,
    variantForms,
    coveredVariantForms,
  };
}
```
- [ ] **Step 4: Run it, expect PASS** — Run: `npx vitest run tests/unit/binder-scope-variants.test.ts` — Expected: PASS. Also run `npx vitest run tests/unit/binder-scope.test.ts` — Expected: PASS (existing tests unaffected; `pickDisplayCardId`'s new param defaults to `false`).
- [ ] **Step 5: Commit** — `git add lib/data/binder-scope.ts tests/unit/binder-scope-variants.test.ts && git commit -m "feat(variants): variant-aware pokedexCoverage + pickDisplayCardId excludeVariants"`

---

### Task 20: BinderListPricedGrid — thread variant coverage options

Threads `VariantCoverageOptions` into both grids (priced + unpriced fallback) and folds variant forms into `targetCount` / `ownedCount`. Depends on the binder-scope task and on the barrel exporting `VARIANTS`. The `treatVariantsAsSeparate` / `variantPlacement` props arrive from the binders index page (`app/(dashboard)/binders/page.tsx`) wired in the prefs cluster; this task adds them to the `Props` interface and the two compute paths.

**Files:**
- Modify: `app/(dashboard)/binders/_components/BinderListPricedGrid.tsx:1-9` (imports), `:25-47` (`Props` + signature), `:68-74` (priced compute), `:138-162` (unpriced compute)

- [ ] **Step 1: Implement** (UI wiring — type-check is the gate; no unit test)

1a. Imports (lines 1-9). Replace:
```ts
import { MEGAS } from "@/lib/data";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  pokedexCoverage,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
```
with:
```ts
import { MEGAS, VARIANTS } from "@/lib/data";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  pokedexCoverage,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
```

1b. `Props` interface (lines 25-33). Replace:
```ts
interface Props {
  binders: BinderRow[];
  customCardsByBinder: Map<string, string[]>;
  ownedQuantities: Map<string, number>;
  treatMegasAsSeparate: boolean;
  megaPlacement: "appended" | "inline" | "separate";
  priceSource: PriceSource;
  display: DisplayConversion;
}
```
with:
```ts
interface Props {
  binders: BinderRow[];
  customCardsByBinder: Map<string, string[]>;
  ownedQuantities: Map<string, number>;
  treatMegasAsSeparate: boolean;
  megaPlacement: "appended" | "inline" | "separate";
  treatVariantsAsSeparate: boolean;
  variantPlacement: "appended" | "inline" | "separate";
  priceSource: PriceSource;
  display: DisplayConversion;
}
```

1c. Priced component signature (lines 39-47). Replace:
```ts
export async function BinderListPricedGrid({
  binders,
  customCardsByBinder,
  ownedQuantities,
  treatMegasAsSeparate,
  megaPlacement,
  priceSource,
  display,
}: Props) {
```
with:
```ts
export async function BinderListPricedGrid({
  binders,
  customCardsByBinder,
  ownedQuantities,
  treatMegasAsSeparate,
  megaPlacement,
  treatVariantsAsSeparate,
  variantPlacement,
  priceSource,
  display,
}: Props) {
```

1d. Priced compute (lines 68-74). Replace:
```ts
      const cov = pokedexCoverage(params, ownedIds, inRange, {
        treatMegasAsSeparate,
        megaPlacement,
        megas: MEGAS,
      });
      targetCount = cov.dexNumbers.length + cov.megaForms.length;
      ownedCount = cov.covered.size + cov.coveredMegaForms.size;
```
with:
```ts
      const cov = pokedexCoverage(
        params,
        ownedIds,
        inRange,
        { treatMegasAsSeparate, megaPlacement, megas: MEGAS },
        { treatVariantsAsSeparate, variantPlacement, variants: VARIANTS },
      );
      targetCount =
        cov.dexNumbers.length + cov.megaForms.length + cov.variantForms.length;
      ownedCount =
        cov.covered.size +
        cov.coveredMegaForms.size +
        cov.coveredVariantForms.size;
```

1e. Unpriced fallback component signature (lines 138-147). Replace:
```ts
export function BinderListUnpricedGrid({
  binders,
  customCardsByBinder,
  ownedQuantities,
  treatMegasAsSeparate,
  megaPlacement,
  priceSource,
  display,
  allCards,
}: Props & { allCards: import("@/lib/data/types").CardEntry[] }) {
```
with:
```ts
export function BinderListUnpricedGrid({
  binders,
  customCardsByBinder,
  ownedQuantities,
  treatMegasAsSeparate,
  megaPlacement,
  treatVariantsAsSeparate,
  variantPlacement,
  priceSource,
  display,
  allCards,
}: Props & { allCards: import("@/lib/data/types").CardEntry[] }) {
```

1f. Unpriced compute (lines 156-162). Replace:
```ts
      const cov = pokedexCoverage(params, ownedIds, inRange, {
        treatMegasAsSeparate,
        megaPlacement,
        megas: MEGAS,
      });
      targetCount = cov.dexNumbers.length + cov.megaForms.length;
      ownedCount = cov.covered.size + cov.coveredMegaForms.size;
```
with:
```ts
      const cov = pokedexCoverage(
        params,
        ownedIds,
        inRange,
        { treatMegasAsSeparate, megaPlacement, megas: MEGAS },
        { treatVariantsAsSeparate, variantPlacement, variants: VARIANTS },
      );
      targetCount =
        cov.dexNumbers.length + cov.megaForms.length + cov.variantForms.length;
      ownedCount =
        cov.covered.size +
        cov.coveredMegaForms.size +
        cov.coveredVariantForms.size;
```
- [ ] **Step 2: Type-check** — Run: `npm run build` — Expected: compiles (a transient error if the binders index page hasn't yet passed `treatVariantsAsSeparate`/`variantPlacement` to these components — that wiring belongs to the prefs/page cluster; coordinate ordering. The component itself is correct.)
- [ ] **Step 3: Commit** — `git add app/(dashboard)/binders/_components/BinderListPricedGrid.tsx && git commit -m "feat(variants): thread variant coverage options through BinderListPricedGrid"`

---

### Task 21: BinderDetailClient — variant-aware totals, grid props, display-card exclusion

Adds `variantsInRange` to the pokedex-binder totals/coverage and passes `excludeVariants` to `pickDisplayCardId`. The `<PokedexGrid>` render is left unchanged (see step 1e — the grid does not overlay variant slots in binder mode). Depends on: the binder-scope task (`excludeVariants` param + `coveredVariantForms`), the barrel (`VARIANTS`), `OwnedCardsContext` exposing `ownedVariantForms`, and `UserContext` exposing `treatVariantsAsSeparate`/`variantPlacement`.

**Files:**
- Modify: `app/(dashboard)/binders/[id]/_components/BinderDetailClient.tsx:7` (import VARIANTS), `:68-69` (context destructuring), `:91-107` (variantsInRange + total + ownedCount), `:174-190` (displayCardByDex pickDisplayCardId call), `:354-362` (PokedexGrid props)

- [ ] **Step 1: Implement** (UI wiring — type-check is the gate)

1a. Import `VARIANTS` (line 7). Replace:
```ts
import { MEGAS } from "@/lib/data";
```
with:
```ts
import { MEGAS, VARIANTS } from "@/lib/data";
```

1b. Context destructuring (lines 68-69). Replace:
```ts
  const { ownedCards, ownedSpecies, ownedMegaForms } = useOwnedCards();
  const { treatMegasAsSeparate, megaPlacement, display } = useUser();
  const includeMegasInBinder =
    treatMegasAsSeparate && megaPlacement !== "separate";
```
with:
```ts
  const { ownedCards, ownedSpecies, ownedMegaForms, ownedVariantForms } =
    useOwnedCards();
  const {
    treatMegasAsSeparate,
    megaPlacement,
    treatVariantsAsSeparate,
    variantPlacement,
    display,
  } = useUser();
  const includeMegasInBinder =
    treatMegasAsSeparate && megaPlacement !== "separate";
  const includeVariantsInBinder =
    treatVariantsAsSeparate && variantPlacement !== "separate";
```

1c. Add `variantsInRange` and fold into `total` / `ownedCount` (lines 89-107). Replace:
```ts
  // Megas that belong to this pokedex-binder's range (only when the toggle
  // is on AND placement is not "separate").
  const megasInRange = useMemo(() => {
    if (!isPokedex || !dexRange || !includeMegasInBinder) return [];
    return MEGAS.filter((m) => m.baseDex >= dexRange.from && m.baseDex <= dexRange.to);
  }, [isPokedex, dexRange, includeMegasInBinder]);

  const total = isPokedex
    ? (dexRange?.nums.length ?? 0) + megasInRange.length
    : cards.length;
  const ownedCount = useMemo(() => {
    if (isPokedex && dexRange) {
      let n = 0;
      for (const d of dexRange.nums) if (ownedSpecies.has(d)) n++;
      for (const m of megasInRange) if (ownedMegaForms.has(m.formKey)) n++;
      return n;
    }
    return cards.reduce((acc, c) => acc + (ownedCards.has(c.id) ? 1 : 0), 0);
  }, [isPokedex, dexRange, ownedSpecies, megasInRange, ownedMegaForms, cards, ownedCards]);
```
with:
```ts
  // Megas that belong to this pokedex-binder's range (only when the toggle
  // is on AND placement is not "separate").
  const megasInRange = useMemo(() => {
    if (!isPokedex || !dexRange || !includeMegasInBinder) return [];
    return MEGAS.filter((m) => m.baseDex >= dexRange.from && m.baseDex <= dexRange.to);
  }, [isPokedex, dexRange, includeMegasInBinder]);

  // Regional variants that belong to this pokedex-binder's range (only when
  // the toggle is on AND placement is not "separate") — parallel to megas.
  const variantsInRange = useMemo(() => {
    if (!isPokedex || !dexRange || !includeVariantsInBinder) return [];
    return VARIANTS.filter(
      (v) => v.baseDex >= dexRange.from && v.baseDex <= dexRange.to,
    );
  }, [isPokedex, dexRange, includeVariantsInBinder]);

  const total = isPokedex
    ? (dexRange?.nums.length ?? 0) + megasInRange.length + variantsInRange.length
    : cards.length;
  const ownedCount = useMemo(() => {
    if (isPokedex && dexRange) {
      let n = 0;
      for (const d of dexRange.nums) if (ownedSpecies.has(d)) n++;
      for (const m of megasInRange) if (ownedMegaForms.has(m.formKey)) n++;
      for (const v of variantsInRange)
        if (ownedVariantForms.has(v.variantKey)) n++;
      return n;
    }
    return cards.reduce((acc, c) => acc + (ownedCards.has(c.id) ? 1 : 0), 0);
  }, [
    isPokedex,
    dexRange,
    ownedSpecies,
    megasInRange,
    ownedMegaForms,
    variantsInRange,
    ownedVariantForms,
    cards,
    ownedCards,
  ]);
```

1d. `displayCardByDex` — pass `excludeVariants` (lines 180-190). Replace:
```ts
      const ownedForDex = ownedByDex.get(d) ?? [];
      // When the toggle is on, Mega cards must not represent a base dex slot.
      // Stale overrides pointing at a Mega card fall through to the rarity
      // fallback (no DB cleanup needed — flipping the toggle off restores).
      const cardId = pickDisplayCardId(overrides[d], ownedForDex, treatMegasAsSeparate);
      if (cardId) {
        const card = byId.get(cardId);
        if (card) out.set(d, card);
      }
    }
    return out;
  }, [isPokedex, dexRange, cards, ownedByDex, overrides, treatMegasAsSeparate]);
```
with:
```ts
      const ownedForDex = ownedByDex.get(d) ?? [];
      // When a toggle is on, the corresponding form's cards must not represent
      // a base dex slot. Stale overrides pointing at an excluded card fall
      // through to the rarity fallback (no DB cleanup needed — flipping the
      // toggle off restores).
      const cardId = pickDisplayCardId(
        overrides[d],
        ownedForDex,
        treatMegasAsSeparate,
        treatVariantsAsSeparate,
      );
      if (cardId) {
        const card = byId.get(cardId);
        if (card) out.set(d, card);
      }
    }
    return out;
  }, [
    isPokedex,
    dexRange,
    cards,
    ownedByDex,
    overrides,
    treatMegasAsSeparate,
    treatVariantsAsSeparate,
  ]);
```

1e. **Do NOT pass any new props to `<PokedexGrid>`** (per Reconciliation decision #3). The `<PokedexGrid>` render in this file is **unchanged**. Rationale: `PokedexGrid` computes `includeMegas` locally and forces it off whenever `displayCardByDex` is set (binder dex-range mode), so it does not render mega/variant overlay slots inside a binder grid and accepts no `includeMegas`/`includeVariants` props. The `includeVariantsInBinder` flag you added above is consumed only by the `variantsInRange` total/coverage memos in this component — not by the grid. Variant awareness inside a binder lives entirely in the binder-scope totals (`coveredVariantForms`) and `pickDisplayCardId(excludeVariants)`.
- [ ] **Step 2: Type-check** — Run: `npm run build` — Expected: compiles once `OwnedCardsContext` exposes `ownedVariantForms`, `UserContext` exposes `treatVariantsAsSeparate`/`variantPlacement`, and the binder-scope `excludeVariants` param exists.
- [ ] **Step 3: Commit** — `git add app/(dashboard)/binders/[id]/_components/BinderDetailClient.tsx && git commit -m "feat(variants): variant-aware totals + display-card exclusion in BinderDetailClient"`

---

### Task 22: Card detail — pass variantFormKey to BinderMembership

Mirror of the `megaFormKey` pass-through (page.tsx line 407). Depends on the types task adding `variantFormKey?: string` to `CardEntry`, and on the BinderMembership task below.

**Files:**
- Modify: `app/(dashboard)/cards/[cardId]/page.tsx:402-409`

- [ ] **Step 1: Implement** (UI wiring — type-check is the gate). Replace:
```tsx
          {user && matchedBinders.length > 0 && (
            <BinderMembership
              binders={matchedBinders}
              cardId={card.id}
              dexNumbers={card.dex}
              megaFormKey={card.megaFormKey ?? null}
            />
          )}
```
with:
```tsx
          {user && matchedBinders.length > 0 && (
            <BinderMembership
              binders={matchedBinders}
              cardId={card.id}
              dexNumbers={card.dex}
              megaFormKey={card.megaFormKey ?? null}
              variantFormKey={card.variantFormKey ?? null}
            />
          )}
```
- [ ] **Step 2: Type-check** — Run: `npm run build` — Expected: compiles once `BinderMembership` accepts the `variantFormKey` prop (task below) and `CardEntry.variantFormKey` exists.
- [ ] **Step 3: Commit** — `git add app/(dashboard)/cards/[cardId]/page.tsx && git commit -m "feat(variants): pass variantFormKey to BinderMembership"`

---

### Task 23: BinderMembership — variant-aware slot coverage

Accepts the `variantFormKey` prop and short-circuits coverage to `isVariantFormOwned` when the variant toggle is on, exactly parallel to the existing Mega path (lines 25/42/55). Depends on `OwnedCardsContext` exposing `isVariantFormOwned` and `UserContext` exposing `treatVariantsAsSeparate`.

**Files:**
- Modify: `app/(dashboard)/cards/[cardId]/_components/BinderMembership.tsx:19-26` (Props), `:44-60` (hooks + `slotCovered`)

- [ ] **Step 1: Implement** (UI wiring — type-check is the gate)

1a. `Props` interface (lines 19-26). Replace:
```ts
interface Props {
  binders: BinderRef[];
  cardId: string;
  /** This card's national dex number(s) — usually one. */
  dexNumbers: number[];
  /** This card's Mega form key, if it resolves to a single Mega/Primal form. */
  megaFormKey: string | null;
}
```
with:
```ts
interface Props {
  binders: BinderRef[];
  cardId: string;
  /** This card's national dex number(s) — usually one. */
  dexNumbers: number[];
  /** This card's Mega form key, if it resolves to a single Mega/Primal form. */
  megaFormKey: string | null;
  /** This card's regional-variant form key, if it resolves to one. */
  variantFormKey: string | null;
}
```

1b. Destructure the prop, the hook, the toggle, and extend `slotCovered` (lines 38-60). Replace:
```ts
export function BinderMembership({
  binders,
  cardId,
  dexNumbers,
  megaFormKey,
}: Props) {
  const { quantityOf, isSpeciesOwned, isMegaFormOwned } = useOwnedCards();
  const { treatMegasAsSeparate } = useUser();

  if (binders.length === 0) return null;

  const ownThisCard = quantityOf(cardId) > 0;

  // Is this card's pokedex slot already satisfied by any owned card (this one
  // or another print of the same Pokémon)? A Mega-form card is satisfied by its
  // form when Megas are tracked as separate slots, matching deriveSpecies.
  const slotCovered = (range: { from: number; to: number }): boolean => {
    if (treatMegasAsSeparate && megaFormKey) return isMegaFormOwned(megaFormKey);
    const lo = Math.min(range.from, range.to);
    const hi = Math.max(range.from, range.to);
    const inRange = dexNumbers.filter((d) => d >= lo && d <= hi);
    return inRange.length > 0 && inRange.every((d) => isSpeciesOwned(d));
  };
```
with:
```ts
export function BinderMembership({
  binders,
  cardId,
  dexNumbers,
  megaFormKey,
  variantFormKey,
}: Props) {
  const { quantityOf, isSpeciesOwned, isMegaFormOwned, isVariantFormOwned } =
    useOwnedCards();
  const { treatMegasAsSeparate, treatVariantsAsSeparate } = useUser();

  if (binders.length === 0) return null;

  const ownThisCard = quantityOf(cardId) > 0;

  // Is this card's pokedex slot already satisfied by any owned card (this one
  // or another print of the same Pokémon)? A Mega-form card is satisfied by its
  // form when Megas are tracked as separate slots; a regional-variant card by
  // its variant form when variants are tracked separately — both match
  // deriveSpecies. A card carries at most one of megaFormKey / variantFormKey.
  const slotCovered = (range: { from: number; to: number }): boolean => {
    if (treatMegasAsSeparate && megaFormKey) return isMegaFormOwned(megaFormKey);
    if (treatVariantsAsSeparate && variantFormKey)
      return isVariantFormOwned(variantFormKey);
    const lo = Math.min(range.from, range.to);
    const hi = Math.max(range.from, range.to);
    const inRange = dexNumbers.filter((d) => d >= lo && d <= hi);
    return inRange.length > 0 && inRange.every((d) => isSpeciesOwned(d));
  };
```
- [ ] **Step 2: Type-check** — Run: `npm run build` — Expected: compiles once `OwnedCardsContext` exposes `isVariantFormOwned` and `UserContext` exposes `treatVariantsAsSeparate`.
- [ ] **Step 3: Commit** — `git add app/(dashboard)/cards/[cardId]/_components/BinderMembership.tsx && git commit -m "feat(variants): variant-aware slot coverage in BinderMembership"`


### Task 24: `binders/page.tsx` — thread variant prefs into the binder list grids

**Files:**
- Modify: `app/(dashboard)/binders/page.tsx:108-128`

The binder list components (Task 20) now require `treatVariantsAsSeparate` / `variantPlacement` props. The index page already passes the Mega equivalents to both `<BinderListUnpricedGrid>` (the Suspense fallback) and `<BinderListPricedGrid>`; add the two variant props right beside them. `prefs` already comes from `loadUserPreferences(userId)` (line 31) and carries the new fields after section B. No unit test — the gate is the type-check.

- [ ] **Step 1: Add variant props to the Suspense fallback grid.** In `app/(dashboard)/binders/page.tsx`, edit the `<BinderListUnpricedGrid>` element:

  Before:
  ```tsx
            <BinderListUnpricedGrid
              binders={binders}
              customCardsByBinder={customCardsByBinder}
              ownedQuantities={ownedQuantities}
              treatMegasAsSeparate={prefs.treatMegasAsSeparate}
              megaPlacement={prefs.megaPlacement}
              priceSource={prefs.priceSource}
              display={display}
              allCards={allCards}
            />
  ```
  After:
  ```tsx
            <BinderListUnpricedGrid
              binders={binders}
              customCardsByBinder={customCardsByBinder}
              ownedQuantities={ownedQuantities}
              treatMegasAsSeparate={prefs.treatMegasAsSeparate}
              megaPlacement={prefs.megaPlacement}
              treatVariantsAsSeparate={prefs.treatVariantsAsSeparate}
              variantPlacement={prefs.variantPlacement}
              priceSource={prefs.priceSource}
              display={display}
              allCards={allCards}
            />
  ```

- [ ] **Step 2: Add variant props to the priced grid.** Edit the `<BinderListPricedGrid>` element:

  Before:
  ```tsx
          <BinderListPricedGrid
            binders={binders}
            customCardsByBinder={customCardsByBinder}
            ownedQuantities={ownedQuantities}
            treatMegasAsSeparate={prefs.treatMegasAsSeparate}
            megaPlacement={prefs.megaPlacement}
            priceSource={prefs.priceSource}
            display={display}
          />
  ```
  After:
  ```tsx
          <BinderListPricedGrid
            binders={binders}
            customCardsByBinder={customCardsByBinder}
            ownedQuantities={ownedQuantities}
            treatMegasAsSeparate={prefs.treatMegasAsSeparate}
            megaPlacement={prefs.megaPlacement}
            treatVariantsAsSeparate={prefs.treatVariantsAsSeparate}
            variantPlacement={prefs.variantPlacement}
            priceSource={prefs.priceSource}
            display={display}
          />
  ```

- [ ] **Step 3: Type-check** — Run: `npm run build` — Expected: compiles (both binder grids receive the required variant props).
- [ ] **Step 4: Commit** — `git add "app/(dashboard)/binders/page.tsx" && git commit -m "feat(variants): thread variant prefs into the binders index grids"`

---

## F. Final: rebuild data, verify, and e2e

### Task 25: Populate real variant data via `data:rebuild`

**Files:**
- Regenerate: `lib/data/variants.json`, `lib/data/cardIndexByVariant.json`, and `variantFormKey` fields inside `lib/data/cards/*.json`

- [ ] **Step 1: Run the ingest pipeline** (hits PokéAPI; needs network). Run: `npm run data:rebuild` — Expected: console logs the variant discovery; any region-prefixed name that fails to resolve prints a `[variant-art] … region-exclusive` warning (Clodsire, Sneasler, Perrserker, Cursola, Sirfetch'd, Mr. Rime, Runerigus, Obstagoon, Basculegion, Overqwil — 10 total).
- [ ] **Step 2: Sanity-check the output.** Run: `node -e "const v=require('./lib/data/variants.json'); console.log(v.length, v.every(x=>x.artworkId)); console.log([...new Set(v.map(x=>x.region))])"` — Expected: `56 true` and `[ 'alola', 'galar', 'hisui', 'paldea' ]`.
- [ ] **Step 3: Verify the orphan invariant on real data.** Run: `node -e "const c=require('./lib/data/cardIndexByVariant.json'); const v=require('./lib/data/variants.json'); const keys=new Set(v.map(x=>x.variantKey)); const idx=Object.keys(c); console.log('all index keys are real variants:', idx.every(k=>keys.has(k)))"` — Expected: `true`.
- [ ] **Step 4: Confirm a region-exclusive card kept its base dex** (no variantFormKey). Run: `grep -l '"Paldean Clodsire' lib/data/cards/*.json | head -1 | xargs grep -A2 'Paldean Clodsire' | grep -c variantFormKey` — Expected: `0`.
- [ ] **Step 5: Full type-check + unit tests.** Run: `npm run build && npm test` — Expected: build compiles, all unit tests pass.
- [ ] **Step 6: Commit the regenerated data.** `git add lib/data/variants.json lib/data/cardIndexByVariant.json lib/data/cards && git commit -m "feat(variants): regenerate reference data with 56 resolved regional variants"`

### Task 26: Manual smoke + (optional) e2e

**Files:**
- Optional: `tests/e2e/variants.spec.ts` (mirror an existing settings-toggle spec; uses the project's OTP-cookie auth fixture, not the broken `signIn` helper)

- [ ] **Step 1: Manual smoke.** `npm run dev`, sign in, go to **Settings** → toggle "Treat regional variants as separate Pokémon" → for each placement (Appended / Inline / Dedicated page) verify on **/pokedex**: an Alolan Vulpix slot shows distinct Alolan artwork; Vulpix #37 still shows its normal art and is no longer credited by a variant-only Alolan Vulpix card; **Paldean Clodsire** still sits on #980. Open a binder whose range includes #37 and confirm the variant counts in coverage.
- [ ] **Step 2 (optional): codify as e2e.** Create `tests/e2e/variants.spec.ts` mirroring the existing settings/pokedex e2e spec structure (find it under `tests/e2e/`): authenticate via the established OTP-verify + injected `@supabase/ssr` cookie fixture; toggle the setting; assert `getByRole`/`getByAltText` for the Alolan Vulpix variant cell's distinct art; assert the Clodsire base-slot invariant. Run: `npx playwright test tests/e2e/variants.spec.ts` — Expected: PASS.
- [ ] **Step 3: Commit (if e2e added).** `git add tests/e2e/variants.spec.ts && git commit -m "test(variants): e2e for the regional-variants setting"`

---

## Deferred follow-ups (out of scope for this plan)

- **Variant hover-preview cards.** To match `MegaCell`'s hover preview: extend `HoverTarget` in `PokemonHoverContext` with `{ kind: "variant"; form: RegionalVariant }`, handle that kind in `PokemonHoverCard` (render `officialArtworkUrl(form.artworkId ?? form.baseDex)` + `form.displayName`), then re-add the `onMouseEnter`/`onFocus`/`onMouseLeave`/`onBlur` + ref `show/hide` wiring to `VariantCell` exactly as `MegaCell` has it (with `kind: "variant"`).
- **Variant picker on the /variants page.** The dedicated page renders read-only cells (no `onVariantClick`). If a `VariantVariantPicker` is wanted later, thread an `onVariantClick` prop through `PokedexGrid` mirroring `onMegaClick`.
