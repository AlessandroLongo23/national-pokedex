import { describe, it, expect } from "vitest";
import {
  computeKpis,
  computeNetPositionCents,
  type LedgerRow,
} from "@/lib/ledger/aggregates";

function row(partial: Partial<LedgerRow> & { amountCents: number }): LedgerRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    kind: "pack_purchase",
    occurredAt: "2026-05-19T12:00:00Z",
    currency: "USD",
    packId: null,
    cardId: null,
    quantity: null,
    note: null,
    psaSubmissionId: null,
    ...partial,
  };
}

describe("computeKpis", () => {
  it("returns all zeros for an empty ledger", () => {
    expect(computeKpis([], "USD")).toEqual({
      totalSpentCents: 0,
      totalEarnedCents: 0,
      netCashFlowCents: 0,
      excludedCount: 0,
    });
  });

  it("treats negative amounts as spent and positive as earned", () => {
    const kpis = computeKpis(
      [
        row({ amountCents: -449 }),
        row({ amountCents: -250, kind: "single_purchase" }),
        row({ amountCents: 1200, kind: "sale" }),
      ],
      "USD",
    );
    expect(kpis.totalSpentCents).toBe(699);
    expect(kpis.totalEarnedCents).toBe(1200);
    expect(kpis.netCashFlowCents).toBe(501);
    expect(kpis.excludedCount).toBe(0);
  });

  it("excludes rows in a different currency from totals", () => {
    const kpis = computeKpis(
      [
        row({ amountCents: -1000, currency: "USD" }),
        row({ amountCents: -800, currency: "EUR" }),
        row({ amountCents: -300, currency: "EUR" }),
      ],
      "USD",
    );
    expect(kpis.totalSpentCents).toBe(1000);
    expect(kpis.totalEarnedCents).toBe(0);
    expect(kpis.netCashFlowCents).toBe(-1000);
    expect(kpis.excludedCount).toBe(2);
  });
});

describe("computeNetPositionCents", () => {
  it("adds net cash flow (typically negative) to held value", () => {
    const kpis = computeKpis(
      [row({ amountCents: -2000 }), row({ amountCents: 500, kind: "sale" })],
      "USD",
    );
    // Net cash flow = -1500. Holding $40 of cards means net position $25.
    expect(computeNetPositionCents(kpis, 4000)).toBe(2500);
  });

  it("returns held value alone when no transactions exist", () => {
    expect(computeNetPositionCents(computeKpis([], "USD"), 1234)).toBe(1234);
  });
});
