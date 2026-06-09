"use client";

import Image from "next/image";
import { memo, useRef } from "react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { CARD_INDEX_BY_VARIANT } from "@/lib/data";
import type { CardEntry, RegionalVariant } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { usePokemonHover } from "../_lib/PokemonHoverContext";
import { OwnedBadge } from "./OwnedBadge";

interface Props {
  form: RegionalVariant;
  onClick?: (form: RegionalVariant) => void;
  /** When set, the cell shows this card's art (letterboxed) instead of the
   * silhouette fallback. */
  displayCard?: CardEntry | null;
}

const REGION_BADGE: Record<RegionalVariant["region"], string> = {
  alola: "A",
  galar: "G",
  hisui: "H",
  paldea: "P",
};

function CellBase({ form, onClick, displayCard }: Props) {
  const { isVariantFormOwned, ownedCountForVariantForm } = useOwnedCards();
  const { show, hide } = usePokemonHover();
  const owned = isVariantFormOwned(form.variantKey);
  const ref = useRef<HTMLButtonElement>(null);
  const totalVariants = CARD_INDEX_BY_VARIANT[form.variantKey]?.length ?? 0;
  const ownedVariants = ownedCountForVariantForm(form.variantKey);
  const partial = owned && ownedVariants < totalVariants;
  const showCardArt = Boolean(displayCard);

  // Variant slots are always "covered" by construction (the form only exists
  // because at least one card prints it). So just two states: owned vs not.
  const stateClass = owned
    ? showCardArt
      ? "border-variant/45 bg-bg"
      : "border-variant/60 bg-panel-2"
    : "border-variant/25 bg-panel/60 hover:border-variant/45";

  return (
    <button
      ref={ref}
      type="button"
      data-variant-form={form.variantKey}
      onClick={onClick ? () => onClick(form) : undefined}
      onMouseEnter={() =>
        ref.current && show({ kind: "variant", form }, ref.current.getBoundingClientRect())
      }
      onMouseLeave={hide}
      onFocus={() =>
        ref.current && show({ kind: "variant", form }, ref.current.getBoundingClientRect())
      }
      onBlur={hide}
      className={[
        "pokemon-cell group/cell relative flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-md border select-none",
        onClick ? "cursor-pointer" : "cursor-default",
        "transition-[transform,box-shadow,border-color,background-color] duration-150 ease-out hover:z-10 hover:scale-[1.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-variant",
        stateClass,
      ].join(" ")}
      style={{ "--type-glow": "rgb(45 212 191 / 0.55)" } as React.CSSProperties}
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

      {/* Region badge — teal, top-left (A/G/H/P) */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-1 left-1 inline-flex h-[14px] min-w-[14px] items-center justify-center rounded-sm bg-variant/85 px-[3px] text-[9px] font-bold leading-none text-bg shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
      >
        {REGION_BADGE[form.region]}
      </span>

      {/* Owned badge — top-right, matches PokemonCell. */}
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

export const VariantCell = memo(CellBase);
