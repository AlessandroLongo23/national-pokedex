"use client";

import Image from "next/image";
import { POKEDEX, SETS, SPECIES } from "@/lib/data";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { useTooltip } from "../_lib/TooltipContext";
import { typeBackground, typeRgb } from "./pokemonTypeColors";

export function PokemonTooltip() {
  const { state, hide } = useTooltip();
  if (!state) return null;

  const entry = POKEDEX.find((p) => p.dex === state.dex);
  if (!entry) return null;

  const species = SPECIES[state.dex];
  const types = species?.types ?? [];

  const containingSets = SETS.filter((s) => s.dexNumbers.includes(state.dex));

  const top = Math.min(state.anchor.bottom + 8, window.innerHeight - 240);
  const left = Math.min(state.anchor.left, window.innerWidth - 300);

  return (
    <div
      role="tooltip"
      className="pointer-events-none fixed z-50 w-[280px] overflow-hidden rounded-lg border border-border-strong bg-panel shadow-[0_20px_40px_-12px_rgb(0_0_0/0.6)]"
      style={{ top, left }}
      onMouseLeave={hide}
    >
      <div
        className="flex gap-3 p-3"
        style={{ background: typeBackground(types, 0.14) }}
      >
        <div
          className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md"
          style={{ background: typeBackground(types, 0.4) }}
        >
          <Image
            src={officialArtworkUrl(state.dex)}
            alt={entry.name}
            width={64}
            height={64}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate text-sm font-semibold tracking-tight">{entry.name}</div>
            <div className="shrink-0 text-[11px] text-muted nums tabular-nums">
              #{String(entry.dex).padStart(4, "0")}
            </div>
          </div>
          <div className="text-[11px] text-muted">
            Gen {entry.gen}
            {species?.genus ? ` · ${species.genus}` : ""}
          </div>
          {types.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {types.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full px-1.5 py-[1px] text-[10px] font-medium uppercase tracking-wider"
                  style={{
                    background: `rgb(${typeRgb(t)} / 0.18)`,
                    color: `rgb(${typeRgb(t)} / 0.95)`,
                    border: `1px solid rgb(${typeRgb(t)} / 0.35)`,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border bg-panel px-3 py-2.5 text-[11px]">
        {containingSets.length > 0 ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-covered nums tabular-nums">{containingSets.length}</span>
            <span className="text-muted">
              set{containingSets.length === 1 ? "" : "s"} ·{" "}
              <span className="text-text/85">
                {containingSets
                  .slice(0, 2)
                  .map((s) => s.name)
                  .join(", ")}
                {containingSets.length > 2 ? ` +${containingSets.length - 2}` : ""}
              </span>
            </span>
          </div>
        ) : (
          <div className="font-medium text-missing">Not in any tracked set</div>
        )}
      </div>
    </div>
  );
}
