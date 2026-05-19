import type { CardPrice, PriceSource } from "@/lib/pricing/pokemontcg";
import { pickPrice } from "@/lib/pricing/pokemontcg";

export interface ValueAcquisitionRow {
  card_id: string;
  acquired_at: string;
  /** Copies of this card. Defaults to 1; pass the row's `owned_cards.quantity`
   * to value duplicates correctly. */
  quantity?: number;
}

export interface ValuePoint {
  date: string;
  value: number;
}

function toUtcDay(iso: string): string {
  return iso.slice(0, 10);
}

function addOneUtcDay(yyyymmdd: string): string {
  const d = new Date(`${yyyymmdd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// For each calendar day from first acquisition to the most recent, the
// running total of (today's) prices of cards owned by the end of that
// day. Unpriced cards contribute zero.
export function cumulativeValueByDay(
  rows: ValueAcquisitionRow[],
  prices: Map<string, CardPrice>,
  source: PriceSource,
): ValuePoint[] {
  if (rows.length === 0) return [];

  const perDay = new Map<string, number>();
  for (const r of rows) {
    const v = pickPrice(prices.get(r.card_id), source);
    if (v == null) continue;
    const qty = r.quantity ?? 1;
    const day = toUtcDay(r.acquired_at);
    perDay.set(day, (perDay.get(day) ?? 0) + v * qty);
  }
  if (perDay.size === 0) return [];

  const days = [...perDay.keys()].sort();
  const first = days[0]!;
  const last = days[days.length - 1]!;

  const out: ValuePoint[] = [];
  let running = 0;
  let cursor = first;
  while (true) {
    running += perDay.get(cursor) ?? 0;
    out.push({ date: cursor, value: Math.round(running * 100) / 100 });
    if (cursor === last) break;
    cursor = addOneUtcDay(cursor);
  }
  return out;
}
