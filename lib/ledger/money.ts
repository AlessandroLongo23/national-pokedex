// Ledger amounts live as integer cents + a currency code so aggregation
// and storage stay precise (no floating-point money math). This module
// is the only place those two get rendered or parsed.

export type LedgerCurrency = "USD" | "EUR";

export const LEDGER_CURRENCIES: readonly LedgerCurrency[] = ["USD", "EUR"];

export function isLedgerCurrency(value: unknown): value is LedgerCurrency {
  return value === "USD" || value === "EUR";
}

export function formatMoneyCents(
  cents: number | null | undefined,
  currency: LedgerCurrency,
): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

// Parses "4.49", "$4.49", " 4 " etc. into integer cents. Returns null
// for empty/invalid input so callers can distinguish "user cleared the
// field" from "user typed nonsense" — both end up null here; the caller
// decides how to react.
export function parseMoneyCents(input: string): number | null {
  const trimmed = input.trim().replace(/[$€,\s]/g, "");
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
