"use client";

import Image from "next/image";
import { POKEDEX, SETS } from "@/lib/data";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { useTooltip } from "../TooltipContext";

export function Tooltip() {
  const { state, hide } = useTooltip();
  if (!state) return null;

  const entry = POKEDEX.find((p) => p.dex === state.dex);
  if (!entry) return null;

  const containingSets = SETS.filter((s) => s.dexNumbers.includes(state.dex));
  const top = Math.min(state.anchor.bottom + 8, window.innerHeight - 240);
  const left = Math.min(state.anchor.left, window.innerWidth - 280);

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-border bg-[#0a0c10] p-3 shadow-2xl"
      style={{ top, left }}
      onMouseLeave={hide}
    >
      <div className="flex gap-3">
        <Image
          src={officialArtworkUrl(state.dex)}
          alt={entry.name}
          width={72}
          height={72}
          unoptimized
          className="rounded bg-panel"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{entry.name}</div>
          <div className="text-[11px] text-muted">
            #{entry.dex} · Gen {entry.gen}
          </div>
          {containingSets.length > 0 ? (
            <div className="mt-1 text-[11px] text-covered">
              In {containingSets.length} set{containingSets.length === 1 ? "" : "s"}:{" "}
              {containingSets
                .slice(0, 3)
                .map((s) => s.name)
                .join(", ")}
              {containingSets.length > 3 ? "…" : ""}
            </div>
          ) : (
            <div className="mt-1 text-[11px] font-semibold text-missing">
              Not in any SV/ME booster
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
