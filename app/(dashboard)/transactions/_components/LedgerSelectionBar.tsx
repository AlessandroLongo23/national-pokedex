"use client";

import { Trash2 } from "lucide-react";

interface Props {
  selectedCount: number;
  onDelete: () => void;
  onClear: () => void;
}

export function LedgerSelectionBar({
  selectedCount,
  onDelete,
  onClear,
}: Props) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-panel-2 px-3 py-2">
      <span className="text-sm font-medium text-text tabular-nums">
        {selectedCount} selected
      </span>
      <div className="flex items-center gap-1">
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
