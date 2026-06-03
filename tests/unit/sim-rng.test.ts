import { describe, it, expect } from "vitest";
import { mulberry32, deriveSeed } from "@/scripts/sim/rng";

describe("mulberry32", () => {
  it("is deterministic — same seed yields the same sequence", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("produces floats in [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("different seeds yield different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it("is roughly uniform (mean near 0.5 over many draws)", () => {
    const r = mulberry32(99);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) sum += r();
    const mean = sum / n;
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.01);
  });
});

describe("deriveSeed", () => {
  it("is deterministic for the same inputs", () => {
    expect(deriveSeed(1234, 0, 5)).toBe(deriveSeed(1234, 0, 5));
  });

  it("produces distinct seeds across strategies and trials", () => {
    const seeds = new Set<number>();
    for (let strat = 0; strat < 3; strat++) {
      for (let trial = 0; trial < 2000; trial++) {
        seeds.add(deriveSeed(1234, strat, trial));
      }
    }
    // No collisions across the full experiment grid.
    expect(seeds.size).toBe(3 * 2000);
  });

  it("returns a 32-bit unsigned integer", () => {
    const s = deriveSeed(987654321, 2, 1999);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});
