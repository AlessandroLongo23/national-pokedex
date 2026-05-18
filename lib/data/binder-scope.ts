import { SETS, loadSetCards } from ".";
import type { CardEntry } from "./types";

export type ScopeType =
  | "master_set"
  | "pokemon"
  | "artist"
  | "type"
  | "position"
  | "custom"
  | "pokedex";

export type ScopeParams =
  | { setId: string }
  | { dex: number }
  | { artist: string }
  | { type: string }
  | { number: string }
  | { dexFrom: number; dexTo: number }
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
  }
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
