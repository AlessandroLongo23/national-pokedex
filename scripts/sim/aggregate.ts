// Statistics helpers for aggregating Monte-Carlo trial results.

const Z_95 = 1.96;

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

// Sample standard deviation (Bessel-corrected, n-1 denominator).
export function sampleStd(xs: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return Math.sqrt(ss / (n - 1));
}

export interface Stat {
  n: number;
  mean: number;
  std: number;
  se: number;
  ciLo: number;
  ciHi: number;
}

// Normal-approximation summary: mean ± 1.96·SE.
export function summarize(xs: number[]): Stat {
  const n = xs.length;
  const m = mean(xs);
  const std = sampleStd(xs);
  const se = n > 0 ? std / Math.sqrt(n) : 0;
  return { n, mean: m, std, se, ciLo: m - Z_95 * se, ciHi: m + Z_95 * se };
}

// Percentile bootstrap CI for the mean: resample with replacement `reps` times,
// take the alpha/2 and 1-alpha/2 quantiles of the resample means.
export function bootstrapCI(
  xs: number[],
  rng: () => number,
  reps = 2000,
  alpha = 0.05,
): { lo: number; hi: number } {
  const n = xs.length;
  if (n === 0) return { lo: 0, hi: 0 };
  const means: number[] = new Array(reps);
  for (let r = 0; r < reps; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += xs[Math.floor(rng() * n)]!;
    }
    means[r] = s / n;
  }
  means.sort((a, b) => a - b);
  const loIdx = Math.floor((alpha / 2) * reps);
  const hiIdx = Math.min(reps - 1, Math.ceil((1 - alpha / 2) * reps) - 1);
  return { lo: means[loIdx]!, hi: means[hiIdx]! };
}

export interface DiffStat {
  diff: number;
  se: number;
  ciLo: number;
  ciHi: number;
}

// Unpaired difference of means a - b, with SEs combined in quadrature.
// (We use independent RNG streams per strategy, so the two samples are
// independent — see run.ts / the report's methodology note on why CRN is not
// used here.)
export function diffStat(a: number[], b: number[]): DiffStat {
  const sa = summarize(a);
  const sb = summarize(b);
  const diff = sa.mean - sb.mean;
  const se = Math.sqrt(sa.se * sa.se + sb.se * sb.se);
  return { diff, se, ciLo: diff - Z_95 * se, ciHi: diff + Z_95 * se };
}

// Average a list of equal-length curves position by position.
export function elementwiseMean(curves: number[][]): number[] {
  if (curves.length === 0) return [];
  const len = curves[0]!.length;
  const out = new Array(len).fill(0);
  for (const c of curves) for (let i = 0; i < len; i++) out[i] += c[i]!;
  for (let i = 0; i < len; i++) out[i] /= curves.length;
  return out;
}

// Per-position sample std across a list of equal-length curves.
export function elementwiseStd(curves: number[][]): number[] {
  if (curves.length === 0) return [];
  const len = curves[0]!.length;
  const out = new Array(len);
  for (let i = 0; i < len; i++) {
    const col = curves.map((c) => c[i]!);
    out[i] = sampleStd(col);
  }
  return out;
}
