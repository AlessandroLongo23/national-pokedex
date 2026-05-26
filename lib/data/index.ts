import pokedex from "./pokedex.json";
import sets from "./sets.json";
import coverage from "./coverage.json";
import greedy from "./greedy.json";
import setPools from "./setPools.json";
import cardIndex from "./cardIndex.json";
import species from "./species.json";
import boosters from "./boosters.json";
import tcgcsvMap from "./tcgcsvMap.json";
import type {
  BoosterManifest,
  CardEntry,
  CardIndex,
  Coverage,
  GreedyEntry,
  PokedexEntry,
  SetInfo,
  SetPools,
  SpeciesIndex,
  TcgCsvMap,
} from "./types";
import type { OtherCardsBySubtype, OtherSubtype } from "./other-subtypes";

export const POKEDEX = pokedex as PokedexEntry[];
export const SETS = sets as SetInfo[];
export const COVERAGE = coverage as Coverage;
export const GREEDY = greedy as GreedyEntry[];
export const SET_POOLS = setPools as SetPools;
export const CARD_INDEX = cardIndex as CardIndex;
export const SPECIES = species as SpeciesIndex;
export const BOOSTERS = boosters as BoosterManifest;
export const TCGCSV_MAP = tcgcsvMap as TcgCsvMap;

export function getSet(setId: string): SetInfo | undefined {
  return SETS.find((s) => s.id === setId);
}

export function getSpecies(dex: number): import("./types").SpeciesEntry | undefined {
  return SPECIES[dex];
}

// Server-only: read per-set card data from disk. Per-set files live under
// lib/data/cards/{setId}.json and are loaded on demand to keep the client
// bundle small. Must only be called from server components / server actions
// / route handlers. We use fs rather than dynamic import so Next doesn't try
// to bundle ~150 JSON files; the API route reads exactly the set requested.
export async function loadSetCards(setId: string): Promise<CardEntry[]> {
  if (!/^[a-z0-9]+$/i.test(setId)) {
    throw new Error(`Invalid set id: ${setId}`);
  }
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "lib", "data", "cards", `${setId}.json`);
  const buf = await fs.readFile(file, "utf8");
  return JSON.parse(buf) as CardEntry[];
}

let otherCardsBySubtypeCache: OtherCardsBySubtype | null = null;
export async function loadOtherCardsBySubtype(): Promise<OtherCardsBySubtype> {
  if (otherCardsBySubtypeCache) return otherCardsBySubtypeCache;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "lib", "data", "otherCardsBySubtype.json");
  const buf = await fs.readFile(file, "utf8");
  otherCardsBySubtypeCache = JSON.parse(buf) as OtherCardsBySubtype;
  return otherCardsBySubtypeCache;
}

export async function loadOtherSubtype(subtype: OtherSubtype): Promise<CardEntry[]> {
  const all = await loadOtherCardsBySubtype();
  return all[subtype];
}
