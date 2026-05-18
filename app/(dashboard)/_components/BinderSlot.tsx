"use client";

import { CARD_INDEX } from "@/lib/data";
import { useOwnedCards } from "../_lib/OwnedCardsContext";

interface Props {
  dex: number;
}

/**
 * The page's emotional payoff. Answers the one question this app exists for:
 * "Is the binder slot for this Pokémon filled?" — surfaced before the name,
 * because that's the only fact that materially changes per visit.
 */
export function BinderSlot({ dex }: Props) {
  const { ownedCountForSpecies } = useOwnedCards();
  const total = CARD_INDEX[dex]?.length ?? 0;
  const owned = ownedCountForSpecies(dex);

  if (total === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel-2 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted/60" />
        Not in tracked sets
      </div>
    );
  }

  const filled = owned > 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <div
        className={[
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider",
          filled
            ? "border-owned/60 bg-owned/15 text-owned"
            : "border-border-strong/70 bg-panel-2 text-muted",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={[
            "h-1.5 w-1.5 rounded-full",
            filled ? "bg-owned" : "border border-muted/70",
          ].join(" ")}
        />
        Binder slot · {filled ? "filled" : "empty"}
      </div>
      <div className="text-[11px] text-muted nums">
        <span className={filled ? "font-semibold text-text" : "font-semibold text-text"}>
          {owned}
        </span>
        <span className="text-muted"> / {total} cards {filled ? "owned" : "available"}</span>
      </div>
    </div>
  );
}
