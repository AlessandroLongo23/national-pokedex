// Orchestrator: run the three pack-buying strategies across two set universes
// (Scarlet & Violet + Mega Evolution, and all openable sets), each for T
// Monte-Carlo trajectories of `budget` packs from an empty collection, then
// write aggregated results to JSON + CSV for the report.
//
//   npx tsx scripts/sim/run.ts --trials 2000 --seed 1234 --budget 1000
//
// Reproducibility: every trajectory's RNG is mulberry32(deriveSeed(seed,
// strategyIdx, trial)) — independent streams per (strategy, trial). We do NOT
// use common random numbers: the three strategies open different sets each
// step, so their draw streams desynchronize immediately and CRN coupling is
// negligible. With T in the thousands the per-strategy CIs are already far
// narrower than the between-strategy gaps.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { POKEDEX, SET_POOLS } from "@/lib/data";
import { buildExpectedNewModel, getCandidateSets, type ExpectedNewModel } from "./analytic";
import { buildEngines, runTrajectory, type SetEngine } from "./trial";
import { bestPack, leastOpened, uniform, type Picker } from "./strategies";
import { deriveSeed, mulberry32 } from "./rng";
import { runPullCensus, RARITY_BUCKETS } from "./pulls";
import {
  getBuyableSpecies,
  obtainableBucketsFromPools,
  pBestBySpecies,
  buyableSortedByHardness,
  runToCompletion,
  runWeeklyPlan,
} from "./cost";
import {
  bootstrapCI,
  diffStat,
  elementwiseMean,
  elementwiseStd,
  summarize,
} from "./aggregate";

const NATIONAL_DEX = 1025;

interface StrategyDef {
  key: string;
  label: string;
  picker: Picker;
}

const STRATEGIES: StrategyDef[] = [
  { key: "best", label: "Best pack", picker: bestPack },
  { key: "random", label: "Random set", picker: uniform },
  { key: "least", label: "Least-opened", picker: leastOpened },
];

interface UniverseDef {
  key: string;
  label: string;
  series: string[] | null;
}

const UNIVERSES: UniverseDef[] = [
  {
    key: "sv_me",
    label: "Scarlet & Violet + Mega Evolution",
    series: ["Scarlet & Violet", "Mega Evolution"],
  },
  { key: "all", label: "All openable sets (Base → today)", series: null },
];

function parseArgs(argv: string[]): {
  trials: number;
  seed: number;
  budget: number;
  checkpoints: number[];
  bootReps: number;
  censusTrials: number;
  costTrials: number;
  timeTrials: number;
  outDir: string;
} {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const checkpointsRaw = get("--checkpoints") ?? "10,50,200,1000";
  return {
    trials: Number(get("--trials") ?? 2000),
    seed: Number(get("--seed") ?? 1234),
    budget: Number(get("--budget") ?? 1000),
    checkpoints: checkpointsRaw.split(",").map((s) => Number(s.trim())),
    bootReps: Number(get("--boot") ?? 2000),
    censusTrials: Number(get("--census") ?? 1000),
    costTrials: Number(get("--cost") ?? 500),
    timeTrials: Number(get("--time") ?? 500),
    outDir: get("--out") ?? path.join(process.cwd(), "analysis", "pack-strategy"),
  };
}

const PACK_EUR = 10;
const SINGLE_EUR = 0.5;

// Expected cost to COMPLETE the National Pokédex (all 1025 achievable species),
// over the full openable catalogue. Compares the three pack strategies (packs
// only) against the "alternating" strategy (1 pack + 10 targeted singles per
// round), under two single-availability rules: Common/Uncommon, and incl. Rare.
function buildCompletionCost(seed: number, trials: number) {
  const cands = getCandidateSets(); // all openable sets — completing the dex needs the whole catalogue
  const model = buildExpectedNewModel(cands);
  const engines = buildEngines(cands);
  const pBest = pBestBySpecies(model);
  const buyCU = buyableSortedByHardness(getBuyableSpecies(cands, ["Common", "Uncommon"]), pBest);
  const buyCUR = buyableSortedByHardness(
    getBuyableSpecies(cands, ["Common", "Uncommon", "Rare"]),
    pBest,
  );
  const target = model.achievableCeiling;

  const pickers: [string, Picker][] = [
    ["best", bestPack],
    ["random", uniform],
    ["least", leastOpened],
  ];
  const rules: [string, number[] | null][] = [
    ["none", null],
    ["cu", buyCU],
    ["cur", buyCUR],
  ];

  const cells = [];
  for (let pi = 0; pi < pickers.length; pi++) {
    for (let ri = 0; ri < rules.length; ri++) {
      const [pk, picker] = pickers[pi]!;
      const [rk, buy] = rules[ri]!;
      let sp = 0;
      let ss = 0;
      for (let t = 0; t < trials; t++) {
        const rng = mulberry32(deriveSeed(seed ^ 0xc057, pi * 3 + ri, t));
        const r = runToCompletion(picker, model, engines, rng, { buyableSorted: buy });
        sp += r.packs;
        ss += r.singles;
      }
      const packs = sp / trials;
      const singles = ss / trials;
      cells.push({ picker: pk, rule: rk, packs, singles, cost: packs * PACK_EUR + singles * SINGLE_EUR });
    }
  }

  return {
    trials,
    packEur: PACK_EUR,
    singleEur: SINGLE_EUR,
    universe: "all openable sets",
    setCount: cands.length,
    target,
    buyableCU: buyCU.length,
    buyableCUR: buyCUR.length,
    packOnlyCU: target - buyCU.length,
    packOnlyCUR: target - buyCUR.length,
    cells,
  };
}

