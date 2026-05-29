"use client";

import type { CardEntry } from "@/lib/data/types";
import { useCardPreview } from "../../../_lib/CardPreviewContext";

interface Props {
  card: CardEntry;
}

export function CardHeroImage({ card }: Props) {
  const { open } = useCardPreview();

  return (
    <button
      type="button"
      onClick={(e) => open(card, e.currentTarget.getBoundingClientRect())}
      data-preview-trigger={card.id}
      aria-label={`Preview ${card.name}`}
      className="block w-full cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      style={{ aspectRatio: "245 / 342" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.imageLarge}
        alt={card.name}
        className="w-full rounded-lg shadow-[0_24px_60px_-20px_oklch(0.12_0.03_275/0.6)]"
        style={{ aspectRatio: "245 / 342" }}
      />
    </button>
  );
}
