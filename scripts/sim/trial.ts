// Runs ONE collector trajectory: open `budget` packs under a given strategy,
// starting from an empty collection, and record the distinct-species count
// after every pack (plus snapshots and wasted-pack counts at checkpoints).
//
// The checkpoints (10/50/200/1000) are nested, so one 1000-pack trajectory
// yields all four data points — no need to re-run for each budget.

import { SET_POOLS } from "@/lib/data";
import type { SetInfo, SetRarityPool } from "@/lib/data/types";
import { slotsForSeries, type PackSlot } from "@/lib/packs/pack-structure";
import { simulatePack } from "@/lib/packs/simulator";
import type { ExpectedNewModel } from "./analytic";
import { createInitialState, type Picker } from "./strategies";

export interface SetEngine {
  pool: SetRarityPool;
  slots: PackSlot[];
}

// Precompute pool + slot layout for each candidate set once, so the per-pack
// loop never re-derives them.
export function buildEngines(candidateSets: SetInfo[]): Map<string, SetEngine> {
  const engines = new Map<string, SetEngine>();
  for (const set of candidateSets) {
    engines.set(set.id, {
      pool: SET_POOLS[set.id]!,
      slots: slotsForSeries(set.series),
    });
  }
  return engines;
}

export interface RunOpts {
  budget?: number;
  checkpoints?: number[];
}

export interface TrajectoryResult {
  // distinct species owned after each pack (length = budget)
  curve: number[];
  // cumulative count of "wasted" packs (0 new species) after each pack
  wastedCurve: number[];
  checkpoints: number[];
  // distinct species owned at each checkpoint
  speciesAt: number[];
  // cumulative count of "wasted" packs (0 new species) at each checkpoint
  wastedAt: number[];
}

export function runTrajectory(
  picker: Picker,
  model: ExpectedNewModel,
  engines: Map<string, SetEngine>,
  rng: () => number,
  opts: RunOpts = {},
): TrajectoryResult {
  const budget = opts.budget ?? 1000;
  const checkpoints = opts.checkpoints ?? [10, 50, 200, 1000];

  const state = createInitialState(model);
  const candidates = model.candidateSets;
  const curve: number[] = new Array(budget);
  const wastedCurve: number[] = new Array(budget);
  let wasted = 0;
  const speciesAt: number[] = new Array(checkpoints.length);
  const wastedAt: number[] = new Array(checkpoints.length);
  const checkpointAtPack = new Map<number, number>();
  checkpoints.forEach((c, i) => checkpointAtPack.set(c, i));

  for (let p = 1; p <= budget; p++) {
    const set = picker(state, candidates, rng);
    const engine = engines.get(set.id)!;
    const pulled = simulatePack(engine.pool, engine.slots, rng);

    let newThisPack = 0;
    for (const dex of pulled) {
      if (state.owned.has(dex)) continue;
      state.owned.add(dex);
      newThisPack++;
      // Subtract this species' contribution from every set that can yield it.
      const sets = model.speciesToSets.get(dex);
      if (sets) {
        for (const sid of sets) {
          const pmap = model.pSetBySet.get(sid)!;
          const contrib = pmap.get(dex) ?? 0;
          state.expectedNewRemaining.set(sid, (state.expectedNewRemaining.get(sid) ?? 0) - contrib);
        }
      }
    }
    state.packsBySet.set(set.id, (state.packsBySet.get(set.id) ?? 0) + 1);
    if (newThisPack === 0) wasted++;

    curve[p - 1] = state.owned.size;
    wastedCurve[p - 1] = wasted;
    const ci = checkpointAtPack.get(p);
    if (ci !== undefined) {
      speciesAt[ci] = state.owned.size;
      wastedAt[ci] = wasted;
    }
  }

  return { curve, wastedCurve, checkpoints, speciesAt, wastedAt };
}
