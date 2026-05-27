import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fetchSources } from "./fetch";
import { parsePokedex } from "./parsePokedex";
import { parseSetCards, type RawCard } from "./parseCards";
import { discoverMegas } from "./parseMegas";
import { computeCoverage } from "./coverage";
import { computeGreedyOrder } from "./greedy";
import { fetchSpecies } from "./fetchSpecies";
import { fetchBoosters } from "./fetchBoosters";
import { fetchTcgCsvMap } from "./fetchTcgCsv";
import type { CardEntry, CardIndex, SetInfo, SetPools } from "@/lib/data/types";
import {
  OTHER_SUBTYPES,
  OTHER_SUBTYPE_PREDICATES,
  type OtherCardsBySubtype,
} from "@/lib/data/other-subtypes";

// Promo-only / utility files we never want surfaced as openable sets.
const SKIPPED_SETS = new Set<string>(["sve"]);

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

interface AllSetsResult {
  sets: SetInfo[];
  pools: SetPools;
  cardsBySet: Record<string, CardEntry[]>;
  cardIndex: CardIndex;
}

function loadAllSets(tcgDataDir: string): AllSetsResult {
  const setsFile = path.join(tcgDataDir, "sets", "en.json");
  const rawSets = JSON.parse(readFileSync(setsFile, "utf8")) as RawSet[];
  const cardsDir = path.join(tcgDataDir, "cards", "en");
  const out: SetInfo[] = [];
  const pools: SetPools = {};
  const cardsBySet: Record<string, CardEntry[]> = {};
  const cardIndex: CardIndex = {};

  for (const s of rawSets) {
    if (SKIPPED_SETS.has(s.id)) continue;
    const cardsFile = path.join(cardsDir, `${s.id}.json`);
    if (!existsSync(cardsFile)) {
      console.warn(`[ingest] no cards file for set ${s.id} (${s.name}) — skipping`);
      continue;
    }

    const cards = JSON.parse(readFileSync(cardsFile, "utf8")) as RawCard[];
    const summary = parseSetCards(s.id, cards);

    out.push({
      id: s.id,
      name: s.name,
      series: s.series,
      releaseDate: s.releaseDate,
      dexNumbers: summary.dexNumbers.sort((a, b) => a - b),
      uniqueCount: 0,
      distinctPokemonCount: summary.distinctPokemonCount,
      cardCount: summary.cardCount,
    });
    pools[s.id] = summary.rarityPool;
    cardsBySet[s.id] = summary.cards;
    for (const card of summary.cards) {
      for (const dex of card.dex) {
        if (!cardIndex[dex]) cardIndex[dex] = [];
        cardIndex[dex].push(card.id);
      }
    }
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
  return { sets: out, pools, cardsBySet, cardIndex };
}

function writeJson(file: string, data: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

async function main() {
  const { tcgDataDir, showdownDir } = fetchSources();

  const showdownPokedex = loadShowdownPokedex(showdownDir);
  const pokedex = parsePokedex(showdownPokedex);
  console.log(`[ingest] pokedex: ${pokedex.length} entries`);

  const { sets, pools, cardsBySet, cardIndex } = loadAllSets(tcgDataDir);
  console.log(`[ingest] sets: ${sets.length} across ${new Set(sets.map((s) => s.series)).size} series`);

  const { megas, cardIndexByMega } = discoverMegas(cardsBySet);
  console.log(
    `[ingest] megas: ${megas.length} distinct forms (${megas.filter((m) => m.isPrimal).length} primal)`,
  );

  const coverage = computeCoverage(pokedex, sets);
  console.log(
    `[ingest] coverage: ${coverage.totalCovered}/${pokedex.length} (${coverage.totalMissing} missing)`,
  );

  const greedy = computeGreedyOrder(sets);
  console.log(`[ingest] greedy top: ${greedy[0]?.setName} (+${greedy[0]?.newCount})`);

  const species = await fetchSpecies(pokedex);
  console.log(`[ingest] species: ${Object.keys(species).length} entries`);

  const boosters = await fetchBoosters();
  const wrapperCount = Object.values(boosters).reduce((n, arr) => n + arr.length, 0);
  console.log(
    `[ingest] boosters: ${wrapperCount} wrappers across ${Object.keys(boosters).length} sets`,
  );

  // tcgcsv mirror is queried for every set whose name we can match; older
  // sets rarely trigger the runtime fallback (pokemontcg.io's snapshot is
  // already complete for them) but having the map keeps the fallback safe
  // for any one-off missing card too.
  const tcgcsvMap = await fetchTcgCsvMap(sets);
  console.log(
    `[ingest] tcgcsv: ${Object.keys(tcgcsvMap.groups).length} sets mapped, ${Object.keys(tcgcsvMap.products).length} cards`,
  );

  const otherCardsBySubtype: OtherCardsBySubtype = {
    items: [],
    supporters: [],
    stadiums: [],
    tools: [],
    energies: [],
  };
  for (const set of sets) {
    const setCards = cardsBySet[set.id];
    if (!setCards) continue;
    for (const card of setCards) {
      for (const subtype of OTHER_SUBTYPES) {
        if (OTHER_SUBTYPE_PREDICATES[subtype](card)) {
          otherCardsBySubtype[subtype].push(card);
        }
      }
    }
  }
  console.log(
    `[ingest] other cards: ${OTHER_SUBTYPES.map(
      (s) => `${s}=${otherCardsBySubtype[s].length}`,
    ).join(" ")}`,
  );

  const dataDir = path.resolve(process.cwd(), "lib", "data");
  const cardsDir = path.join(dataDir, "cards");
  if (existsSync(cardsDir)) {
    for (const f of readdirSync(cardsDir)) {
      if (f.endsWith(".json")) rmSync(path.join(cardsDir, f));
    }
  }
  for (const [setId, cards] of Object.entries(cardsBySet)) {
    writeJson(path.join(cardsDir, `${setId}.json`), cards);
  }

  writeJson(path.join(dataDir, "pokedex.json"), pokedex);
  writeJson(path.join(dataDir, "sets.json"), sets);
  writeJson(path.join(dataDir, "coverage.json"), coverage);
  writeJson(path.join(dataDir, "greedy.json"), greedy);
  writeJson(path.join(dataDir, "setPools.json"), pools);
  writeJson(path.join(dataDir, "cardIndex.json"), cardIndex);
  writeJson(path.join(dataDir, "megas.json"), megas);
  writeJson(path.join(dataDir, "cardIndexByMega.json"), cardIndexByMega);
  writeJson(path.join(dataDir, "species.json"), species);
  writeJson(path.join(dataDir, "boosters.json"), boosters);
  writeJson(path.join(dataDir, "tcgcsvMap.json"), tcgcsvMap);
  writeJson(path.join(dataDir, "otherCardsBySubtype.json"), otherCardsBySubtype);

  console.log(`[ingest] wrote ${Object.keys(cardsBySet).length} per-set card files`);
  console.log("[ingest] done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
