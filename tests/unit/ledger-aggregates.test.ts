import { describe, it, expect } from "vitest";
import {
  computeKpis,
  computeNetPositionCents,
  type LedgerRow,
} from "@/lib/ledger/aggregates";
import type { Currency } from "@/lib/pricing/currencies";

// Rates anchored to a deterministic snapshot so the conversion-aware
// aggregator can be exercised without hitting Frankfurter in tests.
// "1 EUR = X" — picked roughly from mid-2025 ECB values; tests use
// round-numbered amounts so the math stays human-checkable.
const RATES: Record<Currency, number> = {
  EUR: 1,
  USD: 1.10,
  GBP: 0.85,
} as Record<Currency, number>;

function row(partial: Partial<LedgerRow> & { amountCents: number }): LedgerRow {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    kind: "pack_purchase",
    occurredAt: "2026-05-19T12:00:00Z",
    currency: "USD",
    rateToEur: null,
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
    expect(computeKpis([], "USD", RATES)).toEqual({
      totalSpentCents: 0,
      totalEarnedCents: 0,
      netCashFlowCents: 0,
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
      RATES,
    );
    expect(kpis.totalSpentCents).toBe(699);
    expect(kpis.totalEarnedCents).toBe(1200);
    expect(kpis.netCashFlowCents).toBe(501);
  });

  it("converts rows in a different currency using their snapshot rate", () => {
    // 1000 USD with snapshot rate_to_eur = 1/1.10 ≈ 0.9091
    //   → 909 EUR-cents → at "1 EUR = 1.10 USD" today → ~1000 USD-cents
    // 800 EUR rateToEur=1 → 800 EUR-cents → ~880 USD-cents
    const kpis = computeKpis(
      [
        row({ amountCents: -1000, currency: "USD", rateToEur: 1 / 1.10 }),
        row({ amountCents: -800, currency: "EUR", rateToEur: 1 }),
      ],
      "USD",
      RATES,
    );
    expect(kpis.totalSpentCents).toBe(1000 + 880);
    expect(kpis.totalEarnedCents).toBe(0);
    expect(kpis.netCashFlowCents).toBe(-1880);
  });

  it("falls back to today's rate when rateToEur is null", () => {
    // 800 EUR with null snapshot → snapshot becomes 1 (EUR is base),
    // converted to USD at 1.10 → 880 USD-cents.
    const kpis = computeKpis(
      [row({ amountCents: -800, currency: "EUR", rateToEur: null })],
      "USD",
      RATES,
    );
    expect(kpis.totalSpentCents).toBe(880);
  });
});

describe("computeNetPositionCents", () => {
  it("adds net cash flow (typically negative) to held value", () => {
    const kpis = computeKpis(
      [row({ amountCents: -2000 }), row({ amountCents: 500, kind: "sale" })],
      "USD",
      RATES,
    );
    // Net cash flow = -1500. Holding $40 of cards means net position $25.
    expect(computeNetPositionCents(kpis, 4000)).toBe(2500);
  });

  it("returns held value alone when no transactions exist", () => {
    expect(computeNetPositionCents(computeKpis([], "USD", RATES), 1234)).toBe(
      1234,
    );
  });
});
