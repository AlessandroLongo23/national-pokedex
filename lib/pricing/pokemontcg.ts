// Live pricing from the free pokemontcg.io REST API. The static
// `pokemon-tcg-data` GitHub repo we ingest from does not include prices
// (they change daily); the API does. We hit it on-demand and lean on
// Next.js's `fetch` cache for revalidation — no DB table, no cron, no
// static JSON of prices to keep in sync.
//
// For TCGplayer (USD), we additionally fall back to tcgcsv.com when
// pokemontcg.io's snapshot is missing a card (typical on new-set release
// days). See lib/pricing/tcgcsv.ts.
//
// Constraint from CLAUDE.md: only free sources allowed. Never the paid
// Scrydex endpoints.

import type { Currency } from "./currencies";
import { convertCents } from "./exchange-rates";
import { fetchSetTcgplayerFallback } from "./tcgcsv";

const API_BASE = "https://api.pokemontcg.io/v2";
// 24h: prices move daily but not minute-by-minute; this is well below the
// free tier's 1000 req/day no-key limit even if the cache misses on every
// set we render.
const REVALIDATE_SECONDS = 60 * 60 * 24;

export type PriceSource = "tcgplayer" | "cardmarket";

export const PRICE_SOURCES: readonly PriceSource[] = ["tcgplayer", "cardmarket"];

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  tcgplayer: "TCGplayer (USD)",
  cardmarket: "Cardmarket (EUR)",
};

export const PRICE_SOURCE_CURRENCY: Record<PriceSource, "USD" | "EUR"> = {
  tcgplayer: "USD",
  cardmarket: "EUR",
};

// What we keep for one card after extracting from the API response. Every
// field may be undefined — the API has uneven coverage, especially for
// non-English releases.
export interface CardPrice {
  tcgplayer?: number;
  cardmarket?: number;
  tcgplayerUrl?: string;
  cardmarketUrl?: string;
}

interface TcgplayerVariantPrice {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
}

interface CardmarketPrices {
  averageSellPrice?: number | null;
  lowPrice?: number | null;
  trendPrice?: number | null;
  avg30?: number | null;
}

interface ApiCard {
  id: string;
  tcgplayer?: {
    url?: string | null;
    prices?: Record<string, TcgplayerVariantPrice | undefined>;
  };
  cardmarket?: {
    url?: string | null;
    prices?: CardmarketPrices;
  };
}

interface ApiResponse {
  data?: ApiCard[];
  totalCount?: number;
  page?: number;
  pageSize?: number;
}

// TCGplayer returns several variant rows per card (holofoil, normal,
// reverseHolofoil, 1stEditionHolofoil, …). We collapse to one number per
// card by preferring the foil rows first, since the rare/chase variant is
// what people generally mean by "the price of card X".
const TCGPLAYER_VARIANT_ORDER = [
  "holofoil",
  "reverseHolofoil",
  "normal",
  "1stEditionHolofoil",
  "1stEditionNormal",
  "unlimitedHolofoil",
  "unlimited",
];

function pickTcgplayerPrice(prices: Record<string, TcgplayerVariantPrice | undefined> | undefined): number | undefined {
  if (!prices) return undefined;
  for (const variant of TCGPLAYER_VARIANT_ORDER) {
    const row = prices[variant];
    if (!row) continue;
    const v = row.market ?? row.mid ?? row.low;
    if (typeof v === "number" && v > 0) return v;
  }
  // Fallback: any variant we didn't enumerate.
  for (const row of Object.values(prices)) {
    if (!row) continue;
    const v = row.market ?? row.mid ?? row.low;
    if (typeof v === "number" && v > 0) return v;
  }
  return undefined;
}

function pickCardmarketPrice(prices: CardmarketPrices | undefined): number | undefined {
  if (!prices) return undefined;
  const v = prices.trendPrice ?? prices.averageSellPrice ?? prices.avg30 ?? prices.lowPrice;
  return typeof v === "number" && v > 0 ? v : undefined;
}

function apiHeaders(): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  // Optional — the unauthenticated tier (1000 req/day) is enough for our
  // cached usage. With a key it bumps to 20k/day.
  const key = process.env.POKEMONTCG_API_KEY;
  if (key) headers["X-Api-Key"] = key;
  return headers;
}

async function fetchSetCardsPage(setId: string, page: number): Promise<ApiResponse> {
  const q = encodeURIComponent(`set.id:${setId}`);
  // `select` keeps the payload small — we only want id + price blocks.
  const url = `${API_BASE}/cards?q=${q}&page=${page}&pageSize=250&select=id,tcgplayer,cardmarket`;
  const res = await fetch(url, {
    headers: apiHeaders(),
    next: { revalidate: REVALIDATE_SECONDS, tags: [`prices:${setId}`] },
  });
  if (!res.ok) {
    throw new Error(`pokemontcg.io ${res.status} for set ${setId}`);
  }
  return (await res.json()) as ApiResponse;
}

