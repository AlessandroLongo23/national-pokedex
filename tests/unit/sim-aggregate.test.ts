import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/scripts/sim/rng";
import {
  mean,
  sampleStd,
  summarize,
  bootstrapCI,
  diffStat,
  elementwiseMean,
  elementwiseStd,
} from "@/scripts/sim/aggregate";

describe("mean / sampleStd", () => {
  it("mean is the arithmetic average", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });
  it("sampleStd uses the n-1 (Bessel) denominator", () => {
    expect(sampleStd([1, 2, 3])).toBeCloseTo(1, 12); // var = 2/2 = 1
  });
  it("sampleStd of a constant array is 0", () => {
    expect(sampleStd([5, 5, 5, 5])).toBe(0);
  });
});

describe("summarize", () => {
  it("reports n, mean, std, se, and a 1.96-z normal CI", () => {
    const s = summarize([1, 2, 3]);
    expect(s.n).toBe(3);
    expect(s.mean).toBeCloseTo(2, 12);
    expect(s.std).toBeCloseTo(1, 12);
    expect(s.se).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(s.ciLo).toBeCloseTo(2 - 1.96 * (1 / Math.sqrt(3)), 12);
    expect(s.ciHi).toBeCloseTo(2 + 1.96 * (1 / Math.sqrt(3)), 12);
  });
});

describe("bootstrapCI", () => {
  it("a constant sample has a degenerate CI equal to the constant", () => {
    const ci = bootstrapCI([7, 7, 7, 7], mulberry32(1), 500);
    expect(ci.lo).toBeCloseTo(7, 12);
    expect(ci.hi).toBeCloseTo(7, 12);
  });
  it("brackets the sample mean and is reproducible", () => {
    const xs = Array.from({ length: 500 }, (_, i) => (i % 10));
    const m = mean(xs);
    const a = bootstrapCI(xs, mulberry32(42), 2000);
    const b = bootstrapCI(xs, mulberry32(42), 2000);
    expect(a).toEqual(b); // reproducible with the same seed
    expect(a.lo).toBeLessThanOrEqual(m);
    expect(a.hi).toBeGreaterThanOrEqual(m);
  });
});

describe("diffStat (unpaired difference of means)", () => {
  it("computes a - b with a combined standard error", () => {
    const d = diffStat([3, 3, 3], [1, 1, 1]);
    expect(d.diff).toBeCloseTo(2, 12);
    expect(d.se).toBeCloseTo(0, 12);
    expect(d.ciLo).toBeCloseTo(2, 12);
    expect(d.ciHi).toBeCloseTo(2, 12);
  });
  it("combines SEs in quadrature", () => {
    const a = [0, 2, 0, 2, 0, 2]; // mean 1
    const b = [10, 12, 10, 12, 10, 12]; // mean 11
    const d = diffStat(a, b);
    expect(d.diff).toBeCloseTo(-10, 12);
    const seA = summarize(a).se;
    const seB = summarize(b).se;
    expect(d.se).toBeCloseTo(Math.sqrt(seA * seA + seB * seB), 12);
  });
});

describe("elementwise curve aggregation", () => {
  it("elementwiseMean averages position by position", () => {
    expect(elementwiseMean([[1, 2], [3, 4]])).toEqual([2, 3]);
  });
  it("elementwiseStd is the per-position sample std", () => {
    const out = elementwiseStd([[1, 10], [3, 10]]);
    expect(out[0]).toBeCloseTo(sampleStd([1, 3]), 12);
    expect(out[1]).toBeCloseTo(0, 12);
  });
});
