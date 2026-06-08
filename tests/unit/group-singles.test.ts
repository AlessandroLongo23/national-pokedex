import { describe, expect, it } from "vitest";
import { majorityCurrency, suggestedLotTotalCents } from "@/app/(dashboard)/_lib/group-singles";
import type { Currency } from "@/lib/pricing/currencies";

const RATES = { EUR: 1, USD: 1.1 } as unknown as Record<Currency, number>;

describe("majorityCurrency", () => {
  it("returns the most common currency", () => {
    expect(majorityCurrency(["USD", "EUR", "USD"])).toBe("USD");
  });
  it("returns the first seen on a tie", () => {
    expect(majorityCurrency(["EUR", "USD"])).toBe("EUR");
  });
  it("returns null for an empty list", () => {
    expect(majorityCurrency([])).toBeNull();
  });
});

describe("suggestedLotTotalCents", () => {
  it("sums exactly when all rows share the target currency", () => {
    const rows = [
      { amountCents: -736, currency: "EUR" as Currency, rateToEur: 1 },
      { amountCents: -40, currency: "EUR" as Currency, rateToEur: 1 },
    ];
    expect(suggestedLotTotalCents(rows, "EUR", RATES)).toBe(776);
  });
  it("converts other-currency rows into the target via snapshot rate", () => {
    // 100 USD cents at rate_to_eur 0.5 -> 50 EUR cents; + 200 EUR cents = 250.
    const rows = [
      { amountCents: -100, currency: "USD" as Currency, rateToEur: 0.5 },
      { amountCents: -200, currency: "EUR" as Currency, rateToEur: 1 },
    ];
    expect(suggestedLotTotalCents(rows, "EUR", RATES)).toBe(250);
  });
  it("skips rows whose conversion is impossible (best-effort)", () => {
    const rows = [
      { amountCents: -500, currency: "EUR" as Currency, rateToEur: 1 },
      { amountCents: -999, currency: "GBP" as Currency, rateToEur: null }, // no rate, not in RATES
    ];
    expect(suggestedLotTotalCents(rows, "EUR", RATES)).toBe(500);
  });
});
