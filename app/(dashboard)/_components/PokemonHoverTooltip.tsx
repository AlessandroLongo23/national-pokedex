"use client";

import Image from "next/image";
import { CARD_INDEX_BY_MEGA, CARD_INDEX_BY_VARIANT, POKEDEX, SETS, SPECIES } from "@/lib/data";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { usePokemonHover } from "../_lib/PokemonHoverContext";
import { typeBackground, typeRgb } from "./pokemonTypeColors";

export function PokemonHoverTooltip() {
  const { state, hide } = usePokemonHover();
  if (!state) return null;

  // Resolve the hovered target (base species or Mega/Primal form) into a common
  // shape so the card body below renders identically for both.
  let dexForArt: number;
  let title: string;
  let idLabel: string;
  let metaLine: string;
  let types: string[];
  let footer: React.ReactNode;

  if (state.target.kind === "mega") {
    const { form } = state.target;
    const species = SPECIES[form.baseDex];
    types = species?.types ?? [];
    dexForArt = form.artworkId ?? form.baseDex;
    title = form.displayName;
    idLabel = form.isPrimal ? "PRIMAL" : "MEGA";
    metaLine = `Gen ${form.gen}${species?.name ? ` · ${species.name}` : ""}`;
    const variants = CARD_INDEX_BY_MEGA[form.formKey]?.length ?? 0;
    footer = (
      <div className="flex items-baseline gap-1.5">
        <span className="text-covered nums tabular-nums">{variants}</span>
        <span className="text-muted">
          card variant{variants === 1 ? "" : "s"} across the tracked sets
        </span>
      </div>
    );
  } else if (state.target.kind === "variant") {
    const { form } = state.target;
    const species = SPECIES[form.baseDex];
    // The variant's OWN types (Galarian Zapdos is Fighting/Flying), falling back
    // to the base species only if a variant predates the types-aware ingest.
    types = form.types?.length ? form.types : (species?.types ?? []);
    dexForArt = form.artworkId ?? form.baseDex;
    title = form.displayName;
    const regionLabel: Record<typeof form.region, string> = {
      alola: "ALOLAN",
      galar: "GALARIAN",
      hisui: "HISUIAN",
      paldea: "PALDEAN",
    };
    idLabel = regionLabel[form.region];
    metaLine = `Gen ${form.gen}${species?.name ? ` · ${species.name}` : ""}`;
    const n = CARD_INDEX_BY_VARIANT[form.variantKey]?.length ?? 0;
    footer = (
      <div className="flex items-baseline gap-1.5">
        <span className="text-covered nums tabular-nums">{n}</span>
        <span className="text-muted">
          card variant{n === 1 ? "" : "s"} across the tracked sets
        </span>
      </div>
    );
  } else {
    const dex = state.target.dex;
    const entry = POKEDEX.find((p) => p.dex === dex);
    if (!entry) return null;
    const species = SPECIES[entry.dex];
    types = species?.types ?? [];
    dexForArt = entry.dex;
    title = entry.name;
    idLabel = `#${String(entry.dex).padStart(4, "0")}`;
    metaLine = `Gen ${entry.gen}${species?.genus ? ` · ${species.genus}` : ""}`;
    const containingSets = SETS.filter((s) => s.dexNumbers.includes(entry.dex));
    footer =
      containingSets.length > 0 ? (
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
      );
  }

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
            src={officialArtworkUrl(dexForArt)}
            alt={title}
            width={64}
            height={64}
            unoptimized
            className="h-full w-full object-contain"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate text-sm font-semibold tracking-tight">{title}</div>
            <div className="shrink-0 text-[11px] text-muted nums tabular-nums">{idLabel}</div>
          </div>
          <div className="text-[11px] text-muted">{metaLine}</div>
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

      <div className="border-t border-border bg-panel px-3 py-2.5 text-[11px]">{footer}</div>
    </div>
  );
}
