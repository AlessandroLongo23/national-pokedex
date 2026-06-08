"use client";

import { Grid2x2, Grid3x3 } from "lucide-react";

function clampSize(n: number) {
  return Math.max(2, Math.min(10, Math.round(n)));
}

export function SizeControl({
  cols,
  onColsChange,
  compact,
}: {
  cols: number;
  onColsChange: (next: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={[
        "inline-flex items-center gap-2 rounded-md bg-panel-2 px-2.5",
        compact ? "h-10 md:h-8" : "h-8",
      ].join(" ")}
    >
      {compact ? (
        cols >= 6 ? (
          <Grid3x3
            className="h-3.5 w-3.5 text-muted"
            aria-label="Card density"
          />
        ) : (
          <Grid2x2
            className="h-3.5 w-3.5 text-muted"
            aria-label="Card density"
          />
        )
      ) : (
        <span className="text-[10px] uppercase tracking-[0.16em] text-muted">
          Size
        </span>
      )}
      <input
        type="range"
        min={2}
        max={10}
        value={cols}
        onChange={(e) => onColsChange(clampSize(Number(e.target.value)))}
        className="range-density h-1 w-24"
        aria-label="Cards per row"
      />
      <span className="w-4 text-right text-[11px] text-text nums">{cols}</span>
    </div>
  );
}
