import { describe, it, expect } from "vitest";
import { computeGreedyOrder } from "@/scripts/ingest/greedy";
import type { SetInfo } from "@/lib/data/types";

const sets: SetInfo[] = [
  {
    id: "a",
    name: "Set A",
    series: "Scarlet & Violet",
    releaseDate: "2023-01-01",
    dexNumbers: [1, 2, 3],
    uniqueCount: 0,
    distinctPokemonCount: 3,
  },
  {
    id: "b",
    name: "Set B",
    series: "Scarlet & Violet",
    releaseDate: "2023-02-01",
    dexNumbers: [3, 4, 5, 6],
    uniqueCount: 0,
    distinctPokemonCount: 4,
  },
  {
    id: "c",
    name: "Set C",
    series: "Mega Evolution",
    releaseDate: "2025-09-26",
    dexNumbers: [1, 2, 3],
    uniqueCount: 0,
    distinctPokemonCount: 3,
  },
];

describe("computeGreedyOrder", () => {
  const order = computeGreedyOrder(sets);

  it("first pick is the largest set", () => {
    expect(order[0]?.setId).toBe("b");
    expect(order[0]?.newCount).toBe(4);
    expect(order[0]?.cumulative).toBe(4);
  });

  it("subsequent picks add only NEW dex numbers", () => {
    expect(order[1]?.setId).toBe("a");
    expect(order[1]?.newCount).toBe(2);
    expect(order[1]?.cumulative).toBe(6);
  });

  it("set that adds zero new still appears at the end", () => {
    expect(order[2]?.setId).toBe("c");
    expect(order[2]?.newCount).toBe(0);
    expect(order[2]?.cumulative).toBe(6);
  });

  it("ranks are 1-indexed and sequential", () => {
    expect(order.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("ties are broken by earlier release date", () => {
    const tied: SetInfo[] = [
      { ...sets[0]!, id: "x", releaseDate: "2024-01-01", dexNumbers: [10, 11] },
      { ...sets[0]!, id: "y", releaseDate: "2023-06-01", dexNumbers: [20, 21] },
    ];
    const tieOrder = computeGreedyOrder(tied);
    expect(tieOrder[0]?.setId).toBe("y");
  });
});
