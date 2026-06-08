"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MEGA_PLACEMENTS, type MegaPlacement } from "../../_lib/mega-prefs";
import { updateMegaSettings } from "../../_lib/preferences-actions";
import { Toggle } from "@/lib/components/ui/Toggle";

interface Props {
  initialEnabled: boolean;
  initialPlacement: MegaPlacement;
}

const PLACEMENT_COPY: Record<MegaPlacement, { label: string; hint: string }> = {
  appended: {
    label: "Appended after #1025",
    hint: "Mega forms render as a section at the end of the Pokédex grid.",
  },
  inline: {
    label: "Inline next to base form",
    hint: "Each Mega slot sits right after the Pokémon it evolves from.",
  },
  separate: {
    label: "Dedicated page",
    hint: "Megas live on their own page; the Pokédex stays exactly 1025 slots.",
  },
};

export function MegaSeparationSetting({ initialEnabled, initialPlacement }: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [placement, setPlacement] = useState<MegaPlacement>(initialPlacement);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function commit(nextEnabled: boolean, nextPlacement: MegaPlacement) {
    const prevEnabled = enabled;
    const prevPlacement = placement;
    setEnabled(nextEnabled);
    setPlacement(nextPlacement);
    setError(null);
    start(async () => {
      try {
        await updateMegaSettings(nextEnabled, nextPlacement);
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
          <div id="mega-separation-label" className="text-sm font-semibold tracking-tight">
            Treat Mega Evolutions as separate Pokémon
          </div>
          <p id="mega-separation-desc" className="mt-1 text-xs text-muted">
            By default a Mega Charizard X card counts toward Charizard #6. Turn this on if you
            think of Megas (and Primal Kyogre/Groudon) as their own Pokémon — each form gets its
            own slot and stops contributing to its base Pokédex number.
          </p>
        </div>
        <Toggle
          checked={enabled}
          onCheckedChange={(next) => commit(next, placement)}
          disabled={pending}
          aria-labelledby="mega-separation-label"
          aria-describedby="mega-separation-desc"
        />
      </div>

      {enabled && (
        <div className="mt-5 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-muted">Where to show them</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {MEGA_PLACEMENTS.map((p) => {
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
