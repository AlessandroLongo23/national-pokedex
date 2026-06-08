"use client";

import { Search } from "lucide-react";
import type { TransactionKind } from "@/lib/ledger/aggregates";

export type KindFilter = "all" | TransactionKind;
export type TimeRange = "all" | "7d" | "30d";

interface Props {
  kind: KindFilter;
  onKindChange: (kind: KindFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
}

const KIND_OPTIONS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "single_purchase", label: "Single" },
  { value: "sale", label: "Sale" },
  { value: "pack_purchase", label: "Pack" },
  { value: "lot_purchase", label: "Bulk lot" },
  { value: "psa_fee", label: "PSA" },
];

const TIME_OPTIONS: ReadonlyArray<{ value: TimeRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

export function LedgerFilters({
  kind,
  onKindChange,
  search,
  onSearchChange,
  timeRange,
  onTimeRangeChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-1">
        {KIND_OPTIONS.map((opt) => {
          const active = kind === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onKindChange(opt.value)}
              aria-pressed={active}
              className={[
                "rounded-md px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                active
                  ? "border border-accent/40 bg-accent/10 text-accent"
                  : "border border-transparent text-muted hover:bg-panel-2 hover:text-text",
              ].join(" ")}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:w-[240px]">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Card name or set code"
            aria-label="Search transactions"
            className="w-full rounded-md border border-border bg-panel-2 py-1.5 pl-8 pr-2.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <select
          value={timeRange}
          onChange={(e) => onTimeRangeChange(e.target.value as TimeRange)}
          aria-label="Time range"
          className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark]"
        >
          {TIME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
