import { SETS, loadSetCards } from ".";
import { OTHER_SUBTYPE_PREDICATES } from "./other-subtypes";
import { RARITY_ORDER, type CardEntry } from "./types";

export type ScopeType =
  | "master_set"
  | "pokemon"
  | "artist"
  | "type"
  | "position"
  | "custom"
  | "pokedex"
  | "subtype"
  | "named_card";

export type SubtypeScopeValue =
  | "trainers"
  | "items"
  | "supporters"
  | "stadiums"
  | "tools"
  | "energies";

export const SUBTYPE_SCOPE_VALUES: readonly SubtypeScopeValue[] = [
  "trainers",
  "items",
  "supporters",
  "stadiums",
  "tools",
  "energies",
] as const;

export const SUBTYPE_SCOPE_LABEL: Record<SubtypeScopeValue, string> = {
  trainers: "All Trainers",
  items: "Items",
  supporters: "Supporters",
  stadiums: "Stadiums",
  tools: "Pokémon Tools",
  energies: "Energies",
};

export type ScopeParams =
  | { setId: string }
  | { dex: number }
  | { artist: string }
  | { type: string }
  | { number: string }
  | { dexFrom: number; dexTo: number }
  | { subtype: SubtypeScopeValue }
  | { name: string }
  | Record<string, never>;

// Pure filter — exported for unit tests and for callers that already have the
// full card list in memory. Returns [] for "custom" (callers must hydrate
// from binder_cards separately via filterCardsByIds).
export function filterByScope(
  cards: CardEntry[],
  scopeType: ScopeType,
  scopeParams: ScopeParams,
): CardEntry[] {
  if (scopeType === "custom") return [];
  switch (scopeType) {
    case "master_set": {
      const { setId } = scopeParams as { setId: string };
      return cards.filter((c) => c.setId === setId);
    }
    case "pokemon": {
      const { dex } = scopeParams as { dex: number };
      return cards.filter((c) => c.dex.includes(dex));
    }
    case "artist": {
      const { artist } = scopeParams as { artist: string };
      return cards.filter((c) => c.artist === artist);
    }
    case "type": {
      const { type } = scopeParams as { type: string };
      return cards.filter((c) => c.types.includes(type));
    }
    case "position": {
      const { number } = scopeParams as { number: string };
      return cards.filter((c) => c.number === number);
    }
    case "pokedex": {
      const { dexFrom, dexTo } = scopeParams as { dexFrom: number; dexTo: number };
      const lo = Math.min(dexFrom, dexTo);
      const hi = Math.max(dexFrom, dexTo);
      return cards.filter((c) => c.dex.some((d) => d >= lo && d <= hi));
    }
    case "subtype": {
      const { subtype } = scopeParams as { subtype: SubtypeScopeValue };
      if (subtype === "trainers") return cards.filter((c) => c.supertype === "Trainer");
      const predicate = OTHER_SUBTYPE_PREDICATES[subtype];
      return cards.filter(predicate);
    }
    case "named_card": {
      const { name } = scopeParams as { name: string };
      return cards.filter((c) => c.name === name);
    }
  }
}

/** For a pokedex-scope binder cell: pick which owned card's art to show.
 * Returns the override if it's still owned, otherwise the highest-rarity
 * owned card (tie-broken by id), otherwise null when nothing is owned.
 * `ownedCardsForDex` is the pre-filtered list of cards the user owns that
 * include this dex# in their `dex` array.
 */
export function pickDisplayCardId(
  overrideCardId: string | undefined,
  ownedCardsForDex: CardEntry[],
): string | null {
  if (overrideCardId && ownedCardsForDex.some((c) => c.id === overrideCardId)) {
    return overrideCardId;
  }
  if (ownedCardsForDex.length === 0) return null;
  let best = ownedCardsForDex[0]!;
  for (let i = 1; i < ownedCardsForDex.length; i++) {
    const cand = ownedCardsForDex[i]!;
    const candRank = RARITY_ORDER.indexOf(cand.rarity);
    const bestRank = RARITY_ORDER.indexOf(best.rarity);
    // Lower index in RARITY_ORDER = lower rarity, so HIGHER index wins.
    // Promo/Unknown are last in the order, so they're treated as low-rarity
    // — fine as a tiebreaker default.
    if (candRank > bestRank || (candRank === bestRank && cand.id < best.id)) {
      best = cand;
    }
  }
  return best.id;
}