// Fetch every card in a set and return id -> { tcgplayer?, cardmarket? }.
// Network failures and rate limits resolve to an empty map so the UI
// degrades gracefully (a missing price is rendered as a dash, not as a
// page crash).
export async function fetchSetPrices(setId: string): Promise<Map<string, CardPrice>> {
  const out = new Map<string, CardPrice>();
  let pokemonTcgFailed = false;
  let cardsReturned = 0;
  let cardsMissingTcgplayer = 0;
  try {
    let page = 1;
    while (true) {
      const json = await fetchSetCardsPage(setId, page);
      const rows = json.data ?? [];
      for (const row of rows) {
        cardsReturned += 1;
        const tcgplayer = pickTcgplayerPrice(row.tcgplayer?.prices);
        if (tcgplayer == null) cardsMissingTcgplayer += 1;
        const price: CardPrice = {
          tcgplayer,
          cardmarket: pickCardmarketPrice(row.cardmarket?.prices),
          tcgplayerUrl: row.tcgplayer?.url ?? undefined,
          cardmarketUrl: row.cardmarket?.url ?? undefined,
        };
        if (
          price.tcgplayer != null ||
          price.cardmarket != null ||
          price.tcgplayerUrl != null ||
          price.cardmarketUrl != null
        ) {
          out.set(row.id, price);
        }
      }
      const pageSize = json.pageSize ?? 250;
      const total = json.totalCount ?? rows.length;
      if (page * pageSize >= total) break;
      page += 1;
    }
  } catch (err) {
    pokemonTcgFailed = true;
    console.warn(`[pricing] fetchSetPrices(${setId}) failed:`, err);
  }

  // Only pay the tcgcsv round-trip when there's actually a gap to fill —
  // pokemontcg.io fully covers most established sets, and an unconditional
  // second fetch per set was doubling the latency of binder/wishlist pages.
  const needsFallback = pokemonTcgFailed || cardsReturned === 0 || cardsMissingTcgplayer > 0;
  if (needsFallback) {
    const fallback = await fetchSetTcgplayerFallback(setId);
    if (fallback.size > 0) {
      for (const [cardId, tcgplayer] of fallback) {
        const existing = out.get(cardId);
        if (!existing) {
          out.set(cardId, { tcgplayer });
        } else if (existing.tcgplayer == null) {
          out.set(cardId, { ...existing, tcgplayer });
        }
      }
    }
  }

  return out;
}

// Single-card lookup — used by the card-detail page so it doesn't have to
// pull the entire set's prices (up to ~250 cards paginated) just to render
// one number. Falls back to tcgcsv only when pokemontcg.io has no
// tcgplayer price for the card.
export async function fetchSingleCardPrice(cardId: string): Promise<CardPrice | undefined> {
  const url = `${API_BASE}/cards/${encodeURIComponent(cardId)}?select=id,tcgplayer,cardmarket`;
  let price: CardPrice | undefined;
  try {
    const res = await fetch(url, {
      headers: apiHeaders(),
      next: { revalidate: REVALIDATE_SECONDS, tags: [`card-price:${cardId}`] },
    });
    if (res.ok) {
      const json = (await res.json()) as { data?: ApiCard };
      const row = json.data;
      if (row) {
        price = {
          tcgplayer: pickTcgplayerPrice(row.tcgplayer?.prices),
          cardmarket: pickCardmarketPrice(row.cardmarket?.prices),
          tcgplayerUrl: row.tcgplayer?.url ?? undefined,
          cardmarketUrl: row.cardmarket?.url ?? undefined,
        };
      }
    }
  } catch (err) {
    console.warn(`[pricing] fetchSingleCardPrice(${cardId}) failed:`, err);
  }

  if (price?.tcgplayer != null) return price;

  // Gap-fill from tcgcsv. Cheaper than fetching the whole set's pokemontcg
  // page just because one card was missing a price.
  const setId = setIdOf(cardId);
  if (!setId) return price;
  const fallback = await fetchSetTcgplayerFallback(setId);
  const tcgplayer = fallback.get(cardId);
  if (tcgplayer == null) return price;
  return price ? { ...price, tcgplayer } : { tcgplayer };
}

// Card IDs follow `${setId}-${number}` — extract setId by splitting on the
// first dash. Avoids a catalog lookup in the hot path.
function setIdOf(cardId: string): string | null {
  const i = cardId.indexOf("-");
  return i === -1 ? null : cardId.slice(0, i);
}

