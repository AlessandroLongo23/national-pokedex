import { describe, it, expect } from "vitest";
import { buildUnpricedLotRows } from "@/app/(dashboard)/transactions/_lib/unpriced-lots";

const COUNTS = new Map<string, number>([
  ["lot-a", 10],
  ["lot-b", 20],
  ["lot-priced", 5],
]);

describe("buildUnpricedLotRows", () => {
  it("synthesizes a row only for lots without a lot_purchase transaction", () => {
    const rows = buildUnpricedLotRows(
      [
        { id: "lot-a", purchased_at: "2026-06-16T17:24:00Z" },
        { id: "lot-priced", purchased_at: "2026-06-12T17:21:00Z" },
        { id: "lot-b", purchased_at: "2026-06-08T19:05:00Z" },
      ],
      new Set(["lot-priced"]),
      COUNTS,
      "USD",
    );
    expect(rows.map((r) => r.lotId)).toEqual(["lot-a", "lot-b"]);
  });

  it("marks rows unpriced with a placeholder amount and the display currency", () => {
    const [r] = buildUnpricedLotRows(
      [{ id: "lot-a", purchased_at: "2026-06-16T17:24:00Z" }],
      new Set(),
      COUNTS,
      "DKK",
    );
    expect(r).toMatchObject({
      id: "lot-a",
      kind: "lot_purchase",
      lotId: "lot-a",
      occurredAt: "2026-06-16T17:24:00Z",
      amountCents: 0,
      currency: "DKK",
      unpriced: true,
      lotCardCount: 10,
    });
  });

  it("defaults an unknown card count to zero", () => {
    const [r] = buildUnpricedLotRows(
      [{ id: "lot-unknown", purchased_at: "2026-06-16T17:24:00Z" }],
      new Set(),
      new Map(),
      "USD",
    );
    expect(r?.lotCardCount).toBe(0);
  });

  it("returns an empty array when every lot is priced", () => {
    const rows = buildUnpricedLotRows(
      [{ id: "lot-priced", purchased_at: "2026-06-12T17:21:00Z" }],
      new Set(["lot-priced"]),
      COUNTS,
      "USD",
    );
    expect(rows).toEqual([]);
  });
});
