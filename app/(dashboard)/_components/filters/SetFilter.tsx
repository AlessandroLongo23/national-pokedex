"use client";

import { useMemo, useState } from "react";
import { SETS } from "@/lib/data";
import type { SetInfo } from "@/lib/data/types";
import { FilterButton, Popover, PopoverHeader } from "./primitives";

export function SetFilter({
  value,
  onChange,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const bySeries = new Map<string, SetInfo[]>();
    for (const s of SETS) {
      const arr = bySeries.get(s.series);
      if (arr) arr.push(s);
      else bySeries.set(s.series, [s]);
    }
    return [...bySeries.entries()].map(
      ([series, sets]) =>
        [
          series,
          [...sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)),
        ] as const,
    );
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return grouped;
    return grouped
      .map(([series, sets]) => {
        const matched = sets.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.id.toLowerCase().includes(q) ||
            series.toLowerCase().includes(q),
        );
        return [series, matched] as const;
      })
      .filter(([, sets]) => sets.length > 0);
  }, [grouped, query]);

  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[min(92vw,420px)]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label={value.size === 0 ? "Set" : value.size === 1 ? "1 set" : `Sets`}
          count={value.size}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Set"
        count={value.size}
        onClear={() => onChange(new Set())}
      />
      <div className="px-2 pb-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sets…"
          className="block h-7 w-full rounded-md border border-transparent bg-panel-2 px-2 text-xs text-text placeholder:text-muted focus:border-accent/50 focus:outline-none"
        />
      </div>
      <div className="max-h-[58vh] overflow-y-auto px-1.5 pb-2">
        {filtered.length === 0 && (
          <div className="px-2 py-3 text-xs text-muted">No matching sets.</div>
        )}
        {filtered.map(([series, sets]) => (
          <div key={series} className="mb-2 last:mb-0">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              {series}
            </div>
            <div>
              {sets.map((s) => {
                const active = value.has(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggle(s.id)}
                    className={[
                      "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition",
                      active
                        ? "bg-panel-2 text-text"
                        : "text-muted hover:bg-panel-2 hover:text-text",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className={[
                          "inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition",
                          active
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-bg"
                            : "border-border-strong bg-transparent",
                        ].join(" ")}
                      >
                        {active && (
                          <svg
                            viewBox="0 0 12 12"
                            className="h-2.5 w-2.5"
                            fill="none"
                          >
                            <path
                              d="M2 6.5L5 9.5L10 3.5"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted nums">
                      {s.id}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}
