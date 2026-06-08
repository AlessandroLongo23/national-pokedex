import {
  genOf,
  type CardEntry,
  type VariantIndex,
  type VariantRegion,
} from "@/lib/data/types";
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
