"use client";

import { Check } from "lucide-react";

interface Props {
  /** When > 1, the badge shows "×N" beside the check. Omitted/1 shows the check
   * alone (used by the species/mega cells, which carry their own variant tally). */
  quantity?: number;
  /** `sm` for the dense sprite grid, `md` for card-art tiles. */
  size?: "sm" | "md";
  /** Positioning utilities supplied by the caller (e.g. `absolute top-1.5 right-1.5`). */
  className?: string;
}

// The single "I own this" marker, used wherever a card or species reads as owned.
// A filled-amber pill keyed to --color-owned with a dark glyph, ringed in the page
// background so it stays legible over busy card art in either theme. Replaces the
// old opacity/grayscale dimming as the primary ownership signal.
export function OwnedBadge({ quantity, size = "md", className = "" }: Props) {
  const showCount = typeof quantity === "number" && quantity > 1;
  const box =
    size === "sm"
      ? "h-4 min-w-4 px-[3px] text-[9px]"
      : "h-[18px] min-w-[18px] px-1 text-[10px]";
  const icon = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <span
      aria-hidden
      className={[
        "pointer-events-none inline-flex items-center justify-center gap-0.5 rounded-full",
        "bg-owned font-bold leading-none text-owned-foreground tabular-nums",
        "shadow-[0_0_0_1.5px_var(--color-bg),0_1px_3px_rgb(0_0_0/0.35)]",
        box,
        className,
      ].join(" ")}
    >
      <Check className={icon} strokeWidth={3.5} aria-hidden />
      {showCount ? <span>×{quantity}</span> : null}
    </span>
  );
}
