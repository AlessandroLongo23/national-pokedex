import type { RarityBucket, RarityPoolCard, SetRarityPool } from "@/lib/data/types";
import type { PackSlot } from "./pack-structure";

export interface SimulationResult {
  expectedNew: number;
  probAtLeastOneNew: number;
  iterations: number;
}

// Deterministic xorshift32 — same seed produces the same simulation, so a
// re-render with unchanged owned-state doesn't flicker numbers.
function makeRng(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 0xffffffff) / 0xffffffff;
  };
}

function hashSeed(setId: string, ownedSize: number, iterations: number): number {
  let h = iterations | 0;
  for (let i = 0; i < setId.length; i++) {
    h = (h * 31 + setId.charCodeAt(i)) | 0;
  }
  h = (h * 31 + ownedSize) | 0;
  return h >>> 0;
}

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
  // Fallback to the first bucket; unreachable if weights are present.
  return Object.keys(weights)[0] as RarityBucket;
}

function pickFromBucket(
  pool: SetRarityPool,
  bucket: RarityBucket,
  rng: () => number,
): RarityPoolCard | null {
  const cards = pool[bucket];
  if (cards.length === 0) return null;
  return cards[Math.floor(rng() * cards.length)] ?? null;
}

function pickFromReverse(
  pool: SetRarityPool,
  buckets: ReadonlyArray<RarityBucket>,
  rng: () => number,
): RarityPoolCard | null {
  // Flatten across reverse-eligible buckets and pick uniformly.
  const flat: RarityPoolCard[] = [];
  for (const b of buckets) flat.push(...pool[b]);
  if (flat.length === 0) return null;
  return flat[Math.floor(rng() * flat.length)] ?? null;
}

export function simulatePack(
  pool: SetRarityPool,
  slots: PackSlot[],
  rng: () => number,
): Set<number> {
  const pulled = new Set<number>();
  for (const slot of slots) {
    for (let i = 0; i < slot.count; i++) {
      let card: RarityPoolCard | null = null;
      if (slot.kind === "uniform") {
        card = pickFromBucket(pool, slot.from, rng);
      } else if (slot.kind === "weighted") {
        const bucket = pickBucketWeighted(slot.weights, rng);
        card = pickFromBucket(pool, bucket, rng);
        // Fall back to plain Rare if the chosen bucket is empty for this set
        // (e.g. a Build & Battle promo set with no Hyper Rares).
        if (!card) card = pickFromBucket(pool, "Rare", rng);
      } else {
        card = pickFromReverse(pool, slot.pool, rng);
      }
      if (!card) continue;
      if (card.supertype !== "Pokémon") continue;
      for (const d of card.dex) pulled.add(d);
    }
  }
  return pulled;
}

export function simulateSet(
  setId: string,
  pool: SetRarityPool,
  slots: PackSlot[],
  owned: Set<number>,
  iterations = 5000,
): SimulationResult {
  const rng = makeRng(hashSeed(setId, owned.size, iterations));
  let totalNew = 0;
  let packsWithAtLeastOne = 0;

  for (let i = 0; i < iterations; i++) {
    const pulled = simulatePack(pool, slots, rng);
    let newCount = 0;
    for (const dex of pulled) if (!owned.has(dex)) newCount++;
    if (newCount > 0) packsWithAtLeastOne++;
    totalNew += newCount;
  }

  return {
    expectedNew: totalNew / iterations,
    probAtLeastOneNew: packsWithAtLeastOne / iterations,
    iterations,
  };
}
