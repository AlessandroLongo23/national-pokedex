"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { CardSort, SortDir } from "../../_lib/card-sort";
import { Popover, PopoverHeader } from "./primitives";

// Per-field metadata: a hint shown in the list, plus the ascending/descending
// labels so the direction toggle reads naturally for what's being sorted.
const SORT_META: Record<
  CardSort,
  { label: string; hint: string; asc: string; desc: string }
> = {
  pokemon: { label: "Pokémon", hint: "Dex #", asc: "Lowest #", desc: "Highest #" },
  number: { label: "Number", hint: "Set order", asc: "Lowest #", desc: "Highest #" },
  rarity: { label: "Rarity", hint: "Common → Hyper", asc: "Common first", desc: "Rarest first" },
  set: { label: "Set", hint: "Series", asc: "A → Z", desc: "Z → A" },
  price: { label: "Price", hint: "Market value", asc: "Cheapest", desc: "Most expensive" },
  added: { label: "Date added", hint: "When acquired", asc: "Oldest", desc: "Newest" },
};

const DEFAULT_OPTIONS: CardSort[] = ["pokemon", "number", "rarity", "set", "price"];

export function SortControl({
  value,
  onChange,
  dir,
  onDirChange,
  options = DEFAULT_OPTIONS,
}: {
  value: CardSort;
  onChange: (next: CardSort) => void;
  dir: SortDir;
  onDirChange: (next: SortDir) => void;
  options?: CardSort[];
}) {
  const [open, setOpen] = useState(false);
  const active = SORT_META[value];
  const ascLabel = active.asc;
  const descLabel = active.desc;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-60"
      trigger={({ toggle, open }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={[
            "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs transition outline-none",
            "focus-visible:ring-2 focus-visible:ring-accent/60",
            open
              ? "border-border-strong bg-panel-2 text-text"
              : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
          ].join(" ")}
        >
          <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
          <span className="text-text">{active.label}</span>
          {dir === "asc" ? (
            <ArrowUp className="h-3 w-3 text-muted" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3 text-muted" aria-hidden />
          )}
        </button>
      )}
    >
      <PopoverHeader label="Sort by" />
      <div className="px-1.5 pb-1.5">
        {options.map((opt) => {
          const meta = SORT_META[opt];
          const selected = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              className={[
                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition",
                selected
                  ? "bg-panel-2 text-text"
                  : "text-muted hover:bg-panel-2 hover:text-text",
              ].join(" ")}
            >
              <span className="text-text">{meta.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted">
                {meta.hint}
              </span>
            </button>
          );
        })}
      </div>
      <div className="border-t border-border px-3 py-2.5">
        <span className="eyebrow !text-[10px] !tracking-[0.18em]">Order</span>
        <div className="mt-1.5 inline-flex w-full items-center rounded-md bg-panel-2 p-0.5">
          {([
            ["asc", ascLabel, ArrowUp],
            ["desc", descLabel, ArrowDown],
          ] as const).map(([d, label, Icon]) => {
            const isActive = dir === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onDirChange(d)}
                aria-pressed={isActive}
                className={[
                  "inline-flex h-7 flex-1 items-center justify-center gap-1.5 rounded text-[11px] font-medium transition outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent/60",
                  isActive
                    ? "bg-panel-3 text-text shadow-[inset_0_0_0_1px_var(--color-border)]"
                    : "text-muted hover:text-text",
                ].join(" ")}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </Popover>
  );
}
