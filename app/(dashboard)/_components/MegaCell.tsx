"use client";

import Image from "next/image";
import { memo, useRef } from "react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { CARD_INDEX_BY_MEGA } from "@/lib/data";
import type { CardEntry, MegaForm } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { usePokemonHover } from "../_lib/PokemonHoverContext";
import { OwnedBadge } from "./OwnedBadge";

interface Props {
  form: MegaForm;
  onClick?: (form: MegaForm) => void;
  /** When set, the cell shows this card's art (letterboxed) instead of the
   * silhouette fallback. */
  displayCard?: CardEntry | null;
}

function CellBase({ form, onClick, displayCard }: Props) {
  const { isMegaFormOwned, ownedCountForMegaForm } = useOwnedCards();
  const { show, hide } = usePokemonHover();
  const owned = isMegaFormOwned(form.formKey);
  const ref = useRef<HTMLButtonElement>(null);
  const totalVariants = CARD_INDEX_BY_MEGA[form.formKey]?.length ?? 0;
  const ownedVariants = ownedCountForMegaForm(form.formKey);
  const partial = owned && ownedVariants < totalVariants;
  const showCardArt = Boolean(displayCard);

  // Mega slots are always "covered" by construction (the form only exists
  // because at least one card prints it). So just two states: owned vs not.
  const stateClass = owned
    ? showCardArt
      ? "border-mega/45 bg-bg"
      : "border-mega/60 bg-panel-2"
    : "border-mega/25 bg-panel/60 hover:border-mega/45";

  return (
    <button
      ref={ref}
      type="button"
      data-mega-form={form.formKey}
      onClick={onClick ? () => onClick(form) : undefined}
      onMouseEnter={() =>
        ref.current && show({ kind: "mega", form }, ref.current.getBoundingClientRect())
      }
      onMouseLeave={hide}
      onFocus={() =>
        ref.current && show({ kind: "mega", form }, ref.current.getBoundingClientRect())
      }
      onBlur={hide}
      className={[
        "pokemon-cell group/cell relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-md border select-none",
        onClick ? "cursor-pointer" : "cursor-default",
        "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out hover:z-10 hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mega",
        stateClass,
      ].join(" ")}
      style={{ "--type-glow": "rgb(167 139 255 / 0.55)" } as React.CSSProperties}
      aria-label={`${form.displayName}${owned ? " owned" : ""}`}
    >
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
          src={officialArtworkUrl(form.artworkId ?? form.baseDex)}
          alt=""
          width={112}
          height={112}
          unoptimized
          loading="lazy"
          className="pointer-events-none absolute inset-[6%] h-[88%] w-[88%] object-contain opacity-100 transition-[filter] duration-150"
          style={{
            filter: owned
              ? "drop-shadow(0 2px 3px rgb(0 0 0 / 0.35))"
              : "drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))",
          }}
        />
      )}

      {/* Mega/Primal badge — slate-violet, top-left */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 left-1 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-sm bg-mega/85 px-[3px] text-[9px] font-bold leading-none text-bg shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
      >
        {form.isPrimal ? "P" : "M"}
      </span>

      {/* Owned badge — top-right, matches PokemonCell. Shown over card art too
           now that the silhouette/art stays at full brightness in both states. */}
      {owned && <OwnedBadge size="sm" className="absolute top-1 right-1" />}

      {/* Partial-variant chip */}
      {partial && (
        <span
          aria-hidden
          className="pointer-events-none absolute right-1 bottom-1 rounded-sm bg-bg/75 px-1 text-[9px] font-semibold leading-[1.3] text-owned/95 nums tabular-nums backdrop-blur-sm"
          title={`${ownedVariants} / ${totalVariants} variants owned`}
        >
          {ownedVariants}/{totalVariants}
        </span>
      )}
    </button>
  );
}

export const MegaCell = memo(CellBase);
