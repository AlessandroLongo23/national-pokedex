// Server-side payload builder for the binder placeholder-print feature.
//
// Resolves a binder's scope into an ordered list of `PrintItem`s — each carrying
// the data both placeholder styles need (an "artwork" species payload and/or a
// "scan" card payload) so the client can switch styles and filters with no
// refetch. This module is SERVER-ONLY (it imports the `@/lib/data` barrel, which
// pulls in species.json and the per-mega/per-dex card indexes); the client print
// components must not import it.

import { SPECIES, MEGAS, CARD_INDEX, CARD_INDEX_BY_MEGA, formatSetCode } from "@/lib/data";
import { officialArtworkUrl } from "@/lib/pokeapi";
import {
  RARITY_LABEL,
  RARITY_ORDER,
  genOf,
  type CardEntry,
  type MegaForm,
} from "@/lib/data/types";
import type { ScopeType } from "@/lib/data/binder-scope";

export type PrintStyle = "artwork" | "scan";

export interface SpeciesPayload {
  dex: number;
  name: string;
  gen: number;
  genus: string;
  heightM: number;
  weightKg: number;
  types: string[]; // lowercased
  artworkUrl: string;
}

export interface CardPayload {
  id: string;
  name: string;
  setCode: string; // formatSetCode(setId), e.g. "SV1"
  number: string;
  imageSmall: string;
  imageLarge: string;
  rarityLabel: string;
}

export interface PrintItem {
  /** Stable selection key: "dex:<n>" | "mega:<formKey>" | "card:<id>". */
  key: string;
  owned: boolean;
  species?: SpeciesPayload;
  card?: CardPayload;
}

export interface BuildPrintItemsArgs {
  scopeType: ScopeType;
  /** Cards resolved for the binder scope (or the custom card list). */
  cards: CardEntry[];
  ownedCardIds: Set<string>;
  ownedSpecies: Set<number>;
  ownedMegaForms: Set<string>;
  /** Present for pokedex scope. */
  dexRange?: { from: number; to: number };
  /** Pokedex cell overrides (dex → card id). */
  overrides?: Record<number, string>;
  /** Mega forms whose baseDex falls in range — only non-empty when the binder
   * itself shows them (treatMegasAsSeparate on + placement !== "separate"). */
  megasInRange?: MegaForm[];
  treatMegasAsSeparate: boolean;
}

/** Species-based scopes default to the artwork style; everything else to scans. */
export function printDefaultStyle(scopeType: ScopeType): PrintStyle {
  return scopeType === "pokedex" || scopeType === "pokemon" ? "artwork" : "scan";
}

/** Highest-rarity card in a list (ties broken by lower id), mirroring the
 * comparator in `pickDisplayCardId`. Optionally excludes Mega-form cards. */
export function pickHighestRarity(
  cards: CardEntry[],
  excludeMegas = false,
): CardEntry | undefined {
  const eligible = excludeMegas ? cards.filter((c) => !c.megaFormKey) : cards;
  if (eligible.length === 0) return undefined;
  let best = eligible[0]!;
  for (let i = 1; i < eligible.length; i++) {
    const cand = eligible[i]!;
    const candRank = RARITY_ORDER.indexOf(cand.rarity);
    const bestRank = RARITY_ORDER.indexOf(best.rarity);
    if (candRank > bestRank || (candRank === bestRank && cand.id < best.id)) {
      best = cand;
    }
  }
  return best;
}

function speciesPayload(dex: number): SpeciesPayload | undefined {
  const s = SPECIES[dex];
  if (!s) return undefined;
  return {
    dex,
    name: s.name,
    gen: s.generation,
    genus: s.genus,
    heightM: s.heightDm / 10,
    weightKg: s.weightHg / 10,
    types: s.types.map((t) => t.toLowerCase()),
    artworkUrl: s.artworkUrl || officialArtworkUrl(dex),
  };
}

const MEGA_BY_KEY = new Map<string, MegaForm>(MEGAS.map((m) => [m.formKey, m]));

/** Species payload for a Mega/Primal form: its own artwork + display name. We
 * don't have form-specific genus/height/weight/types in the static data, so
 * those are left blank (the artwork placeholder simply renders name + art). */
function megaSpeciesPayload(form: MegaForm): SpeciesPayload {
  return {
    dex: form.baseDex,
    name: form.displayName,
    gen: form.gen,
    genus: "",
    heightM: 0,
    weightKg: 0,
    types: [],
    artworkUrl: officialArtworkUrl(form.artworkId ?? form.baseDex),
  };
}

function cardPayload(c: CardEntry): CardPayload {
  return {
    id: c.id,
    name: c.name,
    setCode: formatSetCode(c.setId),
    number: c.number,
    imageSmall: c.imageSmall,
    imageLarge: c.imageLarge,
    rarityLabel: RARITY_LABEL[c.rarity],
  };
}

