// Seedable, reproducible PRNG for the pack-strategy simulation.
//
// mulberry32 is a small, fast, well-distributed 32-bit generator. We use our
// own RNG (rather than the xorshift32 inside lib/packs/simulator.ts) so a whole
// experiment is reproducible from a single base seed: the same seed reproduces
// every realized pack opening AND every random tie-break.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Derive a distinct, well-mixed 32-bit seed for each (strategy, trial) cell of
// the experiment from one human-chosen base seed. Mixing constants are the
// usual Knuth/Murmur-style odd multipliers.
export function deriveSeed(base: number, strategyIdx: number, trial: number): number {
  let h = base >>> 0;
  h = Math.imul(h ^ (strategyIdx + 0x9e3779b9), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (trial + 0x85ebca6b), 0x85ebca77) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}
