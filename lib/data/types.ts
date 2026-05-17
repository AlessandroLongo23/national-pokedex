export type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface PokedexEntry {
  dex: number;
  name: string;
  gen: Generation;
}

export interface SetInfo {
  id: string;
  name: string;
  series: "Scarlet & Violet" | "Mega Evolution";
  releaseDate: string;
  dexNumbers: number[];
  uniqueCount: number;
  distinctPokemonCount: number;
}

export interface Coverage {
  totalCovered: number;
  totalMissing: number;
  byGen: Record<Generation, { covered: number; total: number }>;
  meAdded: number[];
  missingDex: number[];
}

export interface GreedyEntry {
  rank: number;
  setId: string;
  setName: string;
  newCount: number;
  cumulative: number;
  releaseDate: string;
}

export function genOf(dex: number): Generation {
  if (dex <= 151) return 1;
  if (dex <= 251) return 2;
  if (dex <= 386) return 3;
  if (dex <= 493) return 4;
  if (dex <= 649) return 5;
  if (dex <= 721) return 6;
  if (dex <= 809) return 7;
  if (dex <= 905) return 8;
  if (dex <= 1025) return 9;
  throw new Error(`Dex number out of range: ${dex}`);
}