/** Group cards in a range by dex#, filtered to those the user owns. */
export function ownedCardsByDex(
  cards: CardEntry[],
  ownedCardIds: Set<string>,
): Map<number, CardEntry[]> {
  const m = new Map<number, CardEntry[]>();
  for (const c of cards) {
    if (!ownedCardIds.has(c.id)) continue;
    for (const d of c.dex) {
      const arr = m.get(d);
      if (arr) arr.push(c);
      else m.set(d, [c]);
    }
  }
  return m;
}

/** Build the species-coverage view for a pokedex-scope binder.
 * Returns the ordered list of dex numbers in the range plus the subset
 * covered by ownership (a species is covered if any of its cards is owned).
 */
export function pokedexCoverage(
  range: { dexFrom: number; dexTo: number },
  ownedCardIds: Set<string>,
  cards: CardEntry[],
): { dexNumbers: number[]; covered: Set<number> } {
  const lo = Math.min(range.dexFrom, range.dexTo);
  const hi = Math.max(range.dexFrom, range.dexTo);
  const dexNumbers: number[] = [];
  for (let d = lo; d <= hi; d++) dexNumbers.push(d);

  const covered = new Set<number>();
  for (const c of cards) {
    if (!ownedCardIds.has(c.id)) continue;
    for (const d of c.dex) {
      if (d >= lo && d <= hi) covered.add(d);
    }
  }
  return { dexNumbers, covered };
}

export function filterCardsByIds(
  cards: CardEntry[],
  cardIds: string[],
): CardEntry[] {
  if (cardIds.length === 0) return [];
  const want = new Set(cardIds);
  return cards.filter((c) => want.has(c.id));
}

export function distinctArtists(cards: CardEntry[]): string[] {
  const seen = new Set<string>();
  for (const c of cards) {
    if (c.artist && c.artist.length > 0) seen.add(c.artist);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// Trainer/Energy card names for the named_card scope picker. Pokémon names
// belong to the existing `pokemon` (by dex) scope so they're excluded here.
export function distinctNonPokemonNames(cards: CardEntry[]): string[] {
  const seen = new Set<string>();
  for (const c of cards) {
    if (c.supertype === "Pokémon") continue;
    if (c.name.length > 0) seen.add(c.name);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// I/O wrappers. Lazily load every set's cards once per server process; ~171
// JSON files / ~8MB total. Concurrent callers share one in-flight promise.
let _allCards: CardEntry[] | null = null;
let _loadingPromise: Promise<CardEntry[]> | null = null;

export async function getAllCards(): Promise<CardEntry[]> {
  if (_allCards) return _allCards;
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    const chunks = await Promise.all(
      SETS.map((s) => loadSetCards(s.id).catch(() => [] as CardEntry[])),
    );
    _allCards = chunks.flat();
    _loadingPromise = null;
    return _allCards;
  })();
  return _loadingPromise;
}

export async function resolveBinderScope(
  scopeType: ScopeType,
  scopeParams: ScopeParams,
): Promise<CardEntry[]> {
  if (scopeType === "custom") return [];
  return filterByScope(await getAllCards(), scopeType, scopeParams);
}

export async function resolveCustom(cardIds: string[]): Promise<CardEntry[]> {
  if (cardIds.length === 0) return [];
  return filterCardsByIds(await getAllCards(), cardIds);
}

export async function listArtists(): Promise<string[]> {
  return distinctArtists(await getAllCards());
}

export async function listNonPokemonNames(): Promise<string[]> {
  return distinctNonPokemonNames(await getAllCards());
}
