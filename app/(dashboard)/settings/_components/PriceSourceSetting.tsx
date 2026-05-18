"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PRICE_SOURCES,
  PRICE_SOURCE_LABEL,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import { updatePriceSource } from "../../_lib/preferences-actions";

interface Props {
  initial: PriceSource;
}

export function PriceSourceSetting({ initial }: Props) {
  const router = useRouter();
  const [value, setValue] = useState<PriceSource>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSelect(next: PriceSource) {
    if (next === value || pending) return;
    const prev = value;
    setValue(next);
    setError(null);
    start(async () => {
      try {
        await updatePriceSource(next);
        router.refresh();
      } catch (err) {
        setValue(prev);
        setError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-sm font-semibold tracking-tight">Pricing source</div>
          <p className="mt-1 text-xs text-muted">
            Which market we use to value your binders. Prices come from the free pokemontcg.io
            API and refresh roughly daily.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {PRICE_SOURCES.map((src) => {
          const active = value === src;
          return (
            <button
              key={src}
              type="button"
              onClick={() => onSelect(src)}
              disabled={pending}
              aria-pressed={active}
              className={[
                "rounded-md border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border-accent bg-accent/10 text-text"
                  : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
                pending ? "opacity-60" : "",
              ].join(" ")}
            >
              <div className="text-sm font-medium">{PRICE_SOURCE_LABEL[src]}</div>
              <div className="mt-0.5 text-[11px] text-muted">
                {src === "tcgplayer" ? "US singles market" : "EU singles market"}
              </div>
            </button>
          );
        })}
      </div>
      {error && (
        <p className="mt-3 rounded-md border border-missing/40 bg-missing/10 p-2 text-xs text-missing">
          {error}
        </p>
      )}
    </div>
  );
}
