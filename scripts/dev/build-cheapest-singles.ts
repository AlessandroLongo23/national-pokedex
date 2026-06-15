// Regenerate lib/data/cheapestSingles.json from the per-set card files and
// sets.json already committed to the repo — no pokemon-tcg-data clone required
// (unlike the full `npm run data:rebuild`). Handy when only this derived table
// needs refreshing, or to bootstrap it the first time.
//
//   npx tsx scripts/dev/build-cheapest-singles.ts

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { computeCheapestSingles } from "@/scripts/ingest/cheapestSingles";
import type { CardEntry, SetInfo } from "@/lib/data/types";

const dataDir = path.resolve(process.cwd(), "lib", "data");
const cardsDir = path.join(dataDir, "cards");

const sets = JSON.parse(readFileSync(path.join(dataDir, "sets.json"), "utf8")) as SetInfo[];

const cardsBySet: Record<string, CardEntry[]> = {};
for (const file of readdirSync(cardsDir)) {
  if (!file.endsWith(".json")) continue;
  const setId = file.slice(0, -".json".length);
  cardsBySet[setId] = JSON.parse(readFileSync(path.join(cardsDir, file), "utf8")) as CardEntry[];
}

const cheapestSingles = computeCheapestSingles(sets, cardsBySet);
writeFileSync(
  path.join(dataDir, "cheapestSingles.json"),
  JSON.stringify(cheapestSingles, null, 2) + "\n",
);

const species = Object.keys(cheapestSingles).length;
console.log(`[cheapest-singles] wrote ${species} species to lib/data/cheapestSingles.json`);
