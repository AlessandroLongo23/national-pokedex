import { describe, expect, it } from "vitest";
import { diffLotContents } from "@/app/(dashboard)/_lib/lot-contents";

describe("diffLotContents", () => {
  it("treats every next card as an upsert with a positive delta when nothing existed", () => {
    const r = diffLotContents(new Map(), new Map([["a", 2], ["b", 1]]));
    expect(r.upserts).toEqual([{ cardId: "a", quantity: 2 }, { cardId: "b", quantity: 1 }]);
    expect(r.removals).toEqual([]);
    expect(r.deltaCardIds).toEqual(["a", "b"]);
    expect(r.deltas).toEqual([2, 1]);
  });

  it("computes per-card net deltas for quantity changes", () => {
    const r = diffLotContents(new Map([["a", 2], ["b", 3]]), new Map([["a", 3], ["b", 1]]));
    expect(r.upserts).toEqual([{ cardId: "a", quantity: 3 }, { cardId: "b", quantity: 1 }]);
    expect(r.removals).toEqual([]);
    expect(r.deltaCardIds).toEqual(["a", "b"]);
    expect(r.deltas).toEqual([1, -2]);
  });

  it("emits a removal and a negative delta for a dropped card", () => {
    const r = diffLotContents(new Map([["a", 2], ["b", 1]]), new Map([["a", 2]]));
    expect(r.upserts).toEqual([]); // a unchanged, b removed
    expect(r.removals).toEqual(["b"]);
    expect(r.deltaCardIds).toEqual(["b"]);
    expect(r.deltas).toEqual([-1]);
  });

  it("ignores unchanged cards entirely", () => {
    const r = diffLotContents(new Map([["a", 2]]), new Map([["a", 2]]));
    expect(r.upserts).toEqual([]);
    expect(r.removals).toEqual([]);
    expect(r.deltaCardIds).toEqual([]);
    expect(r.deltas).toEqual([]);
  });
});
