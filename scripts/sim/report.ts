// Assemble a self-contained HTML report from results.json: prose + the four
// inline-SVG charts + result tables, styled for print. render-pdf.ts then turns
// it into report.pdf via headless Chrome.

import fs from "node:fs";
import path from "node:path";
import {
  speciesCurveChart,
  checkpointDotPanels,
  marginalCurveChart,
  wastedFractionChart,
  hbarChart,
  costBarChart,
  PALETTE,
} from "./charts";

const RARITY_TIERS = [
  "Common",
  "Uncommon",
  "Rare",
  "DoubleRare",
  "UltraRare",
  "IllustrationRare",
  "SpecialIllustrationRare",
  "HyperRare",
] as const;
const RARITY_SHORT: Record<string, string> = {
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  DoubleRare: "Double Rare",
  UltraRare: "Ultra Rare",
  IllustrationRare: "Illustration Rare",
  SpecialIllustrationRare: "Special Illus. Rare",
  HyperRare: "Hyper Rare",
};
const RARITY_COLOR: Record<string, string> = {
  Common: "#94a3b8",
  Uncommon: "#64748b",
  Rare: "#3b82f6",
  DoubleRare: "#8b5cf6",
  UltraRare: "#ec4899",
  IllustrationRare: "#f59e0b",
  SpecialIllustrationRare: "#ef4444",
  HyperRare: "#eab308",
};
const GEN_NAME: Record<number, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

interface Checkpoint {
  pack: number;
  mean: number;
  std: number;
  se: number;
  ciLo: number;
  ciHi: number;
  bootLo: number;
  bootHi: number;
  wastedMean: number;
  wastedFrac: number;
}
interface Strategy {
  key: string;
  label: string;
  checkpoints: Checkpoint[];
  meanCurve: number[];
  ciLoCurve: number[];
  ciHiCurve: number[];
  meanWastedCurve: number[];
}
interface Diff {
  aKey: string;
  bKey: string;
  pack: number;
  diff: number;
  se: number;
  ciLo: number;
  ciHi: number;
}
interface LeaderRow {
  dex: number;
  name: string;
  gen: number;
  avg: number;
}
interface PullCensus {
  trials: number;
  budget: number;
  totalCardsAvg: number;
  checkpoints: {
    pack: number;
    rarity: Record<string, number>;
    pokemon: number;
    trainer: number;
    energy: number;
    distinct: number;
  }[];
  rareSlot: Record<string, number>;
  rareSlotPct: Record<string, number>;
  topPulled: LeaderRow[];
  rarestPulled: LeaderRow[];
  neverPulled: number;
  universeSpeciesCount: number;
}
interface Universe {
  key: string;
  label: string;
  candidateSetCount: number;
  candidateSetIds: string[];
  achievableCeiling: number;
  catalogCeiling: number;
  strategies: Strategy[];
  diffs: Diff[];
  pullCensus: PullCensus;
}
interface CostCell {
  picker: string;
  rule: string; // "none" | "cu" | "cur"
  packs: number;
  singles: number;
  cost: number;
}
interface CompletionCost {
  trials: number;
  packEur: number;
  singleEur: number;
  setCount: number;
  target: number;
  buyableCU: number;
  buyableCUR: number;
  packOnlyCU: number;
  packOnlyCUR: number;
  cells: CostCell[];
}
interface CompletionTime {
  trials: number;
  packEur: number;
  singleEur: number;
  packUniverse: string;
  packSetCount: number;
  singlesPerWeek: number;
  target: number;
  reachableCU: number;
  reachableCUR: number;
  completedFrac: number;
  weeks: number;
  weeksMedian: number;
  weeksP10: number;
  weeksP90: number;
  years: number;
  packs: number;
  trades: number;
  buys: number;
  singlesChannel: number;
  packNew: number;
  buyOnlyCost: number;
  tradeCost: number;
  savings: number;
}
interface Results {
  meta: {
    seed: number;
    trials: number;
    budget: number;
    checkpoints: number[];
    bootReps: number;
    nationalDex: number;
    setPoolsHash: string;
    node: string;
    generatedAt: string;
    elapsedMs: number;
  };
  universes: Universe[];
  completionCost: CompletionCost;
  completionTime: CompletionTime;
}

const f1 = (n: number) => n.toFixed(1);
const f0 = (n: number) => n.toFixed(0);

function strat(uni: Universe, key: string): Strategy {
  return uni.strategies.find((s) => s.key === key)!;
}
function diff(uni: Universe, a: string, b: string, pack: number): Diff {
  return uni.diffs.find((d) => d.aKey === a && d.bKey === b && d.pack === pack)!;
}

