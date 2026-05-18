import type { Coverage, Generation, PokedexEntry, SetInfo } from "@/lib/data/types";

export function computeCoverage(pokedex: PokedexEntry[], sets: SetInfo[]): Coverage {
  const all = new Set<number>();
  for (const s of sets) {
    for (const n of s.dexNumbers) all.add(n);
  }

  const byGen = {} as Record<Generation, { covered: number; total: number }>;
  for (const g of [1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[]) {
    byGen[g] = { covered: 0, total: 0 };
  }
  for (const p of pokedex) {
    byGen[p.gen].total++;
    if (all.has(p.dex)) byGen[p.gen].covered++;
  }

  const missingDex = pokedex
    .filter((p) => !all.has(p.dex))
    .map((p) => p.dex)
    .sort((a, b) => a - b);

  return {
    totalCovered: all.size,
    totalMissing: pokedex.length - all.size,
    byGen,
    missingDex,
  };
}
