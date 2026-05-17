import { genOf, type PokedexEntry } from "@/lib/data/types";

interface RawEntry {
  num: number;
  name: string;
  baseSpecies?: string;
  [k: string]: unknown;
}

export function parsePokedex(raw: Record<string, RawEntry>): PokedexEntry[] {
  const out: PokedexEntry[] = [];
  for (const entry of Object.values(raw)) {
    if (entry.baseSpecies) continue;
    if (entry.num < 1 || entry.num > 1025) continue;
    out.push({ dex: entry.num, name: entry.name, gen: genOf(entry.num) });
  }
  out.sort((a, b) => a.dex - b.dex);
  return out;
}
