"use client";

import { useState } from "react";
import { FilterButton, Popover, PopoverHeader } from "./primitives";

export function DexFilter({
  from,
  to,
  onChange,
  inline,
}: {
  from: number | null;
  to: number | null;
  onChange: (from: number | null, to: number | null) => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = from !== null || to !== null;

  const label = active
    ? `Dex ${from ?? 1}–${to ?? 1025}`
    : "Dex";

  const body = (
    <div className="flex items-center gap-2 px-3 pb-3">
      <Box
        value={from}
        onChange={(n) => onChange(n, to)}
        placeholder="1"
        aria="From"
      />
      <span aria-hidden className="text-muted">
        –
      </span>
      <Box
        value={to}
        onChange={(n) => onChange(from, n)}
        placeholder="1025"
        aria="To"
      />
    </div>
  );

  if (inline) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-panel-2 px-2.5 py-1.5 text-xs">
        <span className="eyebrow !text-[10px] !tracking-[0.16em]">Dex</span>
        <Box
          value={from}
          onChange={(n) => onChange(n, to)}
          placeholder="1"
          aria="From"
        />
        <span aria-hidden className="text-muted">
          –
        </span>
        <Box
          value={to}
          onChange={(n) => onChange(from, n)}
          placeholder="1025"
          aria="To"
        />
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[220px]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label={label}
          count={active ? 1 : 0}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Dex range"
        count={active ? 1 : 0}
        onClear={() => onChange(null, null)}
      />
      {body}
    </Popover>
  );
}

function Box({
  value,
  onChange,
  placeholder,
  aria,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  placeholder: string;
  aria: string;
}) {
  const parse = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, Math.min(1025, n));
  };
  return (
    <input
      type="number"
      min={1}
      max={1025}
      value={value ?? ""}
      onChange={(e) => onChange(parse(e.target.value))}
      placeholder={placeholder}
      aria-label={`Dex ${aria}`}
      className="h-9 md:h-7 w-14 rounded-md border border-transparent bg-panel-3 px-1.5 text-center text-base md:text-xs text-text nums placeholder:text-muted focus:border-accent/50 focus:outline-none"
    />
  );
}