const SV_SERIES = ["Scarlet & Violet", "Mega Evolution"];

// Expected TIME to complete the National Pokédex at a steady weekly cadence:
// one Scarlet & Violet + Mega booster plus ten single-channel cards a week,
// where each card is first sought by TRADING a same-rarity duplicate you already
// have spare, and only bought (€0.50) if no matching duplicate is on hand.
// Singles/trades are catalogue-wide (any set); only the packs are SV + ME.
function buildCompletionTime(seed: number, trials: number) {
  const svCands = getCandidateSets(SV_SERIES);
  const svModel = buildExpectedNewModel(svCands);
  const svEngines = buildEngines(svCands);

  const allCands = getCandidateSets();
  const allModel = buildExpectedNewModel(allCands);
  const pBestAll = pBestBySpecies(allModel);
  const allPools = allCands.map((s) => SET_POOLS[s.id]!);
  const obtainable = obtainableBucketsFromPools(allPools, ["Common", "Uncommon", "Rare"]);
  const buyableCUR = getBuyableSpecies(allCands, ["Common", "Uncommon", "Rare"]);
  const buyOrder = buyableSortedByHardness(buyableCUR, pBestAll);

  // Species reachable from SV+ME packs (grabbed incidentally as you go).
  const svReachable = new Set<number>();
  for (const m of svModel.pSetBySet.values()) for (const d of m.keys()) svReachable.add(d);

  // What's reachable by this plan = catalogue C/U/R singles ∪ SV+ME packs.
  const reachableCUR = new Set<number>(buyOrder);
  for (const d of svReachable) reachableCUR.add(d);
  const target = reachableCUR.size;

  // C/U-only would leave a tail unreachable (no Rare singles) — quantify it.
  const buyableCU = getBuyableSpecies(allCands, ["Common", "Uncommon"]);
  const reachableCU = new Set<number>(buyableCU);
  for (const d of svReachable) reachableCU.add(d);

  let sWeeks = 0;
  let sPacks = 0;
  let sTrades = 0;
  let sBuys = 0;
  let sChannel = 0;
  let sPackNew = 0;
  let completedCount = 0;
  const weeksArr: number[] = [];
  for (let t = 0; t < trials; t++) {
    const rng = mulberry32(deriveSeed(seed ^ 0x71e3, 0, t));
    const r = runWeeklyPlan(bestPack, svModel, svEngines, rng, {
      target,
      buyOrder,
      obtainable,
      trade: true,
      singlesPerWeek: 10,
      pBest: pBestAll,
    });
    sWeeks += r.weeks;
    sPacks += r.packs;
    sTrades += r.trades;
    sBuys += r.buys;
    sChannel += r.singlesChannel;
    sPackNew += r.packNew;
    if (r.completed) completedCount++;
    weeksArr.push(r.weeks);
  }
  weeksArr.sort((a, b) => a - b);
  const pct = (q: number) => weeksArr[Math.min(weeksArr.length - 1, Math.floor(q * weeksArr.length))]!;

  const weeks = sWeeks / trials;
  const packs = sPacks / trials;
  const trades = sTrades / trials;
  const buys = sBuys / trials;
  const singlesChannel = sChannel / trials;
  const packNew = sPackNew / trials;
  // Same plan, same time — buying every single-channel slot vs. trading the ones
  // you have a spare for. Savings = the traded slots you no longer pay for.
  const buyOnlyCost = packs * PACK_EUR + singlesChannel * SINGLE_EUR;
  const tradeCost = packs * PACK_EUR + buys * SINGLE_EUR;

  return {
    trials,
    packEur: PACK_EUR,
    singleEur: SINGLE_EUR,
    packUniverse: "Scarlet & Violet + Mega Evolution",
    packSetCount: svCands.length,
    singlesPerWeek: 10,
    target,
    reachableCU: reachableCU.size,
    reachableCUR: target,
    completedFrac: completedCount / trials,
    weeks,
    weeksMedian: pct(0.5),
    weeksP10: pct(0.1),
    weeksP90: pct(0.9),
    years: weeks / 52,
    packs,
    trades,
    buys,
    singlesChannel,
    packNew,
    buyOnlyCost,
    tradeCost,
    savings: buyOnlyCost - tradeCost,
  };
}

