/**
 * Build a mapping from pokemontcg.io identifiers to TCGplayer identifiers
 * via tcgcsv.com (a free daily CSV/JSON mirror of TCGplayer's prices feed).
 *
 * Why: pokemontcg.io's nightly price snapshot can lag for days on brand-new
 * sets — the cards show up with a `tcgplayer.url` but no `tcgplayer.prices`
 * block. tcgcsv mirrors TCGplayer's own feed directly, so prices are there
 * within a day of TCGplayer listing the product. At runtime we use this
 * map to fill in TCGplayer prices that pokemontcg.io is missing.
 *
 * Approach:
 *   1. Fetch all groups (= TCGplayer sets) from tcgcsv.
 *   2. Auto-match pokemontcg.io setIds by normalized name, with a small
 *      manual override map for the few cases where the names diverge.
 *   3. For each matched set, fetch its products and key them by the card
 *      number embedded in `extendedData[Number]` ("042/086" → "42").
 *
 * Run standalone: `npx tsx scripts/ingest/fetchTcgCsv.ts`
 * Or import `fetchTcgCsvMap()` from this module (used by the ingest entrypoint).
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { SetInfo, TcgCsvMap } from "@/lib/data/types";

const API = "https://tcgcsv.com/tcgplayer/3";
const USER_AGENT = "national-pokedex/0.1 (https://github.com/local; longoa02@gmail.com)";
// Bulbagarden's per-request etiquette is roughly 4/s; tcgcsv is a static
// edge cache so it's fine to go faster, but no need.
const REQUEST_GAP_MS = 100;

// pokemontcg.io setIds whose names don't normalize to any tcgcsv group name.
// Both are real divergences in how the two sources label these sets:
//   - "Scarlet & Violet Black Star Promos" (pokemontcg.io) vs
//     "SV: Scarlet & Violet Promo Cards" (tcgcsv)
//   - "151" (pokemontcg.io) vs "SV: Scarlet & Violet 151" (tcgcsv)
const MANUAL_GROUP_OVERRIDES: Record<string, number> = {
  svp: 22872,
  sv3pt5: 23237,
};

interface TcGroup {
  groupId: number;
  name: string;
  abbreviation: string;
}

interface TcProduct {
  productId: number;
  name: string;
  extendedData?: { name: string; value: string }[];
}

interface TcResp<T> {
  results: T[];
}

function normalizeSetName(s: string): string {
  return s
    .toLowerCase()
    // Strip leading "ME04: ", "SV01: ", "SWSH: ", "SV: " etc.
    .replace(/^[a-z]+\d*(?:pt\d+)?\s*:\s*/i, "")
    // tcgcsv calls the first SV set "Scarlet & Violet Base Set"; pokemontcg
    // just calls it "Scarlet & Violet".
    .replace(/\s+base set$/, "")
    .replace(/&/g, "and")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return (await res.json()) as T;
}

// Pull the card number out of a tcgcsv product's extendedData. The Number
// field uses "042/086" formatting (zero-padded, with the printed total);
// pokemontcg.io strips leading zeros in its card IDs.
function extractCardNumber(p: TcProduct): string | null {
  for (const ed of p.extendedData ?? []) {
    if (ed.name === "Number") {
      const m = ed.value.match(/^(\d+)/);
      if (m && m[1]) return String(parseInt(m[1], 10));
      // Some promos use alphanumeric numbers ("SWSH001"). Fall through.
      return ed.value.split("/")[0]?.trim() ?? null;
    }
  }
  return null;
}

export async function fetchTcgCsvMap(
  sets: SetInfo[],
  opts: { log?: boolean } = {},
): Promise<TcgCsvMap> {
  const log = opts.log ?? false;
  const groupsResp = await fetchJson<TcResp<TcGroup>>(`${API}/groups`);
  const byNorm = new Map<string, TcGroup>();
  for (const g of groupsResp.results) byNorm.set(normalizeSetName(g.name), g);

  const groups: Record<string, number> = {};
  const products: Record<string, number> = {};

  let matchedSets = 0;
  let unmatchedSets = 0;
  let totalCardsMapped = 0;

  for (const s of sets) {
    let groupId: number | undefined = MANUAL_GROUP_OVERRIDES[s.id];
    if (!groupId) {
      const g = byNorm.get(normalizeSetName(s.name));
      if (g) groupId = g.groupId;
    }
    if (!groupId) {
      unmatchedSets++;
      continue;
    }
    groups[s.id] = groupId;
    matchedSets++;

    let productsResp: TcResp<TcProduct>;
    try {
      productsResp = await fetchJson<TcResp<TcProduct>>(`${API}/${groupId}/products`);
    } catch (err) {
      if (log) console.warn(`[tcgcsv] products fetch failed for ${s.id} → ${groupId}: ${(err as Error).message}`);
      continue;
    }

    let mapped = 0;
    for (const p of productsResp.results) {
      const num = extractCardNumber(p);
      if (!num) continue;
      products[`${s.id}-${num}`] = p.productId;
      mapped++;
    }
    totalCardsMapped += mapped;
    if (log) console.log(`[tcgcsv] ${s.id.padEnd(10)} → group ${String(groupId).padEnd(6)} (${mapped} cards)`);
    await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
  }

  if (log) {
    console.log(`[tcgcsv] matched ${matchedSets} sets (${unmatchedSets} unmatched), ${totalCardsMapped} cards mapped`);
  }
  return { groups, products };
}

const isMain = (() => {
  try {
    const argv1 = process.argv[1];
    if (!argv1) return false;
    return import.meta.url === new URL(`file://${argv1}`).href;
  } catch {
    return false;
  }
})();

if (isMain) {
  (async () => {
    const setsPath = path.resolve(process.cwd(), "lib", "data", "sets.json");
    const { readFile } = await import("node:fs/promises");
    const sets = JSON.parse(await readFile(setsPath, "utf8")) as SetInfo[];
    const map = await fetchTcgCsvMap(sets, { log: true });
    const outPath = path.resolve(process.cwd(), "lib", "data", "tcgcsvMap.json");
    await writeFile(outPath, JSON.stringify(map, null, 2) + "\n", "utf8");
    console.log(`Wrote ${outPath}`);
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
