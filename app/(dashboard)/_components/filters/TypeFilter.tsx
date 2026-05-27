"use client";

import { useState } from "react";
import {
  FilterButton,
  FilterChip,
  Popover,
  PopoverHeader,
} from "./primitives";

export function TypeFilter({
  types,
  value,
  onChange,
  inline,
}: {
  types: string[];
  value: Set<string>;
  onChange: (next: Set<string>) => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (types.length === 0) return null;

  const toggle = (t: string) => {
    const next = new Set(value);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    onChange(next);
  };

  if (inline) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {types.map((t) => (
          <FilterChip key={t} active={value.has(t)} onClick={() => toggle(t)}>
            {t}
          </FilterChip>
        ))}
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[min(92vw,280px)]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label="Type"
          count={value.size}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Type"
        count={value.size}
        onClear={() => onChange(new Set())}
      />
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        {types.map((t) => (
          <FilterChip key={t} active={value.has(t)} onClick={() => toggle(t)}>
            {t}
          </FilterChip>
        ))}
      </div>
    </Popover>
  );
}
