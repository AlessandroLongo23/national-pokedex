import { formatMoneyCents } from "@/lib/ledger/money";
import type { Currency } from "@/lib/pricing/currencies";
import { convertCents } from "@/lib/pricing/exchange-rates";

interface Props {
  cents: number | null | undefined;
  // The currency the amount is stored in.
  currency: Currency;
  // The user's chosen display currency. When equal to `currency`, the
  // amount renders as-is with no conversion or tooltip.
  displayCurrency: Currency;
  // EUR per 1 unit of `currency` on the row's transaction date.
  // Snapshotted at write time; absent on legacy rows pre-backfill, in
  // which case we fall back to today's rate and mark the result as
  // approximate.
  rateToEur?: number | null;
  // Transaction date (ISO string), used to label the tooltip. Omit for
  // live market prices, where the conversion is always at today's rate.
  asOf?: string | null;
  // The fresh "1 EUR = X" rates from Frankfurter, needed to convert
  // EUR (via rateToEur) into displayCurrency. Pass through from the
  // calling page — getLatestRatesFromEur() is cached for 24h.
  latestRatesFromEur: Record<Currency, number>;
  // Optional wrapper class. The dotted underline indicator is appended
  // automatically when conversion happens.
  className?: string;
}

// Single renderer for any monetary amount the user might see. Handles
// three cases:
//   1. cents missing → "—"
//   2. currency == displayCurrency → plain formatted text
//   3. otherwise → converted amount with dotted underline + tooltip
//      naming the original value, rate, and as-of date
//
// Designed for server-side rendering; no hooks, no state. The
// "approximate" italic styling kicks in when we had to fall back to
// today's rate (no snapshot on the row). The backfill script erases
// that case for existing data.
export function MoneyDisplay({
  cents,
  currency,
  displayCurrency,
  rateToEur,
  asOf,
  latestRatesFromEur,
  className,
}: Props) {
  if (cents == null) return <span className={className}>—</span>;

  if (currency === displayCurrency) {
    return <span className={className}>{formatMoneyCents(cents, currency)}</span>;
  }

  const snapshot = rateToEur ?? null;
  const converted = convertCents(
    cents,
    currency,
    displayCurrency,
    snapshot,
    latestRatesFromEur,
  );
  if (converted == null) {
    // Conversion failed (FX API down on a row without snapshot, or an
    // unknown code slipped through). Render the original currency
    // instead of breaking the row.
    return <span className={className}>{formatMoneyCents(cents, currency)}</span>;
  }

  // "Approximate" = we wanted a historical snapshot but didn't have one,
  // so we fell back to today's rate. Only relevant for transactions
  // (asOf set). Live market prices (no asOf) always convert at today's
  // rate by design — that's not approximate, it's correct.
  const approximate = snapshot == null && asOf != null;
  const titleParts: string[] = [
    `Original: ${formatMoneyCents(cents, currency)} ${currency}`,
  ];
  if (snapshot != null) {
    titleParts.push(`1 ${currency} = ${snapshot.toFixed(4)} EUR`);
  } else if (asOf != null) {
    titleParts.push("converted at today's rate");
  }
  if (asOf) {
    const d = new Date(asOf);
    if (!Number.isNaN(d.getTime())) {
      titleParts.push(
        `as of ${d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}`,
      );
    }
  }

  return (
    <span
      className={[
        className ?? "",
        "border-b border-dotted border-zinc-500/70 decoration-zinc-500",
        approximate ? "italic" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      title={titleParts.join(" · ")}
    >
      {formatMoneyCents(converted, displayCurrency)}
    </span>
  );
}
