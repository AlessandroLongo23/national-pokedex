"use client";

import Image from "next/image";
import { POKEDEX, SETS, SPECIES } from "@/lib/data";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { useTooltip } from "../_lib/TooltipContext";
import { typeBackground, typeRgb } from "./pokemonTypeColors";

// Series the binder project actively tracks. Anything outside this is
// listed under "All prints" as a secondary line so users still see total
// coverage without confusing it with what's pullable from current boosters.
const IN_SCOPE_SERIES = new Set(["Scarlet & Violet", "Mega Evolution"]);

export function Tooltip() {
  const { state, hide } = useTooltip();
  if (!state) return null;

  const entry = POKEDEX.find((p) => p.dex === state.dex);
  if (!entry) return null;

  const species = SPECIES[state.dex];
  const types = species?.types ?? [];

  const containingSets = SETS.filter((s) => s.dexNumbers.includes(state.dex));
  const inScopeSets = containingSets.filter((s) => IN_SCOPE_SERIES.has(s.series));

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
        {inScopeSets.length > 0 ? (
          <div className="flex items-baseline gap-1.5">
            <span className="text-covered nums tabular-nums">{inScopeSets.length}</span>
            <span className="text-muted">
              SV/ME set{inScopeSets.length === 1 ? "" : "s"} ·{" "}
              <span className="text-text/85">
                {inScopeSets
                  .slice(0, 2)
                  .map((s) => s.name)
                  .join(", ")}
                {inScopeSets.length > 2 ? ` +${inScopeSets.length - 2}` : ""}
              </span>
            </span>
          </div>
        ) : (
          <div className="font-medium text-missing">
            Not in any SV / ME booster — singles only
          </div>
        )}
        {containingSets.length > inScopeSets.length && (
          <div className="mt-0.5 text-[10px] text-muted">
            All-time prints: {containingSets.length}
          </div>
        )}
      </div>
    </div>
  );
}
