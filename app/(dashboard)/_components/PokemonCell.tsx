"use client";

import Image from "next/image";
import { memo, useRef } from "react";
import { Check } from "lucide-react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { CARD_INDEX, SPECIES } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { usePokemonHover } from "../_lib/PokemonHoverContext";
import { typeColor, typeRgb } from "./pokemonTypeColors";

interface Props {
  dex: number;
  isCovered: boolean;
  hidden?: boolean;
  onClick?: (dex: number) => void;
  selected?: boolean;
  /** When set, the cell shows this card's art (letterboxed) instead of the
   * official artwork. Used by pokedex-scope binders. */
  displayCard?: CardEntry | null;
}

// Neutral panel surface; ownership encoded by amber border + corner dot,
// species identity encoded by tiny type-color pips in the bottom-right
// corner. The sprite fills the card so the grid reads as a wall of
// Pokémon rather than a wall of frames.

function CellBase({ dex, isCovered, hidden, onClick, selected, displayCard }: Props) {
  const { isSpeciesOwned, ownedCountForSpecies } = useOwnedCards();
  const { show, hide } = usePokemonHover();
  const owned = isSpeciesOwned(dex);
  const totalVariants = CARD_INDEX[dex]?.length ?? 0;
  const ownedVariants = ownedCountForSpecies(dex);
  const partial = owned && ownedVariants < totalVariants;
  const types = SPECIES[dex]?.types ?? [];
  const ref = useRef<HTMLButtonElement>(null);

  const showCardArt = Boolean(displayCard);

  const stateClass = selected
    ? "border-accent ring-2 ring-accent bg-panel-2"
    : owned
      ? showCardArt
        ? "border-owned/40 bg-bg"
        : "border-owned/55 bg-panel-2"
      : isCovered
        ? "border-border bg-panel-2 hover:border-border-strong"
        : "border-border/40 bg-panel/60 hover:border-border";

  const imgClass = selected || owned
    ? "opacity-100"
    : isCovered
      ? "opacity-95"
      : "opacity-40 grayscale";

  return (
    <button
      ref={ref}
      type="button"
      data-dex={dex}
      onClick={onClick ? () => onClick(dex) : undefined}
      onMouseEnter={() => ref.current && show(dex, ref.current.getBoundingClientRect())}
      onMouseLeave={hide}
      onFocus={() => ref.current && show(dex, ref.current.getBoundingClientRect())}
      onBlur={hide}
      className={[
        "pokemon-cell group/cell relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-md border select-none",
        onClick ? "cursor-pointer" : "cursor-default",
        "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out hover:z-10 hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        stateClass,
        hidden ? "invisible" : "",
      ].join(" ")}
      style={
        {
          "--type-glow": typeColor(types, 0.55),
        } as React.CSSProperties
      }
      aria-label={`#${dex}${owned ? " owned" : isCovered ? "" : " missing"}`}
    >
      {/* Sprite fills the cell — or the chosen card art, letterboxed */}
      {showCardArt && displayCard ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={displayCard.imageSmall}
          alt={displayCard.name}
          loading="lazy"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain p-[3%]"
          style={{ filter: "drop-shadow(0 2px 3px rgb(0 0 0 / 0.45))" }}
        />
      ) : (
        <Image
          src={officialArtworkUrl(dex)}
          alt=""
          width={112}
          height={112}
          unoptimized
          loading="lazy"
          className={[
            "pointer-events-none absolute inset-[6%] h-[88%] w-[88%] object-contain transition-[filter,opacity] duration-150",
            imgClass,
          ].join(" ")}
          style={{
            filter: owned || selected
              ? "drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))"
              : "drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))",
          }}
        />
      )}

      {/* Owned indicator — top-right amber dot. Suppressed when card art is shown:
           the card itself is the ownership signal. */}
      {owned && !selected && !showCardArt && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-owned shadow-[0_0_0_1.5px_var(--color-panel-2),0_0_6px_rgb(251_191_36/0.5)]"
        />
      )}

      {/* Partial-variant badge — top-left small monochrome chip */}
      {partial && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 left-1 rounded-sm bg-bg/75 px-1 text-[9px] font-semibold leading-[1.3] text-owned/95 nums tabular-nums backdrop-blur-sm"
          title={`${ownedVariants} / ${totalVariants} variants owned`}
        >
          {ownedVariants}/{totalVariants}
        </span>
      )}

      {/* Type pips — bottom-right colored dots */}
      {types.length > 0 && (
        <div className="pointer-events-none absolute right-1.5 bottom-1.5 flex items-center gap-[3px]">
          {types.map((t) => (
            <span
              key={t}
              className="h-1.5 w-1.5 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.45)]"
              style={{ background: `rgb(${typeRgb(t)})` }}
              title={t}
            />
          ))}
        </div>
      )}

      {/* Selected check overlay for pack-log flow */}
      {selected && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-bg shadow-[0_0_0_1.5px_var(--color-bg)]"
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3.5} aria-hidden />
        </span>
      )}
    </button>
  );
}

export const PokemonCell = memo(CellBase);
