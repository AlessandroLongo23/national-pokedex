import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fetchSources } from "./fetch";
import { parsePokedex } from "./parsePokedex";
import { parseSetCards, type RawCard } from "./parseCards";
import { computeCoverage } from "./coverage";
import { computeGreedyOrder } from "./greedy";
import type { SetInfo } from "@/lib/data/types";

const ACCEPTED_SERIES = new Set(["Scarlet & Violet", "Mega Evolution"]);
const SKIPPED_SETS = new Set(["sve"]);

interface RawSet {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
}

function loadShowdownPokedex(showdownDir: string) {
  const file = path.join(showdownDir, "data", "pokedex.ts");
  const source = readFileSync(file, "utf8");
  const match = source.match(/Pokedex\s*:[^=]*=\s*(\{[\s\S]*\});\s*$/m);
  if (!match) throw new Error("Could not parse smogon Pokedex object");
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  const obj = new Function(`return (${match[1]});`)();
  return obj as Record<string, { num: number; name: string; baseSpecies?: string }>;
}

function loadAllSets(tcgDataDir: string): SetInfo[] {
  const setsFile = path.join(tcgDataDir, "sets", "en.json");
  const rawSets = JSON.parse(readFileSync(setsFile, "utf8")) as RawSet[];
  const cardsDir = path.join(tcgDataDir, "cards", "en");
  const out: SetInfo[] = [];

  for (const s of rawSets) {
    if (!ACCEPTED_SERIES.has(s.series)) continue;
    if (SKIPPED_SETS.has(s.id)) continue;

    const cardsFile = path.join(cardsDir, `${s.id}.json`);
    const cards = JSON.parse(readFileSync(cardsFile, "utf8")) as RawCard[];
    const summary = parseSetCards(cards);

    out.push({
      id: s.id,
      name: s.name,
      series: s.series as SetInfo["series"],
      releaseDate: s.releaseDate,
      dexNumbers: summary.dexNumbers.sort((a, b) => a - b),
      uniqueCount: 0,
      distinctPokemonCount: summary.distinctPokemonCount,
    });
  }

  for (const s of out) {
    const others = new Set<number>();
    for (const other of out) {
      if (other.id === s.id) continue;
      for (const n of other.dexNumbers) others.add(n);
    }
    s.uniqueCount = s.dexNumbers.filter((n) => !others.has(n)).length;
  }

  out.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
  return out;
}

function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`[write] ${file}`);
}

function main() {
  const { tcgDataDir, showdownDir } = fetchSources();

  const showdownPokedex = loadShowdownPokedex(showdownDir);
  const pokedex = parsePokedex(showdownPokedex);
  console.log(`[ingest] pokedex: ${pokedex.length} entries`);

  const sets = loadAllSets(tcgDataDir);
  console.log(`[ingest] sets: ${sets.length} (SV + ME, excluding sve)`);

  const coverage = computeCoverage(pokedex, sets);
  console.log(
    `[ingest] coverage: ${coverage.totalCovered}/${pokedex.length} (${coverage.totalMissing} missing, ME added ${coverage.meAdded.length})`,
  );

  const greedy = computeGreedyOrder(sets);
  console.log(`[ingest] greedy top: ${greedy[0]?.setName} (+${greedy[0]?.newCount})`);

  const dataDir = path.resolve(process.cwd(), "lib", "data");
  writeJson(path.join(dataDir, "pokedex.json"), pokedex);
  writeJson(path.join(dataDir, "sets.json"), sets);
  writeJson(path.join(dataDir, "coverage.json"), coverage);
  writeJson(path.join(dataDir, "greedy.json"), greedy);

  console.log("[ingest] done.");
}

main();
