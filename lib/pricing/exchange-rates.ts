// Frankfurter (api.frankfurter.dev) wrapper for FX rates. Same provider
// used by the sibling FinTrack app — ECB-published, no API key, no
// per-day quota worth worrying about for a single-user tracker.
//
// All rates are expressed against EUR (the API's default base):
//   ratesFromEur[X] = how many X you get for 1 EUR
//
// Storage convention used elsewhere in the codebase:
//   rate_to_eur[X] = how many EUR 1 X is worth on the transaction date
// which is just `1 / ratesFromEur[X]`. We snapshot rate_to_eur at write
// time so historical ledger rows stay valued at the rate that was true
// when the user actually paid — see the migration / pack-actions /
// transaction-actions for where the snapshot is taken.
//
// We don't keep a local rate cache table; Next.js's fetch cache handles
// it (24h for the latest rates, effectively forever for historical
// dates, since dated rates are immutable).

import { isCurrency, type Currency } from "./currencies";

const API_BASE = "https://api.frankfurter.dev/v1";
const LATEST_REVALIDATE = 60 * 60 * 24; // 24h
const HISTORICAL_REVALIDATE = 60 * 60 * 24 * 365; // 1y; dated rates don't change

interface FrankfurterResponse {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

// Maps Frankfurter's response into a Record<Currency, number> trimmed
// to the codes we support. EUR is added explicitly (the API doesn't
// include the base in `rates`).
function normalize(json: FrankfurterResponse): Record<Currency, number> {
  const out: Partial<Record<Currency, number>> = { EUR: 1 };
  const rates = json.rates ?? {};
  for (const [code, value] of Object.entries(rates)) {
    if (isCurrency(code) && typeof value === "number" && value > 0) {
      out[code] = value;
    }
  }
  return out as Record<Currency, number>;
}

// "What's 1 EUR worth in every currency, today?"
// Cached for 24h. Returns an empty-ish object if the API is unreachable
// so callers can degrade gracefully (display falls back to "—" for
// missing rates, never throws).
export async function getLatestRatesFromEur(): Promise<Record<Currency, number>> {
  try {
    const res = await fetch(`${API_BASE}/latest?base=EUR`, {
      next: { revalidate: LATEST_REVALIDATE, tags: ["fx:latest"] },
    });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const json = (await res.json()) as FrankfurterResponse;
    return normalize(json);
  } catch (err) {
    console.warn("[fx] getLatestRatesFromEur failed:", err);
    return { EUR: 1 } as Record<Currency, number>;
  }
}

// Historical lookup for the backfill script and any future feature that
// needs as-of pricing. `date` is YYYY-MM-DD; Frankfurter falls back to
// the most recent business day if the date is a weekend/holiday.
export async function getRatesFromEurOn(
  date: string,
): Promise<Record<Currency, number>> {
  try {
    const res = await fetch(`${API_BASE}/${date}?base=EUR`, {
      next: { revalidate: HISTORICAL_REVALIDATE, tags: [`fx:${date}`] },
    });
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const json = (await res.json()) as FrankfurterResponse;
    return normalize(json);
  } catch (err) {
    console.warn(`[fx] getRatesFromEurOn(${date}) failed:`, err);
    return { EUR: 1 } as Record<Currency, number>;
  }
}

// Single-day, single-currency lookup. Returns the snapshot we'd store
// in transactions.rate_to_eur / packs_opened.rate_to_eur — i.e. EUR
// per unit of `currency` on `date`.
export async function getRateToEurOn(
  currency: Currency,
  date: string,
): Promise<number | null> {
  if (currency === "EUR") return 1;
  const rates = await getRatesFromEurOn(date);
  const r = rates[currency];
  return r && r > 0 ? 1 / r : null;
}

// Convenience for the write-path: today's snapshot, EUR-per-unit, for
// one currency.
export async function getRateToEurToday(currency: Currency): Promise<number | null> {
  if (currency === "EUR") return 1;
  const rates = await getLatestRatesFromEur();
  const r = rates[currency];
  return r && r > 0 ? 1 / r : null;
}

// Convert an integer-cent amount from one currency to another.
//
// `snapshotRateToEur` is the row's stored rate_to_eur — EUR per unit of
// `from` on the day the transaction was logged. If missing (legacy
// rows pre-snapshot, or the API was down when the row was written), we
// fall back to today's rate via `latestRatesFromEur` and mark the
// result as approximate in the UI.
//
// Returns null if we can't compute (target rate missing).
export function convertCents(
  cents: number,
  from: Currency,
  to: Currency,
  snapshotRateToEur: number | null,
  latestRatesFromEur: Record<Currency, number>,
): number | null {
  if (from === to) return cents;
  const rateToEur =
    snapshotRateToEur ??
    (from === "EUR" ? 1 : invertOrNull(latestRatesFromEur[from]));
  if (rateToEur == null) return null;
  if (to === "EUR") return Math.round(cents * rateToEur);
  const rateFromEur = latestRatesFromEur[to];
  if (!rateFromEur) return null;
  return Math.round(cents * rateToEur * rateFromEur);
}

function invertOrNull(value: number | undefined): number | null {
  return value && value > 0 ? 1 / value : null;
}
