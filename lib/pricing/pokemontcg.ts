// Live pricing from the free pokemontcg.io REST API. The static
// `pokemon-tcg-data` GitHub repo we ingest from does not include prices
// (they change daily); the API does. We hit it on-demand and lean on
// Next.js's `fetch` cache for revalidation — no DB table, no cron, no
// static JSON of prices to keep in sync.
//
// Constraint from CLAUDE.md: only free pokemontcg.io is allowed. Never
// the paid Scrydex endpoints.

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

// What we keep for one card after extracting from the API response. Both
// fields may be undefined — the API has uneven coverage, especially for
// non-English releases.
export interface CardPrice {
  tcgplayer?: number;
  cardmarket?: number;
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
    prices?: Record<string, TcgplayerVariantPrice | undefined>;
  };
  cardmarket?: {
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
  try {
    let page = 1;
    while (true) {
      const json = await fetchSetCardsPage(setId, page);
      const rows = json.data ?? [];
      for (const row of rows) {
        const price: CardPrice = {
          tcgplayer: pickTcgplayerPrice(row.tcgplayer?.prices),
          cardmarket: pickCardmarketPrice(row.cardmarket?.prices),
        };
        if (price.tcgplayer != null || price.cardmarket != null) {
          out.set(row.id, price);
        }
      }
      const pageSize = json.pageSize ?? 250;
      const total = json.totalCount ?? rows.length;
      if (page * pageSize >= total) break;
      page += 1;
    }
  } catch (err) {
    console.warn(`[pricing] fetchSetPrices(${setId}) failed:`, err);
  }
  return out;
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

export function formatPrice(value: number | undefined, source: PriceSource): string {
  if (value == null) return "—";
  const currency = PRICE_SOURCE_CURRENCY[source];
  // Compact for large totals, full for individual cards. Callers can pass
  // through formatPriceCompact instead when they want the K/M suffix.
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

export function formatPriceCompact(value: number | undefined, source: PriceSource): string {
  if (value == null) return "—";
  const currency = PRICE_SOURCE_CURRENCY[source];
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}
