// Detailed pull instrumentation. lib/packs/simulator.ts only returns the SET of
// distinct species pulled; here we open packs while recording every card's
// rarity bucket, supertype and slot, so we can report rarity mixes, pack
// composition, duplicates, and per-species pull frequencies.
//
// simulatePackDetailed mirrors simulatePack's RNG consumption EXACTLY (verified
// in tests/unit/sim-pulls.test.ts), so its pulls are the same draws — just with
// the detail the app's version throws away.

import type {
  RarityBucket,
  RarityPoolCard,
  SetRarityPool,
  Supertype,
} from "@/lib/data/types";
import type { PackSlot, SlotKind } from "@/lib/packs/pack-structure";
import { createInitialState, type Picker } from "./strategies";
import type { ExpectedNewModel } from "./analytic";
import type { SetEngine, RunOpts } from "./trial";

export const RARITY_BUCKETS: RarityBucket[] = [
  "Common",
  "Uncommon",
  "Rare",
  "DoubleRare",
  "UltraRare",
  "IllustrationRare",
  "SpecialIllustrationRare",
  "HyperRare",
];
const BUCKET_INDEX: Record<RarityBucket, number> = Object.fromEntries(
  RARITY_BUCKETS.map((b, i) => [b, i]),
) as Record<RarityBucket, number>;

export interface PulledCard {
  bucket: RarityBucket;
  supertype: Supertype;
  dex: number[];
  slotKind: SlotKind;
}

// ── RNG-faithful draw primitives (1:1 with lib/packs/simulator.ts internals) ──
function pickBucketWeighted(
  weights: Partial<Record<RarityBucket, number>>,
  rng: () => number,
): RarityBucket {
  let total = 0;
  for (const w of Object.values(weights)) total += w ?? 0;
  let r = rng() * total;
  for (const [bucket, w] of Object.entries(weights)) {
    r -= w ?? 0;
    if (r <= 0) return bucket as RarityBucket;
  }
  return Object.keys(weights)[0] as RarityBucket;
}

function pickFromBucket(
  pool: SetRarityPool,
  bucket: RarityBucket,
  rng: () => number,
): { card: RarityPoolCard; bucket: RarityBucket } | null {
  const cards = pool[bucket];
  if (cards.length === 0) return null;
  const c = cards[Math.floor(rng() * cards.length)];
  return c ? { card: c, bucket } : null;
}

function pickFromReverse(
  pool: SetRarityPool,
  buckets: ReadonlyArray<RarityBucket>,
  rng: () => number,
): { card: RarityPoolCard; bucket: RarityBucket } | null {
  const flat: { card: RarityPoolCard; bucket: RarityBucket }[] = [];
  for (const b of buckets) for (const c of pool[b]) flat.push({ card: c, bucket: b });
  if (flat.length === 0) return null;
  return flat[Math.floor(rng() * flat.length)] ?? null;
}

export function simulatePackDetailed(
  pool: SetRarityPool,
  slots: PackSlot[],
  rng: () => number,
): PulledCard[] {
  const out: PulledCard[] = [];
  for (const slot of slots) {
    for (let i = 0; i < slot.count; i++) {
      let picked: { card: RarityPoolCard; bucket: RarityBucket } | null = null;
      if (slot.kind === "uniform") {
        picked = pickFromBucket(pool, slot.from, rng);
      } else if (slot.kind === "weighted") {
        const chosen = pickBucketWeighted(slot.weights, rng);
        picked = pickFromBucket(pool, chosen, rng);
        if (!picked) picked = pickFromBucket(pool, "Rare", rng); // fallback, like the app
      } else {
        picked = pickFromReverse(pool, slot.pool, rng);
      }
      if (!picked) continue;
      out.push({
        bucket: picked.bucket,
        supertype: picked.card.supertype,
        dex: picked.card.dex,
        slotKind: slot.kind,
      });
    }
  }
  return out;
}

export interface CensusCheckpoint {
  pack: number;
  rarity: number[]; // cumulative cards by RARITY_BUCKETS index
  pokemon: number;
  trainer: number;
  energy: number;
  distinctSpecies: number;
}

export interface PullCensusResult {
  checkpoints: CensusCheckpoint[];
  rareSlot: number[]; // distribution of the weighted "rare slot" card, by bucket
  speciesPulls: number[]; // copies pulled per dex (index = dex number)
  totalCards: number;
}

// Open `budget` packs under a strategy, recording full pull detail. Mirrors the
// owned-state / expected-new bookkeeping of trial.ts so the best-pack picker
// behaves identically.
export function runPullCensus(
  picker: Picker,
  model: ExpectedNewModel,
  engines: Map<string, SetEngine>,
  rng: () => number,
  opts: RunOpts = {},
): PullCensusResult {
  const budget = opts.budget ?? 1000;
  const checkpoints = opts.checkpoints ?? [10, 50, 200, 1000];
  const checkpointAtPack = new Map<number, number>();
  checkpoints.forEach((c, i) => checkpointAtPack.set(c, i));

  const state = createInitialState(model);
  const candidates = model.candidateSets;

  const rarity = new Array(RARITY_BUCKETS.length).fill(0);
  const rareSlot = new Array(RARITY_BUCKETS.length).fill(0);
  const speciesPulls: number[] = [];
  let pokemon = 0;
  let trainer = 0;
  let energy = 0;
  let totalCards = 0;
  const cpResults: CensusCheckpoint[] = new Array(checkpoints.length);

  for (let p = 1; p <= budget; p++) {
    const set = picker(state, candidates, rng);
    const engine = engines.get(set.id)!;
    const cards = simulatePackDetailed(engine.pool, engine.slots, rng);

    for (const card of cards) {
      totalCards++;
      rarity[BUCKET_INDEX[card.bucket]]++;
      if (card.slotKind === "weighted") rareSlot[BUCKET_INDEX[card.bucket]]++;
      if (card.supertype === "Pokémon") {
        pokemon++;
        for (const dex of card.dex) {
          speciesPulls[dex] = (speciesPulls[dex] ?? 0) + 1;
          if (!state.owned.has(dex)) {
            state.owned.add(dex);
            const sets = model.speciesToSets.get(dex);
            if (sets) {
              for (const sid of sets) {
                const contrib = model.pSetBySet.get(sid)!.get(dex) ?? 0;
                state.expectedNewRemaining.set(
                  sid,
                  (state.expectedNewRemaining.get(sid) ?? 0) - contrib,
                );
              }
            }
          }
        }
      } else if (card.supertype === "Trainer") {
        trainer++;
      } else {
        energy++;
      }
    }
    state.packsBySet.set(set.id, (state.packsBySet.get(set.id) ?? 0) + 1);

    const ci = checkpointAtPack.get(p);
    if (ci !== undefined) {
      cpResults[ci] = {
        pack: p,
        rarity: rarity.slice(),
        pokemon,
        trainer,
        energy,
        distinctSpecies: state.owned.size,
      };
    }
  }

  // Normalize speciesPulls into a dense array (fill holes with 0).
  const dense: number[] = [];
  for (let d = 0; d < speciesPulls.length; d++) dense[d] = speciesPulls[d] ?? 0;

  return { checkpoints: cpResults, rareSlot, speciesPulls: dense, totalCards };
}
