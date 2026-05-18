"use client";

import { CARD_INDEX } from "@/lib/data";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { Separator } from "./Separator";

const BINDER_NAME = "National Dex";

interface StatusProps {
  filled: boolean;
  untracked?: boolean;
}

/**
 * Status pill: qualitative slot state only. Pair with BinderSlotCount for
 * the loud numeric peer to the species name.
 */
export function BinderSlotStatus({ filled, untracked = false }: StatusProps) {
  if (untracked) {
    return (
      <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-panel-2 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-muted/60" />
        <span>
          {BINDER_NAME} <Separator /> untracked
        </span>
      </div>
    );
  }

  return (
    <div
      className={[
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]",
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
      <span>
        {BINDER_NAME} <Separator /> {filled ? "filled" : "empty"}
      </span>
    </div>
  );
}

interface BinderSlotProps {
  dex: number;
}

/**
 * The page's emotional payoff: status pill above a loud owned/total count.
 * The one fact that materially changes per visit, rendered as a peer to
 * the species name.
 */
export function BinderSlot({ dex }: BinderSlotProps) {
  const { ownedCountForSpecies } = useOwnedCards();
  const total = CARD_INDEX[dex]?.length ?? 0;
  const owned = ownedCountForSpecies(dex);

  if (total === 0) {
    return (
      <div className="flex flex-col items-start gap-2 md:items-end">
        <BinderSlotStatus filled={false} untracked />
        <p className="text-xs text-muted">No printings in tracked sets.</p>
      </div>
    );
  }

  const filled = owned > 0;
  const printingLabel = total === 1 ? "printing" : "printings";

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <BinderSlotStatus filled={filled} />
      <div className="flex items-baseline gap-1.5 nums">
        <span
          className={[
            "text-4xl font-semibold leading-none tracking-tight md:text-5xl",
            filled ? "text-owned" : "text-text",
          ].join(" ")}
        >
          {owned}
        </span>
        <span className="text-2xl font-medium leading-none text-muted md:text-3xl">
          / {total}
        </span>
      </div>
      <p className="text-xs text-muted nums">
        {printingLabel} {filled ? "owned" : "available"} for {BINDER_NAME}
      </p>
    </div>
  );
}
