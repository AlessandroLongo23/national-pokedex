import { describe, expect, it } from "vitest";
import { computeKpis, type LedgerRow } from "@/lib/ledger/aggregates";

const base = {
  occurredAt: "2026-06-01T00:00:00.000Z",
  currency: "EUR" as const,
  rateToEur: 1,
  packId: null,
  cardId: null,
  quantity: null,
  note: null,
  psaSubmissionId: null,
  lotId: null,
};

describe("computeKpis with lot_purchase", () => {
  it("counts a lot_purchase as spend", () => {
    const rows: LedgerRow[] = [
      { ...base, id: "1", kind: "lot_purchase", amountCents: -12000, lotId: "lot-1" },
    ];
    const kpis = computeKpis(rows, "EUR", { EUR: 1, USD: 1.1 });
    expect(kpis.totalSpentCents).toBe(12000);
    expect(kpis.totalEarnedCents).toBe(0);
    expect(kpis.netCashFlowCents).toBe(-12000);
  });
});