const NAME_BY_DEX = new Map(POKEDEX.map((p) => [p.dex, { name: p.name, gen: p.gen }]));

// Run a best-pack "pull census": open packs while recording every card's rarity,
// supertype and species, averaged over many trials. Answers "what do the pulls
// actually look like, and which Pokémon show up most / least?"
function buildCensus(
  model: ExpectedNewModel,
  engines: Map<string, SetEngine>,
  opts: { trials: number; budget: number; checkpoints: number[]; seed: number },
) {
  const { trials, budget, checkpoints, seed } = opts;
  const nb = RARITY_BUCKETS.length;
  const sumRareSlot = new Array(nb).fill(0);
  const sumSpecies: number[] = [];
  const cpSum = checkpoints.map(() => ({
    rarity: new Array(nb).fill(0),
    pokemon: 0,
    trainer: 0,
    energy: 0,
    distinct: 0,
  }));
  let sumTotalCards = 0;

  for (let t = 0; t < trials; t++) {
    const rng = mulberry32(deriveSeed(seed ^ 0x0ce0, 0, t));
    const c = runPullCensus(bestPack, model, engines, rng, { budget, checkpoints });
    sumTotalCards += c.totalCards;
    for (let b = 0; b < nb; b++) sumRareSlot[b] += c.rareSlot[b]!;
    for (let d = 0; d < c.speciesPulls.length; d++) sumSpecies[d] = (sumSpecies[d] ?? 0) + c.speciesPulls[d]!;
    c.checkpoints.forEach((cp, i) => {
      for (let b = 0; b < nb; b++) cpSum[i]!.rarity[b] += cp.rarity[b]!;
      cpSum[i]!.pokemon += cp.pokemon;
      cpSum[i]!.trainer += cp.trainer;
      cpSum[i]!.energy += cp.energy;
      cpSum[i]!.distinct += cp.distinctSpecies;
    });
  }

  const avg = (x: number) => x / trials;
  const checkpointsOut = checkpoints.map((pack, i) => {
    const rarity: Record<string, number> = {};
    RARITY_BUCKETS.forEach((b, bi) => (rarity[b] = avg(cpSum[i]!.rarity[bi]!)));
    return {
      pack,
      rarity,
      pokemon: avg(cpSum[i]!.pokemon),
      trainer: avg(cpSum[i]!.trainer),
      energy: avg(cpSum[i]!.energy),
      distinct: avg(cpSum[i]!.distinct),
    };
  });

  const rareSlotTotal = sumRareSlot.reduce((a, b) => a + b, 0) || 1;
  const rareSlot: Record<string, number> = {};
  const rareSlotPct: Record<string, number> = {};
  RARITY_BUCKETS.forEach((b, bi) => {
    rareSlot[b] = avg(sumRareSlot[bi]!);
    rareSlotPct[b] = sumRareSlot[bi]! / rareSlotTotal;
  });

  const universeSpecies = new Set<number>();
  for (const m of model.pSetBySet.values()) for (const d of m.keys()) universeSpecies.add(d);
  const rows = [...universeSpecies].map((dex) => ({
    dex,
    name: NAME_BY_DEX.get(dex)?.name ?? `#${dex}`,
    gen: NAME_BY_DEX.get(dex)?.gen ?? 0,
    avg: avg(sumSpecies[dex] ?? 0),
  }));
  const topPulled = [...rows].sort((a, b) => b.avg - a.avg).slice(0, 15);
  const positive = rows.filter((r) => r.avg > 0).sort((a, b) => a.avg - b.avg);
  const rarestPulled = positive.slice(0, 15);
  const neverPulled = rows.filter((r) => r.avg === 0).length;

  return {
    trials,
    budget,
    totalCardsAvg: avg(sumTotalCards),
    checkpoints: checkpointsOut,
    rareSlot,
    rareSlotPct,
    topPulled,
    rarestPulled,
    neverPulled,
    universeSpeciesCount: universeSpecies.size,
  };
}