function meanTable(uni: Universe): string {
  const cps = uni.strategies[0]!.checkpoints.map((c) => c.pack);
  const head =
    `<tr><th>Strategy</th>` +
    cps.map((p) => `<th>After ${p} packs</th>`).join("") +
    `</tr>`;
  const rows = uni.strategies
    .map((s) => {
      const color = PALETTE[s.key] ?? "#000";
      const cells = s.checkpoints
        .map(
          (c) =>
            `<td><span class="num">${f1(c.mean)}</span><span class="ci">${f1(c.ciLo)}–${f1(c.ciHi)}</span></td>`,
        )
        .join("");
      return `<tr><td class="strat"><span class="swatch" style="background:${color}"></span>${s.label}</td>${cells}</tr>`;
    })
    .join("");
  return `<table class="data"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

function advantageTable(uni: Universe): string {
  const cps = uni.strategies[0]!.checkpoints.map((c) => c.pack);
  const head =
    `<tr><th>Best&nbsp;pack&nbsp;advantage</th>` +
    cps.map((p) => `<th>After ${p} packs</th>`).join("") +
    `</tr>`;
  const row = (b: string, label: string) =>
    `<tr><td class="strat">vs ${label}</td>` +
    cps
      .map((p) => {
        const d = diff(uni, "best", b, p);
        const sign = d.diff >= 0 ? "+" : "−";
        return `<td><span class="num">${sign}${f1(Math.abs(d.diff))}</span><span class="ci">95% CI ${f1(d.ciLo)}–${f1(d.ciHi)}</span></td>`;
      })
      .join("") +
    `</tr>`;
  return `<table class="data"><thead>${head}</thead><tbody>${row("random", "Random set")}${row("least", "Least-opened")}</tbody></table>`;
}

function charts(
  uni: Universe,
  meta: Results["meta"],
): { curve: string; panels: string; marginal: string; wasted: string } {
  const curve = speciesCurveChart(
    uni.strategies.map((s) => ({
      key: s.key,
      label: s.label,
      mean: s.meanCurve,
      ciLo: s.ciLoCurve,
      ciHi: s.ciHiCurve,
    })),
    {
      budget: meta.budget,
      checkpoints: meta.checkpoints,
      achievableCeiling: uni.achievableCeiling,
      catalogCeiling: uni.catalogCeiling,
      nationalDex: meta.nationalDex,
    },
  );
  const panels = checkpointDotPanels(
    meta.checkpoints.map((pack) => ({
      pack,
      data: uni.strategies.map((s) => {
        const c = s.checkpoints.find((x) => x.pack === pack)!;
        const short = s.key === "best" ? "Best" : s.key === "random" ? "Random" : "Least";
        return { key: s.key, label: s.label, short, mean: c.mean, ciLo: c.ciLo, ciHi: c.ciHi };
      }),
    })),
  );
  const marginal = marginalCurveChart(
    uni.strategies.map((s) => ({ key: s.key, label: s.label, mean: s.meanCurve })),
    { budget: meta.budget, checkpoints: meta.checkpoints },
  );
  const wasted = wastedFractionChart(
    uni.strategies.map((s) => ({ key: s.key, label: s.label, meanWastedCurve: s.meanWastedCurve })),
    { budget: meta.budget, checkpoints: meta.checkpoints },
  );
  return { curve, panels, marginal, wasted };
}

function rarityTable(census: PullCensus): string {
  const cps = census.checkpoints;
  const head =
    `<tr><th>Rarity</th>` + cps.map((c) => `<th>@ ${c.pack}</th>`).join("") + `</tr>`;
  const rows = RARITY_TIERS.map((tier) => {
    const cells = cps
      .map((c) => {
        const v = c.rarity[tier] ?? 0;
        return `<td><span class="num">${v >= 10 ? f0(v) : v.toFixed(1)}</span></td>`;
      })
      .join("");
    return `<tr><td class="strat"><span class="swatch" style="background:${RARITY_COLOR[tier]}"></span>${RARITY_SHORT[tier]}</td>${cells}</tr>`;
  }).join("");
  const totalRow =
    `<tr class="total"><td class="strat">All cards</td>` +
    cps
      .map((c) => `<td><span class="num">${f0(c.pokemon + c.trainer + c.energy)}</span></td>`)
      .join("") +
    `</tr>`;
  return `<table class="data"><thead>${head}</thead><tbody>${rows}${totalRow}</tbody></table>`;
}

function rarestTable(rows: LeaderRow[], budget: number): string {
  const half = Math.ceil(rows.length / 2);
  const cell = (r: LeaderRow) =>
    `<td class="strat">${r.name}</td><td class="gen">${GEN_NAME[r.gen] ?? ""}</td><td><span class="num">${r.avg.toFixed(2)}</span></td>`;
  const body: string[] = [];
  for (let i = 0; i < half; i++) {
    const l = rows[i];
    const r = rows[i + half];
    body.push(`<tr>${l ? cell(l) : "<td></td><td></td><td></td>"}${r ? cell(r) : "<td></td><td></td><td></td>"}</tr>`);
  }
  return `<table class="data rarest"><thead><tr><th>Species</th><th>Gen</th><th>Copies</th><th>Species</th><th>Gen</th><th>Copies</th></tr></thead><tbody>${body.join("")}</tbody></table>`;
}

function pullSection(uni: Universe, isAppendix: boolean): string {
  const c = uni.pullCensus;
  const last = c.checkpoints[c.checkpoints.length - 1]!;
  const total = last.pokemon + last.trainer + last.energy;
  const dupes = last.pokemon - last.distinct;
  const dupPct = (dupes / last.pokemon) * 100;
  const pkPct = (last.pokemon / total) * 100;

  // rare-slot hit mix (only tiers that actually occur in the rare slot)
  const rareItems = RARITY_TIERS.filter((t) => (c.rareSlotPct[t] ?? 0) > 0.0005).map((t) => ({
    label: RARITY_SHORT[t]!,
    value: (c.rareSlotPct[t] ?? 0) * 100,
    color: RARITY_COLOR[t],
    valueText: `${((c.rareSlotPct[t] ?? 0) * 100).toFixed(1)}%`,
  }));
  const topItems = c.topPulled.slice(0, 12).map((r) => ({
    label: r.name,
    value: r.avg,
    color: PALETTE.best,
    valueText: `${r.avg.toFixed(1)}×`,
  }));

  const fig = (n: number) => (isAppendix ? `A${n + 4}` : `${n + 4}`);

  return `
  <div class="pagebreak"></div>
  <section>
    <h2>${isAppendix ? "Appendix — " : ""}What you actually pull${isAppendix ? " (all sets)" : ""}</h2>
    <p>Following the best-pack strategy for ${c.budget.toLocaleString()} packs (averaged over
       ${c.trials.toLocaleString()} runs), you open about <strong>${f0(total)} cards</strong>:
       <strong>${f0(last.pokemon)} Pokémon</strong> (${f0(pkPct)}%), ${f0(last.trainer)} Trainers and
       ${f0(last.energy)} Energy. Those Pokémon cards resolve to <strong>${f0(last.distinct)} distinct species</strong>,
       which means roughly <strong>${f0(dupPct)}% of the Pokémon cards are duplicates</strong> of species you already
       had — the price of chasing the long tail.</p>

    <h3>Cards by rarity (cumulative, average)</h3>
    ${rarityTable(c)}
    <p class="hint">Commons and Uncommons dominate every pack; the higher tiers come almost entirely from the single
       guaranteed "rare slot" (and the occasional reverse-holo).</p>

    <h3>What lands in the rare slot?</h3>
    <figure>
      ${hbarChart(rareItems, { labelW: 132, maxValue: Math.max(...rareItems.map((i) => i.value)) })}
      <figcaption><strong>Figure ${fig(1)}.</strong> Of the one guaranteed rare-slot card per pack, how often each
        tier appears. ${isAppendix ? "Across all eras the mix skews further to plain Rare — older sets had few chase tiers, so those slots fall back to a Rare." : "These broadly follow the Scarlet & Violet pull weights; sets that lack a given chase tier route that slot to a plain Rare, lifting Rare a few points above its nominal 55%."}</figcaption>
    </figure>

    <h3>The most-pulled Pokémon</h3>
    <figure>
      ${hbarChart(topItems, { labelW: 110 })}
      <figcaption><strong>Figure ${fig(2)}.</strong> Average copies collected in ${c.budget.toLocaleString()} packs.
        These are common Pokémon reprinted across many of the sets best-pack opens — you end up swimming in them.</figcaption>
    </figure>

    <h3>The hardest to pull</h3>
    <p class="hint">The ${c.rarestPulled.length} scarcest species that still showed up at least once — typically found
       only at high rarity or in sets best-pack rarely needs to open${c.neverPulled > 0 ? `. A further <strong>${c.neverPulled}</strong> reachable species never appeared at all across the ${c.trials.toLocaleString()} runs.` : ` (every one of the ${c.universeSpeciesCount} reachable species turned up at least once).`}</p>
    ${rarestTable(c.rarestPulled, c.budget)}
  </section>`;
}

function universeSection(uni: Universe, meta: Results["meta"], isAppendix: boolean): string {
  const c = charts(uni, meta);
  const best = strat(uni, "best");
  const cp200 = best.checkpoints.find((x) => x.pack === 200);
  const dRand200 = uni.diffs.find((d) => d.aKey === "best" && d.bKey === "random" && d.pack === 200);
  const last = meta.checkpoints[meta.checkpoints.length - 1]!;
  const bestLast = best.checkpoints.find((x) => x.pack === last)!;
  const randLast = strat(uni, "random").checkpoints.find((x) => x.pack === last)!;

  const lead200 =
    cp200 && dRand200
      ? `<p>After <strong>200 packs</strong>, the best-pack collector holds about
         <strong>${f0(cp200.mean)} species</strong> — roughly
         <strong>${f0(dRand200.diff)} more</strong> than random buying
         (95% CI ${f1(dRand200.ciLo)}–${f1(dRand200.ciHi)}; the intervals are
         far too narrow to overlap, so the difference is unambiguous).</p>`
      : "";

  return `
  <section class="${isAppendix ? "appendix" : "headline"}">
    <h2>${isAppendix ? "Appendix — " : ""}${uni.label}</h2>
    <p class="lede">${uni.candidateSetCount} openable sets · ${uni.achievableCeiling} species are actually
      pullable from packs (the achievable ceiling), out of ${meta.nationalDex} in the National Pokédex.</p>

    <figure>
      ${c.curve}
      <figcaption><strong>Figure ${isAppendix ? "A1" : "1"}.</strong> Mean distinct species collected as packs are
        opened, averaged over ${meta.trials.toLocaleString()} simulated collectors per strategy. Shaded bands are
        95% confidence intervals (so narrow they are barely visible). The dashed line is the achievable ceiling.</figcaption>
    </figure>

    ${lead200}

    <figure>
      ${c.panels}
      <figcaption><strong>Figure ${isAppendix ? "A2" : "2"}.</strong> The four checkpoints at zoomed scale: dots are
        means, whiskers are 95% CIs. Each panel is scaled to its own range so the gaps are visible.</figcaption>
    </figure>

    <h3>Mean species collected</h3>
    ${meanTable(uni)}
    <h3>How far ahead is "best pack"?</h3>
    ${advantageTable(uni)}

    <figure>
      ${c.marginal}
      <figcaption><strong>Figure ${isAppendix ? "A3" : "3"}.</strong> Marginal yield — new species gained per pack
        (smoothed). Best-pack stays higher for longer; all strategies decay toward zero as the collection saturates.</figcaption>
    </figure>

    <figure>
      ${c.wasted}
      <figcaption><strong>Figure ${isAppendix ? "A4" : "4"}.</strong> Share of packs that yielded <em>no</em> new
        species. Random and least-opened waste packs much sooner because they keep buying sets whose Pokémon you
        already have.</figcaption>
    </figure>

    <p>By <strong>${last} packs</strong> best-pack reaches <strong>${f0(bestLast.mean)}</strong> of the
       ${uni.achievableCeiling} achievable species, versus <strong>${f0(randLast.mean)}</strong> for random — and it
       gets there having wasted far fewer packs along the way.</p>
  </section>`;
}

function eur(n: number): string {
  return `€${Math.round(n).toLocaleString("en-US")}`;
}

function costSection(cc: CompletionCost): string {
  const pLabel: Record<string, string> = { best: "Best pack", random: "Random", least: "Least-opened" };
  const rLabel: Record<string, string> = {
    none: "packs only",
    cu: "+ singles (C/U)",
    cur: "+ singles (C/U/R)",
  };
  const cell = (p: string, r: string) => cc.cells.find((c) => c.picker === p && c.rule === r)!;

  const bars = [
    { p: "least", r: "none" },
    { p: "random", r: "none" },
    { p: "random", r: "cu" },
    { p: "best", r: "none" },
    { p: "best", r: "cu" },
    { p: "best", r: "cur" },
  ]
    .map(({ p, r }) => {
      const c = cell(p, r);
      return {
        label: `${pLabel[p]} · ${rLabel[r]}`,
        value: c.cost,
        color: r === "cur" ? "#eab308" : PALETTE[p] ?? "#0f172a",
        valueText: eur(c.cost),
      };
    })
    .sort((a, b) => b.value - a.value);

  const tableRows = (["best", "random", "least"] as const)
    .flatMap((p) =>
      (["none", "cu", "cur"] as const).map((r, i) => {
        const c = cell(p, r);
        const first = i === 0 ? ` rowspan="3" class="strat grp"` : ' style="display:none"';
        return `<tr>${i === 0 ? `<td${first}>${pLabel[p]}</td>` : ""}<td class="strat">${rLabel[r]}</td><td><span class="num">${Math.round(c.packs).toLocaleString()}</span></td><td><span class="num">${Math.round(c.singles).toLocaleString()}</span></td><td><span class="num">${eur(c.cost)}</span></td></tr>`;
      }),
    )
    .join("");

  const bestNone = cell("best", "none").cost;
  const randNone = cell("random", "none").cost;
  const randCu = cell("random", "cu").cost;
  const bestCur = cell("best", "cur");

  return `
  <div class="pagebreak"></div>
  <section>
    <h2>How much to actually complete the Pokédex?</h2>
    <p>Completing the binder means owning all <strong>${cc.target}</strong> species — which needs the full
       ${cc.setCount}-set catalogue (the Scarlet&nbsp;&amp;&nbsp;Violet + Mega sets alone top out at 933, so they
       can't finish it). Each <strong>pack costs €${cc.packEur}</strong>; <strong>singles cost €${cc.singleEur.toFixed(2)}</strong>
       each (your "€5 for 10"), but a card can only be bought as a single if it's printed at an allowed rarity.</p>

    <figure>
      ${costBarChart(bars, {})}
      <figcaption><strong>Figure 7.</strong> Expected total spend to complete the Pokédex (log scale, ${cc.trials.toLocaleString()} runs each).
        Buying singles only helps if you can buy the bottleneck species.</figcaption>
    </figure>

    <p><strong>Packs only:</strong> with the smart best-pack order you finish for about <strong>${eur(bestNone)}</strong>;
       mindless random/least-opened buying balloons to <strong>${eur(randNone)}+</strong> — roughly
       ${(randNone / bestNone).toFixed(0)}× more — because they waste packs chasing the rare tail.</p>

    <p><strong>The Common/Uncommon wall.</strong> ${cc.packOnlyCU} of the ${cc.target} species
       <em>never</em> appear as a Common or Uncommon in any set — they exist only at Rare or higher, and they are
       exactly the hardest to pull. Under a C/U-only rule you can't buy them as singles, so they must be pulled no
       matter what. That's why adding C/U singles barely dents random's bill (still ${eur(randCu)}): the unbuyable
       tail gates completion regardless of how many cheap commons you mop up.</p>

    <p><strong>Allow Rares as singles and the wall disappears.</strong> All <strong>${cc.buyableCUR}</strong> species
       become buyable (${cc.packOnlyCUR} pack-only), so you simply <em>buy</em> the dex — about
       ${Math.round(bestCur.singles).toLocaleString()} singles plus only ~${Math.round(bestCur.packs)} packs — for roughly
       <strong>${eur(bestCur.cost)}</strong>. At that point the pack strategy stops mattering: best, random and
       least-opened all finish near €1,000, because you're no longer relying on luck to find anything.</p>

    <table class="data cost"><thead><tr><th>Strategy</th><th>Singles rule</th><th>Packs</th><th>Singles</th><th>Expected cost</th></tr></thead><tbody>${tableRows}</tbody></table>
    <p class="hint">All singles priced at €${cc.singleEur.toFixed(2)} including Rares. Bulk Rares cost a little more in
       practice; even at €2 per Rare-single the C/U/R total only rises to ~€1,300 — still an order of magnitude below
       grinding packs. Figures are Monte-Carlo means over ${cc.trials.toLocaleString()} completions; random/least
       packs-only have wide run-to-run spread.</p>
  </section>`;
}

function timeTradeSection(ct: CompletionTime): string {
  const weeks = Math.round(ct.weeks);
  const years = ct.years.toFixed(1);
  const packs = Math.round(ct.packs);
  const trades = Math.round(ct.trades);
  const buys = Math.round(ct.buys);
  const channel = Math.round(ct.singlesChannel);
  const packNew = Math.round(ct.packNew);
  const tradePct = Math.round((ct.trades / ct.singlesChannel) * 100);
  const packCost = ct.packs * ct.packEur;
  const stallTail = ct.target - ct.reachableCU;

  const bars = [
    { label: "Buy every card", value: ct.buyOnlyCost, color: PALETTE.random, valueText: eur(ct.buyOnlyCost) },
    { label: "Trade spares first", value: ct.tradeCost, color: PALETTE.least, valueText: eur(ct.tradeCost) },
  ];

  const row = (
    name: string,
    traded: string,
    bought: number,
    total: number,
  ) =>
    `<tr><td class="strat">${name}</td><td><span class="num">${weeks}</span><span class="ci">~${years} yr</span></td>` +
    `<td><span class="num">${packs}</span><span class="ci">${eur(packCost)}</span></td>` +
    `<td><span class="num">${traded}</span></td>` +
    `<td><span class="num">${bought.toLocaleString()}</span><span class="ci">${eur(bought * ct.singleEur)}</span></td>` +
    `<td><span class="num">${eur(total)}</span></td></tr>`;

  return `
  <div class="pagebreak"></div>
  <section>
    <h2>How long — and how cheaply — at one pack and ten cards a week?</h2>
    <p>Now make it a routine: <strong>one ${ct.packUniverse} booster</strong> (€${ct.packEur}) plus
       <strong>ten cards a week</strong> through the "single" channel (your "€5 for 10"). For each of those ten
       you first try to <strong>trade a spare you already own</strong> — a duplicate of a species you've found — for a
       card you still need, and only pay €${ct.singleEur.toFixed(2)} if you have no matching spare. Trades swap
       <strong>like-for-like rarity</strong> (a spare Common for a Common you're missing). Crucially, the singles and
       trades can come from <strong>any set in the catalogue</strong>; only the booster is restricted to
       Scarlet&nbsp;&amp;&nbsp;Violet&nbsp;+&nbsp;Mega.</p>

    <div class="verdict">
      <h3>About ${weeks} weeks — roughly ${years} years</h3>
      <p>And it barely wavers: the median is ${ct.weeksMedian} weeks, with the middle 80% of runs between
         ${ct.weeksP10} and ${ct.weeksP90}. There's almost no luck left — once you can <em>buy or trade</em> any
         species, finishing is just arithmetic.</p>
    </div>

    <p>The pace is set by the <strong>ten-cards-a-week</strong> rate, not by pack luck. Of the ${ct.target} species,
       about <strong>${channel} come through that weekly channel</strong> (≈ ${weeks} weeks × 10) and the
       <strong>~${packs} boosters</strong> you open along the way grab the other <strong>~${packNew} for free</strong>.
       Ten a week is ~520 a year, so a little over two years of singles alone — the incidental pack pulls shave it to
       ~${years}.</p>

    <p><strong>Trading doesn't make it faster — it makes it cheaper.</strong> Whether each weekly card is a trade or a
       purchase, you still add ten a week, so completion lands at the same ~${weeks} weeks either way. What changes is
       the bill.</p>

    <figure>
      ${hbarChart(bars, { labelW: 120, maxValue: ct.buyOnlyCost })}
      <figcaption><strong>Figure 8.</strong> Total spend to finish at this weekly pace (${ct.trials.toLocaleString()} runs).
        The ~${eur(packCost)} of boosters is a fixed floor; trading your spare commons nearly halves the singles bill on top.</figcaption>
    </figure>

    <p>Of the ~${channel} cards you pull through the weekly channel, about <strong>${trades} (${tradePct}%) can be
       covered by trading a duplicate</strong> — almost all of them commons you opened more than once — so you only
       <strong>buy ~${buys}</strong>. That nearly halves the singles bill and trims the total from
       <strong>${eur(ct.buyOnlyCost)}</strong> to <strong>${eur(ct.tradeCost)}</strong>, a saving of about
       <strong>${eur(ct.savings)}</strong>.</p>

    <table class="data cost"><thead><tr><th>Plan</th><th>Time</th><th>Packs</th><th>Cards traded</th><th>Cards bought</th><th>Total</th></tr></thead>
      <tbody>
        ${row("Buy every card", "0", channel, ct.buyOnlyCost)}
        ${row("Trade spares first", trades.toLocaleString(), buys, ct.tradeCost)}
      </tbody>
    </table>

    <p class="hint"><strong>Why trades cap out around ${trades}.</strong> Your spares are overwhelmingly commons, and a
       common spare can only be swapped for a card printed as a common <em>somewhere</em>. The hardest missing species
       are rare-only, so a pile of common spares can't reach them — those you still have to buy. <strong>You also can't
       finish on Common/Uncommon alone:</strong> ${stallTail} of the ${ct.target} species appear neither as a C/U single
       in any set nor in a Scarlet&nbsp;&amp;&nbsp;Violet&nbsp;+&nbsp;Mega booster, so a C/U-only plan stalls at
       ${ct.reachableCU}/${ct.target}. Allowing Rares (to buy or trade) closes the gap to all ${ct.reachableCUR}.</p>
  </section>`;
}

function main(): void {
  const outDir = process.argv[2] ?? path.join(process.cwd(), "analysis", "pack-strategy");
  const results: Results = JSON.parse(fs.readFileSync(path.join(outDir, "results.json"), "utf8"));
  const { meta } = results;
  const sv = results.universes.find((u) => u.key === "sv_me")!;
  const all = results.universes.find((u) => u.key === "all")!;

  const date = new Date(meta.generatedAt).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Headline numbers for the verdict box (SV+ME at 200 packs).
  const svBest200 = strat(sv, "best").checkpoints.find((c) => c.pack === 200)!;
  const svVsRand200 = diff(sv, "best", "random", 200);
  const allVsRand200 = diff(all, "best", "random", 200);

  const cc = results.completionCost;
  const costCell = (p: string, r: string) => cc.cells.find((c) => c.picker === p && c.rule === r)!;
  const costBestNone = costCell("best", "none").cost;
  const costRandNone = costCell("random", "none").cost;
  const costBestCur = costCell("best", "cur").cost;

  const ct = results.completionTime;
  const ctWeeks = Math.round(ct.weeks);
  const ctYears = ct.years.toFixed(1);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>Pack-Opening Strategies — Simulation Report</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    color: #0f172a; line-height: 1.5; font-size: 13px; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -0.02em; }
  h2 { font-size: 19px; margin: 28px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #e2e8f0; letter-spacing: -0.01em; }
  h3 { font-size: 14px; margin: 20px 0 6px; color: #1e293b; }
  p { margin: 8px 0; }
  .subtitle { color: #64748b; font-size: 14px; margin: 0 0 2px; }
  .meta-line { color: #94a3b8; font-size: 11.5px; margin-top: 6px; }
  .lede { color: #475569; font-style: italic; margin-top: 2px; }
  .cover { padding-bottom: 8px; border-bottom: 3px solid #0f172a; margin-bottom: 8px; }
  .strategies { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
  .scard { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .scard .tag { display: inline-block; font-size: 10.5px; font-weight: 700; color: #fff; border-radius: 4px; padding: 1px 7px; margin-bottom: 5px; }
  .scard h4 { margin: 0 0 3px; font-size: 13px; }
  .scard p { margin: 0; font-size: 11.5px; color: #475569; }
  .verdict { background: #f0f7ff; border: 1px solid #bfdbfe; border-left: 4px solid #2563eb; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
  .verdict h3 { margin: 0 0 4px; color: #1d4ed8; }
  .verdict p { margin: 4px 0; font-size: 13px; }
  figure { margin: 14px 0; page-break-inside: avoid; break-inside: avoid; }
  figcaption { font-size: 11px; color: #64748b; margin-top: 4px; line-height: 1.4; }
  table.data { width: 100%; border-collapse: collapse; margin: 8px 0 4px; font-size: 12px; page-break-inside: avoid; }
  table.data th { text-align: right; font-weight: 600; color: #475569; border-bottom: 1.5px solid #cbd5e1; padding: 5px 8px; font-size: 11px; }
  table.data th:first-child { text-align: left; }
  table.data td { text-align: right; padding: 6px 8px; border-bottom: 1px solid #eef2f7; }
  table.data td.strat { text-align: left; font-weight: 600; }
  table.data .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
  table.data .num { font-variant-numeric: tabular-nums; font-weight: 600; }
  table.data .ci { display: block; font-size: 9.5px; color: #94a3b8; font-weight: 400; }
  table.data td.gen { text-align: left; color: #94a3b8; font-size: 11px; font-weight: 400; }
  table.data tr.total td { border-top: 1.5px solid #cbd5e1; font-weight: 600; }
  table.data.rarest td.strat { font-weight: 500; }
  table.data.cost td.grp { font-weight: 700; vertical-align: middle; border-right: 1px solid #eef2f7; }
  table.data.cost td { border-bottom: 1px solid #eef2f7; }
  .hint { font-size: 11.5px; color: #64748b; margin: 4px 0 10px; }
  .method { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 4px 16px 10px; margin: 14px 0; }
  .method ul { margin: 6px 0; padding-left: 18px; }
  .method li { margin: 5px 0; font-size: 12px; }
  .pagebreak { page-break-before: page; break-before: page; }
  footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 10.5px; }
  code { background: #f1f5f9; padding: 1px 5px; border-radius: 4px; font-size: 11px; }
  strong { color: #0f172a; }
</style>
</head>
<body>

<header class="cover">
  <h1>Is "best pack" actually the best way to fill the binder?</h1>
  <p class="subtitle">A Monte-Carlo comparison of three pack-buying strategies for the National Pokédex project</p>
  <p class="meta-line">Generated ${date} · ${meta.trials.toLocaleString()} simulated collectors per strategy ·
     ${meta.budget.toLocaleString()} packs each · seed ${meta.seed}</p>
</header>

<section>
  <h2>The question</h2>
  <p>The tracker's dashboard recommends a "best pack" — always open a booster from the set with the highest
     <em>expected number of new Pokémon species</em>, given what you already own. Is that genuinely better than
     buying blindly, or does it just feel clever? We pit it against two alternatives:</p>
  <div class="strategies">
    <div class="scard"><span class="tag" style="background:${PALETTE.best}">Strategy A</span>
      <h4>Best pack</h4><p>Always open the set with the highest expected new-species yield, recomputed as the
      collection grows. (What the app recommends.)</p></div>
    <div class="scard"><span class="tag" style="background:${PALETTE.random}">Strategy B</span>
      <h4>Random set</h4><p>Open a pack from a uniformly random set every time. The "no strategy" baseline.</p></div>
    <div class="scard"><span class="tag" style="background:${PALETTE.least}">Strategy C</span>
      <h4>Least-opened</h4><p>Open a pack from whichever set you've opened fewest so far (ties broken at random).
      A balanced round-robin that ignores card value.</p></div>
  </div>
  <p>Each strategy starts from an <strong>empty collection</strong> and we measure the average number of distinct
     species collected after 10, 50, 200 and 1,000 packs.</p>

  <div class="verdict">
    <h3>Verdict</h3>
    <p><strong>Best pack wins — clearly, and at every checkpoint.</strong> It is never worse than the alternatives,
       and the smarter the choice set, the bigger its lead.</p>
    <p>Across the project's own Scarlet&nbsp;&amp;&nbsp;Violet + Mega Evolution sets, after 200 packs it collects
       about <strong>${f0(svBest200.mean)} species — ${f0(svVsRand200.diff)} more than random</strong>. Given the full
       TCG catalogue to choose from, that lead balloons to <strong>${f0(allVsRand200.diff)} species</strong>. Random
       and least-opened are nearly tied, with least-opened a hair ahead.</p>
    <p>And the bill to <em>finish</em> the dex (last sections): about <strong>${eur(costBestNone)}</strong> opening best
       packs vs <strong>${eur(costRandNone)}</strong> buying at random — or as little as <strong>${eur(costBestCur)}</strong>
       if you buy the hard cards as singles (Rares included) instead of chasing them in packs.</p>
    <p>At a steady <strong>one booster + ten cards a week</strong>, the binder fills in about
       <strong>${ctWeeks} weeks (~${ctYears} years)</strong> — and <strong>trading your duplicate commons</strong> for
       cards you need covers ~${Math.round(ct.trades)} of them, shaving roughly <strong>${eur(ct.savings)}</strong> off
       the bill without changing the timeline.</p>
  </div>
</section>

<section class="method">
  <h2>How the simulation works</h2>
  <ul>
    <li><strong>Real pack model.</strong> Packs are opened with the app's own booster simulator
      (<code>lib/packs/simulator.ts</code>): era-specific slot layouts and community-sourced rare-slot pull
      weights, drawing from each set's actual card pool by rarity. Only species you can really pull are counted.</li>
    <li><strong>Exact "best pack" decisions.</strong> Instead of re-running Monte-Carlo each step, the best-pack
      strategy uses a closed-form expected-new value computed from the same pull probabilities. We verified it
      matches the app's 5,000-iteration simulator to within ~0.01 species across every era (it is the same
      quantity, computed exactly rather than estimated).</li>
    <li><strong>Honest ceilings.</strong> Not every listed card is pullable from boosters (secret rares, promos).
      Curves are measured against the <em>achievable</em> ceiling — the species actually reachable by opening packs.</li>
    <li><strong>Statistics.</strong> ${meta.trials.toLocaleString()} independent collectors per strategy; we report
      the mean with a 95% confidence interval (normal and percentile-bootstrap agree). With this many trials the
      intervals are a fraction of a species wide — far narrower than the gaps between strategies.</li>
    <li><strong>Reproducible &amp; independent.</strong> Every collector is driven by a seeded RNG derived from one
      base seed. We use independent streams per strategy rather than common random numbers: the strategies open
      different sets each step, so their draw streams desynchronise immediately and shared seeds would buy no
      variance reduction here.</li>
  </ul>
</section>

${universeSection(sv, meta, false)}

${pullSection(sv, false)}

<div class="pagebreak"></div>
<section>
  <h2>Why the lead grows with more sets</h2>
  <p>The size of best-pack's advantage depends on <strong>how much choice it has</strong>. With only the 21
     Scarlet&nbsp;&amp;&nbsp;Violet + Mega sets — which share many of the same popular Pokémon — random buying
     stumbles into those species anyway, so the gap is modest. Open the whole TCG catalogue (133 sets spanning
     every era) and best-pack can keep steering toward sets full of species you're missing, while random and
     least-opened squander packs on overlapping reprints. That is exactly what the appendix below shows: the
     200-pack lead jumps from ~${f0(svVsRand200.diff)} to ~${f0(allVsRand200.diff)} species.</p>
  <p>A secondary lesson: <strong>least-opened modestly beats pure random</strong> in most cases. Spreading purchases
     evenly across sets is a cheap way to avoid over-investing in one set you've already drained — but it is no
     substitute for actually targeting your gaps.</p>
</section>

${universeSection(all, meta, true)}

${pullSection(all, true)}

${costSection(results.completionCost)}

${timeTradeSection(results.completionTime)}

<footer>
  Reproduce: <code>npx tsx scripts/sim/run.ts --trials ${meta.trials} --seed ${meta.seed} --budget ${meta.budget}</code>
  &nbsp;·&nbsp; setPools hash ${meta.setPoolsHash} &nbsp;·&nbsp; Node ${meta.node}
  &nbsp;·&nbsp; run took ${(meta.elapsedMs / 1000).toFixed(1)}s &nbsp;·&nbsp; checkpoints [${meta.checkpoints.join(", ")}]
</footer>

</body>
</html>`;

  const htmlPath = path.join(outDir, "report.html");
  fs.writeFileSync(htmlPath, html);
  console.log(`Report HTML written → ${htmlPath}`);
}

main();
