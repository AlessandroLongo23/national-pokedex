import { describe, it, expect } from "vitest";
import { cumulativeByDay } from "@/lib/data/cumulative-acquisitions";

describe("cumulativeByDay", () => {
  it("returns a cumulative card count for each UTC day in range", () => {
    const result = cumulativeByDay([
      { acquired_at: "2026-05-01T10:00:00Z" },
      { acquired_at: "2026-05-01T22:00:00Z" },
      { acquired_at: "2026-05-03T05:00:00Z" },
    ]);
    expect(result).toEqual([
      { date: "2026-05-01", count: 2 },
      { date: "2026-05-02", count: 2 },
      { date: "2026-05-03", count: 3 },
    ]);
  });

  it("returns an empty array when there are no rows", () => {
    expect(cumulativeByDay([])).toEqual([]);
  });

  it("collapses same-day rows into a single point", () => {
    const r = cumulativeByDay([{ acquired_at: "2026-01-15T12:00:00Z" }]);
    expect(r).toEqual([{ date: "2026-01-15", count: 1 }]);
  });

  it("orders by date even when rows arrive out of order", () => {
    const r = cumulativeByDay([
      { acquired_at: "2026-05-03T00:00:00Z" },
      { acquired_at: "2026-05-01T00:00:00Z" },
      { acquired_at: "2026-05-02T00:00:00Z" },
    ]);
    expect(r.map((p) => p.date)).toEqual([
      "2026-05-01",
      "2026-05-02",
      "2026-05-03",
    ]);
    expect(r.map((p) => p.count)).toEqual([1, 2, 3]);
  });
});