function sha256OfFile(file: string): string {
  const buf = fs.readFileSync(file);
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  console.log(
    `Pack-strategy simulation — trials=${args.trials} seed=${args.seed} budget=${args.budget} checkpoints=[${args.checkpoints.join(",")}]`,
  );

  const setPoolsHash = sha256OfFile(
    path.join(process.cwd(), "lib", "data", "setPools.json"),
  );

  const universesOut = UNIVERSES.map((uni) => {
    const candidates = getCandidateSets(uni.series ?? undefined);
    const model = buildExpectedNewModel(candidates);
    const engines = buildEngines(candidates);
    console.log(
      `\n[${uni.key}] ${uni.label}: ${candidates.length} sets · achievable ceiling ${model.achievableCeiling} species (catalog lists ${model.catalogCeiling})`,
    );

    // Per-strategy aggregated output + per-checkpoint raw values (for diffs).
    const checkpointValues: Record<string, number[][]> = {}; // strategyKey -> [checkpoint][trial]

    const strategiesOut = STRATEGIES.map((strat, si) => {
      const curves: number[][] = [];
      const wastedCurves: number[][] = [];
      const cpVals: number[][] = args.checkpoints.map(() => []);
      const cpWasted: number[][] = args.checkpoints.map(() => []);

      for (let trial = 0; trial < args.trials; trial++) {
        const rng = mulberry32(deriveSeed(args.seed, si, trial));
        const res = runTrajectory(strat.picker, model, engines, rng, {
          budget: args.budget,
          checkpoints: args.checkpoints,
        });
        curves.push(res.curve);
        wastedCurves.push(res.wastedCurve);
        for (let k = 0; k < args.checkpoints.length; k++) {
          cpVals[k]!.push(res.speciesAt[k]!);
          cpWasted[k]!.push(res.wastedAt[k]!);
        }
      }
      checkpointValues[strat.key] = cpVals;

      const meanCurve = elementwiseMean(curves);
      const stdCurve = elementwiseStd(curves);
      const seCurve = stdCurve.map((s) => s / Math.sqrt(args.trials));
      const ciLoCurve = meanCurve.map((m, i) => m - 1.96 * seCurve[i]!);
      const ciHiCurve = meanCurve.map((m, i) => m + 1.96 * seCurve[i]!);
      const meanWastedCurve = elementwiseMean(wastedCurves);

      const checkpoints = args.checkpoints.map((pack, k) => {
        const stat = summarize(cpVals[k]!);
        const boot = bootstrapCI(
          cpVals[k]!,
          mulberry32(deriveSeed(args.seed ^ 0xb00757, si, k)),
          args.bootReps,
        );
        const wastedMean = summarize(cpWasted[k]!).mean;
        return {
          pack,
          mean: stat.mean,
          std: stat.std,
          se: stat.se,
          ciLo: stat.ciLo,
          ciHi: stat.ciHi,
          bootLo: boot.lo,
          bootHi: boot.hi,
          wastedMean,
          wastedFrac: wastedMean / pack,
        };
      });

      const halfWidths = checkpoints.map((c) => (c.ciHi - c.ciLo) / 2);
      console.log(
        `  ${strat.label.padEnd(13)} species@[${args.checkpoints.join("/")}] = ` +
          checkpoints.map((c) => c.mean.toFixed(1)).join(" / ") +
          `  (±${halfWidths.map((h) => h.toFixed(2)).join("/")})`,
      );

      return {
        key: strat.key,
        label: strat.label,
        checkpoints,
        meanCurve,
        ciLoCurve,
        ciHiCurve,
        meanWastedCurve,
      };
    });

    // Pairwise differences at each checkpoint (independent two-sample).
    const pairs: [string, string][] = [
      ["best", "random"],
      ["best", "least"],
      ["least", "random"],
    ];
    const diffs = pairs.flatMap(([a, b]) =>
      args.checkpoints.map((pack, k) => {
        const d = diffStat(checkpointValues[a]![k]!, checkpointValues[b]![k]!);
        return { aKey: a, bKey: b, pack, ...d };
      }),
    );

    const pullCensus = buildCensus(model, engines, {
      trials: args.censusTrials,
      budget: args.budget,
      checkpoints: args.checkpoints,
      seed: args.seed,
    });
    const lastCp = pullCensus.checkpoints[pullCensus.checkpoints.length - 1]!;
    console.log(
      `  pull census (best pack, ${args.censusTrials} runs): ${lastCp.pokemon.toFixed(0)} Pokémon cards / ${pullCensus.totalCardsAvg.toFixed(0)} total in ${args.budget} packs · top pull ${pullCensus.topPulled[0]!.name} (${pullCensus.topPulled[0]!.avg.toFixed(1)}×) · ${pullCensus.neverPulled} species never pulled`,
    );

    return {
      key: uni.key,
      label: uni.label,
      candidateSetCount: candidates.length,
      candidateSetIds: candidates.map((s) => s.id),
      achievableCeiling: model.achievableCeiling,
      catalogCeiling: model.catalogCeiling,
      strategies: strategiesOut,
      diffs,
      pullCensus,
    };
  });

  console.log(`\nComputing expected cost to complete the Pokédex (${args.costTrials} trials)…`);
  const completionCost = buildCompletionCost(args.seed, args.costTrials);
  const fmtEur = (n: number) => `€${Math.round(n).toLocaleString()}`;
  for (const c of completionCost.cells) {
    console.log(
      `  ${c.picker.padEnd(6)} ${c.rule.padEnd(4)}: ${c.packs.toFixed(0).padStart(6)} packs + ${c.singles.toFixed(0).padStart(4)} singles → ${fmtEur(c.cost).padStart(9)}`,
    );
  }

  console.log(
    `\nComputing completion TIME at 1 SV+ME pack + 10 trade-first cards/week (${args.timeTrials} trials)…`,
  );
  const completionTime = buildCompletionTime(args.seed, args.timeTrials);
  console.log(
    `  target ${completionTime.target} species · reachable C/U/R ${completionTime.reachableCUR}, C/U only ${completionTime.reachableCU}`,
  );
  console.log(
    `  ${completionTime.weeks.toFixed(1)} wk (${completionTime.years.toFixed(2)} yr) · median ${completionTime.weeksMedian} [p10 ${completionTime.weeksP10}, p90 ${completionTime.weeksP90}]`,
  );
  console.log(
    `  per run: ~${completionTime.packs.toFixed(0)} packs · ${completionTime.trades.toFixed(0)} trades + ${completionTime.buys.toFixed(0)} buys (${completionTime.singlesChannel.toFixed(0)} single-channel) · ${completionTime.packNew.toFixed(0)} from packs`,
  );
  console.log(
    `  cost: buy-only ${fmtEur(completionTime.buyOnlyCost)} → trade-first ${fmtEur(completionTime.tradeCost)} (save ${fmtEur(completionTime.savings)})`,
  );

  const elapsedMs = Date.now() - t0;
  const result = {
    meta: {
      seed: args.seed,
      trials: args.trials,
      budget: args.budget,
      checkpoints: args.checkpoints,
      bootReps: args.bootReps,
      nationalDex: NATIONAL_DEX,
      setPoolsHash,
      node: process.version,
      generatedAt: new Date().toISOString(),
      elapsedMs,
      strategyOrder: STRATEGIES.map((s) => ({ key: s.key, label: s.label })),
    },
    universes: universesOut,
    completionCost,
    completionTime,
  };

  fs.mkdirSync(args.outDir, { recursive: true });
  const jsonPath = path.join(args.outDir, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));

  // Tidy long-format CSV of the checkpoint summary.
  const header =
    "universe,strategy,checkpoint,mean,std,se,ci_lo,ci_hi,boot_lo,boot_hi,wasted_mean,wasted_frac";
  const rows: string[] = [header];
  for (const uni of universesOut) {
    for (const strat of uni.strategies) {
      for (const c of strat.checkpoints) {
        rows.push(
          [
            uni.key,
            strat.key,
            c.pack,
            c.mean.toFixed(4),
            c.std.toFixed(4),
            c.se.toFixed(4),
            c.ciLo.toFixed(4),
            c.ciHi.toFixed(4),
            c.bootLo.toFixed(4),
            c.bootHi.toFixed(4),
            c.wastedMean.toFixed(4),
            c.wastedFrac.toFixed(4),
          ].join(","),
        );
      }
    }
  }
  const csvPath = path.join(args.outDir, "results.csv");
  fs.writeFileSync(csvPath, rows.join("\n") + "\n");

  console.log(`\nDone in ${(elapsedMs / 1000).toFixed(1)}s.`);
  console.log(`  → ${jsonPath}`);
  console.log(`  → ${csvPath}`);
}

main();
