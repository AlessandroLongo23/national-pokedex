"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VARIANT_PLACEMENTS, type VariantPlacement } from "../../_lib/variant-prefs";
import { updateVariantSettings } from "../../_lib/preferences-actions";
import { Toggle } from "@/lib/components/ui/Toggle";

interface Props {
  initialEnabled: boolean;
  initialPlacement: VariantPlacement;
}

const PLACEMENT_COPY: Record<VariantPlacement, { label: string; hint: string }> = {
  appended: {
    label: "Appended after #1025",
    hint: "Regional variants render as a section at the end of the Pokédex grid.",
  },
  inline: {
    label: "Inline next to base form",
    hint: "Each variant slot sits right after the Pokémon it's a regional form of.",
  },
  separate: {
    label: "Dedicated page",
    hint: "Variants live on their own page; the Pokédex stays exactly 1025 slots.",
  },
};

export function VariantSeparationSetting({ initialEnabled, initialPlacement }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [placement, setPlacement] = useState<VariantPlacement>(initialPlacement);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(nextEnabled: boolean, nextPlacement: VariantPlacement) {
    const prevEnabled = enabled;
    const prevPlacement = placement;
    setEnabled(nextEnabled);
    setPlacement(nextPlacement);
    setError(null);
    start(async () => {
      try {
        await updateVariantSettings(nextEnabled, nextPlacement);
        router.refresh();
      } catch (err) {
        setEnabled(prevEnabled);
        setPlacement(prevPlacement);
        setError(err instanceof Error ? err.message : "Update failed");
      }
    });
  }

  return (
    <div className="rounded-lg border border-border bg-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div id="variant-separation-label" className="text-sm font-semibold tracking-tight">
            Treat regional variants as separate Pokémon
          </div>
          <p id="variant-separation-desc" className="mt-1 text-xs text-muted">
            By default an Alolan Vulpix card counts toward Vulpix #37. Turn this on if you think of
            Alolan, Galarian, Hisuian and Paldean forms as their own Pokémon — each form gets its
            own slot and stops contributing to its base Pokédex number.
          </p>
        </div>
        <Toggle
          checked={enabled}
          onCheckedChange={(next) => commit(next, placement)}
          disabled={pending}
          aria-labelledby="variant-separation-label"
          aria-describedby="variant-separation-desc"
        />
      </div>

      {enabled && (
        <div className="mt-5 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">Where to show them</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {VARIANT_PLACEMENTS.map((p) => {
              const active = placement === p;
              const copy = PLACEMENT_COPY[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => commit(enabled, p)}
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
                  <div className="text-sm font-medium">{copy.label}</div>
                  <div className="mt-0.5 text-[11px] text-muted">{copy.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-md border border-missing/40 bg-missing/10 p-2 text-xs text-missing">
          {error}
        </p>
      )}
    </div>
  );
}
