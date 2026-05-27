"use client";

import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import type { CardSort } from "../../_lib/card-sort";
import { FilterButton, Popover, PopoverHeader } from "./primitives";

const SORT_OPTIONS: { value: CardSort; label: string; hint: string }[] = [
  { value: "number", label: "Number", hint: "Set order" },
  { value: "rarity", label: "Rarity", hint: "Common → Hyper" },
  { value: "pokemon", label: "Pokémon", hint: "Dex #" },
  { value: "set", label: "Set", hint: "Newest first" },
];

export function SortControl({
  value,
  onChange,
}: {
  value: CardSort;
  onChange: (next: CardSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = SORT_OPTIONS.find((o) => o.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-56"
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
          <span className="text-text">{active?.label ?? "Sort"}</span>
        </button>
      )}
    >
      <PopoverHeader label="Sort by" />
      <div className="px-1.5 pb-2">
        {SORT_OPTIONS.map((opt) => {
          const selected = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={[
                "flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs transition",
                selected
                  ? "bg-panel-2 text-text"
                  : "text-muted hover:bg-panel-2 hover:text-text",
              ].join(" ")}
            >
              <span className="text-text">{opt.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted">
                {opt.hint}
              </span>
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