/** Representative card for a pokedex slot: the user's owned override / highest
 * owned variant if anything is owned, otherwise the highest-rarity variant in
 * scope regardless of ownership (so unowned slots still get a scan). */
function representativeCard(
  variants: CardEntry[],
  overrideId: string | undefined,
  ownedCardIds: Set<string>,
  excludeMegas: boolean,
): CardEntry | undefined {
  const ownedForDex = variants.filter((c) => ownedCardIds.has(c.id));
  const eligibleOwned = excludeMegas
    ? ownedForDex.filter((c) => !c.megaFormKey)
    : ownedForDex;
  if (overrideId && eligibleOwned.some((c) => c.id === overrideId)) {
    return eligibleOwned.find((c) => c.id === overrideId);
  }
  const owned = pickHighestRarity(ownedForDex, excludeMegas);
  if (owned) return owned;
  return pickHighestRarity(variants, excludeMegas);
}

export function buildPrintItems(a: BuildPrintItemsArgs): PrintItem[] {
  if (a.scopeType === "pokedex" && a.dexRange) {
    const { from, to } = a.dexRange;
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);

    // dex → in-scope variant cards (mirrors BinderDetailClient's variantsByDex).
    const variantsByDex = new Map<number, CardEntry[]>();
    for (const c of a.cards) {
      for (const d of c.dex) {
        if (d < lo || d > hi) continue;
        const arr = variantsByDex.get(d);
        if (arr) arr.push(c);
        else variantsByDex.set(d, [c]);
      }
    }

    const items: PrintItem[] = [];
    for (let dex = lo; dex <= hi; dex++) {
      const variants = variantsByDex.get(dex) ?? [];
      const rep = representativeCard(
        variants,
        a.overrides?.[dex],
        a.ownedCardIds,
        a.treatMegasAsSeparate,
      );
      items.push({
        key: `dex:${dex}`,
        owned: a.ownedSpecies.has(dex),
        species: speciesPayload(dex),
        card: rep ? cardPayload(rep) : undefined,
      });
    }

    // Mega slots, matching the binder's own inclusion rule.
    if (a.treatMegasAsSeparate && a.megasInRange) {
      for (const form of a.megasInRange) {
        const formCards = a.cards.filter((c) => c.megaFormKey === form.formKey);
        const rep = pickHighestRarity(formCards);
        items.push({
          key: `mega:${form.formKey}`,
          owned: a.ownedMegaForms.has(form.formKey),
          species: megaSpeciesPayload(form),
          card: rep ? cardPayload(rep) : undefined,
        });
      }
    }

    return items;
  }

  // Card-list scopes: one item per card, in resolved order.
  return a.cards.map((c) => {
    // A Mega/Primal card resolves to its own form art + name, not the base
    // species (otherwise a Mega Charizard card would show plain Charizard).
    const megaForm = c.megaFormKey ? MEGA_BY_KEY.get(c.megaFormKey) : undefined;
    let species: SpeciesPayload | undefined;
    if (megaForm) {
      species = megaSpeciesPayload(megaForm);
    } else if (c.supertype === "Pokémon" && c.dex.length > 0) {
      species = speciesPayload(c.dex[0]!);
    }
    return {
      key: `card:${c.id}`,
      owned: a.ownedCardIds.has(c.id),
      species,
      card: cardPayload(c),
    };
  });
}

// ── Server helpers: derive owned species / mega forms from owned card ids ──
// Mirror the derivation in OwnedCardsContext so the print route (a server
// component) can compute owned status without the client context.

const CARD_TO_DEX: Record<string, number[]> = (() => {
  const m: Record<string, number[]> = {};
  for (const [dexStr, ids] of Object.entries(CARD_INDEX)) {
    const dex = Number(dexStr);
    for (const id of ids) (m[id] ??= []).push(dex);
  }
  return m;
})();

const CARD_TO_MEGA: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [formKey, ids] of Object.entries(CARD_INDEX_BY_MEGA)) {
    for (const id of ids) m[id] = formKey;
  }
  return m;
})();

export function deriveOwnedSpecies(
  ownedCardIds: Set<string>,
  treatMegasAsSeparate: boolean,
): Set<number> {
  const species = new Set<number>();
  for (const id of ownedCardIds) {
    if (treatMegasAsSeparate && CARD_TO_MEGA[id]) continue;
    const dexes = CARD_TO_DEX[id];
    if (!dexes) continue;
    for (const d of dexes) species.add(d);
  }
  return species;
}

export function deriveOwnedMegaForms(ownedCardIds: Set<string>): Set<string> {
  const forms = new Set<string>();
  for (const id of ownedCardIds) {
    const key = CARD_TO_MEGA[id];
    if (key) forms.add(key);
  }
  return forms;
}

// `genOf` is re-exported for callers that need the generation of a bare dex.
export { genOf };