// Batch lookup for an arbitrary set of card IDs. Fetches each distinct set
// in parallel, then merges. The result only contains cards the API knows
// about — missing IDs are simply absent from the map.
export async function fetchPricesForCards(cardIds: Iterable<string>): Promise<Map<string, CardPrice>> {
  const bySet = new Map<string, string[]>();
  for (const id of cardIds) {
    const setId = setIdOf(id);
    if (!setId) continue;
    const list = bySet.get(setId);
    if (list) list.push(id);
    else bySet.set(setId, [id]);
  }
  if (bySet.size === 0) return new Map();
  const setMaps = await Promise.all(
    [...bySet.keys()].map((setId) => fetchSetPrices(setId)),
  );
  const merged = new Map<string, CardPrice>();
  let i = 0;
  for (const [, ids] of bySet) {
    const setMap = setMaps[i++]!;
    for (const id of ids) {
      const p = setMap.get(id);
      if (p) merged.set(id, p);
    }
  }
  return merged;
}

// Resolve one card's CardPrice into a single number for the chosen source.
export function pickPrice(price: CardPrice | undefined, source: PriceSource): number | undefined {
  if (!price) return undefined;
  return source === "tcgplayer" ? price.tcgplayer : price.cardmarket;
}

// Resolve one card's CardPrice into the marketplace product URL for the
// chosen source, if pokemontcg.io returned one.
export function pickUrl(price: CardPrice | undefined, source: PriceSource): string | undefined {
  if (!price) return undefined;
  return source === "tcgplayer" ? price.tcgplayerUrl : price.cardmarketUrl;
}

// Sum the chosen source's price across a set of owned card IDs. Cards
// without a price are skipped — the caller can compare `coveredCount`
// against the input length to surface "X of Y cards priced".
export function sumPrices(
  priceMap: Map<string, CardPrice>,
  cardIds: Iterable<string>,
  source: PriceSource,
): { total: number; coveredCount: number } {
  let total = 0;
  let coveredCount = 0;
  for (const id of cardIds) {
    const v = pickPrice(priceMap.get(id), source);
    if (v != null) {
      total += v;
      coveredCount += 1;
    }
  }
  return { total, coveredCount };
}

// Quantity-aware sum: multiplies each card's price by its qty. The
// `coveredCount` still counts distinct priced cards (not copies) — that
// matches the "X of Y cards priced" UX, which is about coverage gaps.
export function sumPricesByQuantity(
  priceMap: Map<string, CardPrice>,
  quantities: Iterable<[string, number]>,
  source: PriceSource,
): { total: number; coveredCount: number } {
  let total = 0;
  let coveredCount = 0;
  for (const [id, qty] of quantities) {
    const v = pickPrice(priceMap.get(id), source);
    if (v != null) {
      total += v * qty;
      coveredCount += 1;
    }
  }
  return { total, coveredCount };
}

// Optional conversion to the user's display currency. When the caller
// passes a `display` block, we convert the value out of the source's
// native currency at today's rate before formatting. No tooltip — these
// helpers are used in tight spots (card tiles, KPI numbers, charts)
// where there's no room for a hover affordance. For places that need
// the "Original: $X.XX, rate Y" tooltip, render <MoneyDisplay/> instead.
export interface DisplayConversion {
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
}

function convertForDisplay(
  value: number,
  source: PriceSource,
  display: DisplayConversion | undefined,
): { value: number; currency: Currency } {
  const nativeCurrency = PRICE_SOURCE_CURRENCY[source];
  if (!display || display.displayCurrency === nativeCurrency) {
    return { value, currency: nativeCurrency };
  }
  const cents = Math.round(value * 100);
  const convertedCents = convertCents(
    cents,
    nativeCurrency,
    display.displayCurrency,
    // Live market prices have no snapshot — convert at today's rate.
    nativeCurrency === "EUR"
      ? 1
      : 1 / (display.latestRatesFromEur[nativeCurrency] ?? 1),
    display.latestRatesFromEur,
  );
  if (convertedCents == null) return { value, currency: nativeCurrency };
  return { value: convertedCents / 100, currency: display.displayCurrency };
}

export function formatPrice(
  value: number | undefined,
  source: PriceSource,
  display?: DisplayConversion,
): string {
  if (value == null) return "—";
  const { value: v, currency } = convertForDisplay(value, source, display);
  // Compact for large totals, full for individual cards. Callers can pass
  // through formatPriceCompact instead when they want the K/M suffix.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: v >= 100 ? 0 : 2,
  }).format(v);
}

export function formatPriceCompact(
  value: number | undefined,
  source: PriceSource,
  display?: DisplayConversion,
): string {
  if (value == null) return "—";
  const { value: v, currency } = convertForDisplay(value, source, display);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: v >= 10000 ? "compact" : "standard",
    maximumFractionDigits: v >= 100 ? 0 : 2,
  }).format(v);
}
