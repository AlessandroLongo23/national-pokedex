import { SET_POOLS, SETS } from "@/lib/data";
import type { SetInfo, SetRarityPool } from "@/lib/data/types";
import { slotsForSeries } from "./pack-structure";
import { simulateSet, type SimulationResult } from "./simulator";

export interface RankedSet extends SimulationResult {
  set: SetInfo;
  unownedInSet: number;
}

export interface RankOptions {
  iterations?: number;
  // When provided, only sets whose id is in this set will be ranked.
  filter?: Set<string>;
}

let cacheKey = "";
let cached: RankedSet[] = [];

function keyFor(owned: Set<number>): string {
  const arr = [...owned].sort((a, b) => a - b);
  return `${arr.length}:${arr.join(",")}`;
}

function filterKey(filter: Set<string> | undefined): string {
  if (!filter) return "*";
  return [...filter].sort().join(",");
}

// Promo / energy box sets don't follow the standard booster slot layout —
// their cards are stamped "Promo" rather than C/U/R, so the rarity pools we
// rely on are effectively empty. Exclude them from the leaderboard rather
// than showing a misleading 0.00 expected-new row.
function hasOpenablePack(pool: SetRarityPool | undefined): boolean {
  if (!pool) return false;
  return pool.Common.length > 0 && pool.Uncommon.length > 0;
}

export function rankSets(owned: Set<number>, opts: RankOptions = {}): RankedSet[] {
  const iterations = opts.iterations ?? 5000;
  const key = `${iterations}|${filterKey(opts.filter)}|${keyFor(owned)}`;
  if (key === cacheKey) return cached;

  const ranked: RankedSet[] = [];
  for (const set of SETS) {
    if (opts.filter && !opts.filter.has(set.id)) continue;
    const pool = SET_POOLS[set.id];
    if (!pool || !hasOpenablePack(pool)) continue;
    const slots = slotsForSeries(set.series);
    const sim = simulateSet(set.id, pool, slots, owned, iterations);
    let unownedInSet = 0;
    for (const d of set.dexNumbers) if (!owned.has(d)) unownedInSet++;
    ranked.push({ set, ...sim, unownedInSet });
  }

  ranked.sort((a, b) => {
    if (b.expectedNew !== a.expectedNew) return b.expectedNew - a.expectedNew;
    if (b.unownedInSet !== a.unownedInSet) return b.unownedInSet - a.unownedInSet;
    return b.set.releaseDate.localeCompare(a.set.releaseDate);
  });

  cacheKey = key;
  cached = ranked;
  return ranked;
}
