"use client";

import { useMemo, useState } from "react";
import { FilterButton, Popover, PopoverHeader } from "./primitives";

export function ArtistFilter({
  value,
  onChange,
  options,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 120);
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 120);
  }, [query, options]);

  const label = value ?? "Artist";

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
      width="w-[min(92vw,300px)]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label={label}
          count={value ? 1 : 0}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Artist"
        count={value ? 1 : 0}
        onClear={() => onChange(null)}
      />
      <div className="px-2 pb-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search artists…"
          className="block h-7 w-full rounded-md border border-transparent bg-panel-2 px-2 text-base md:text-xs text-text placeholder:text-muted focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto px-1.5 pb-2">
        {filtered.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted">No match.</div>
        )}
        {filtered.map((opt) => {
          const active = value === opt;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => {
                onChange(active ? null : opt);
                setOpen(false);
              }}
              className={[
                "block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition",
                active
                  ? "bg-panel-2 text-text"
                  : "text-muted hover:bg-panel-2 hover:text-text",
              ].join(" ")}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </Popover>
  );
}
