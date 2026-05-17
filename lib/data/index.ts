import pokedex from "./pokedex.json";
import sets from "./sets.json";
import coverage from "./coverage.json";
import greedy from "./greedy.json";
import type { Coverage, GreedyEntry, PokedexEntry, SetInfo } from "./types";

export const POKEDEX = pokedex as PokedexEntry[];
export const SETS = sets as SetInfo[];
export const COVERAGE = coverage as Coverage;
export const GREEDY = greedy as GreedyEntry[];
