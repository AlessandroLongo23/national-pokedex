"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCY_NAMES,
  isCurrency,
  SUPPORTED_CURRENCIES,
  type Currency,
} from "@/lib/pricing/currencies";
import { updateDisplayCurrency } from "../../_lib/preferences-actions";

interface Props {
  initial: Currency;
}

// Sits next to PriceSourceSetting on the settings page. The two are
// distinct: price source picks which TCG marketplace feeds the live
// card prices (TCGplayer in USD vs Cardmarket in EUR), while display
// currency picks what currency every monetary amount renders in once
// fetched/converted. Both can move independently.
export function DisplayCurrencySetting({ initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<Currency>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSelect(next: string) {
    if (!isCurrency(next) || next === value || pending) return;
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      try {
        await updateDisplayCurrency(next);
        router.refresh();
      } catch (err) {
        setValue(prev);
        setError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div>
        <div className="text-sm font-semibold tracking-tight">Display currency</div>
        <p className="mt-1 text-xs text-muted">
          What currency every price renders in. Amounts logged in other
          currencies are converted using the rate on the transaction date
          (via Frankfurter/ECB), so historical totals stay anchored to what
          you actually paid.
        </p>
      </div>
      <div className="mt-4">
        <select
          value={value}
          onChange={(e) => onSelect(e.target.value)}
          disabled={pending}
          aria-label="Display currency"
          className="w-full max-w-xs rounded-md border border-border bg-panel-2 px-3 py-2 text-base md:text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark] disabled:opacity-60"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c} — {CURRENCY_NAMES[c]}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className="mt-3 rounded-md border border-missing/40 bg-missing/10 p-2 text-xs text-missing">
          {error}
        </p>
      )}
    </div>
  );
}
