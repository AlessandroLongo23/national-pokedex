"use client";

import { Layers, Trash2 } from "lucide-react";

interface Props {
  selectedCount: number;
  canGroup: boolean;
  onGroup: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function LedgerSelectionBar({
  selectedCount,
  canGroup,
  onGroup,
  onDelete,
  onClear,
}: Props) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-3 rounded-lg border border-border bg-panel-2 px-3 py-2">
      <span className="text-sm font-medium text-text tabular-nums">
        {selectedCount} selected
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {canGroup && (
          <button
            type="button"
            onClick={onGroup}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
            Group into bulk lot
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 rounded-md border border-missing/30 bg-missing/10 px-2.5 py-1 text-xs font-medium text-missing transition hover:bg-missing/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missing"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Delete
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
