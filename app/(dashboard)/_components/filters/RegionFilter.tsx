"use client";

import { useState } from "react";
import type { Generation } from "@/lib/data/types";
import {
  GENERATIONS,
  GENERATION_LABEL,
} from "../../_lib/card-filters";
import {
  FilterButton,
  FilterChip,
  Popover,
  PopoverHeader,
} from "./primitives";

export function RegionFilter({
  value,
  onChange,
  inline,
}: {
  value: Set<Generation>;
  onChange: (next: Set<Generation>) => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (g: Generation) => {
    const next = new Set(value);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    onChange(next);
  };

  const chips = (
    <>
      {GENERATIONS.map((g) => (
        <FilterChip key={g} active={value.has(g)} onClick={() => toggle(g)}>
          {GENERATION_LABEL[g]}
        </FilterChip>
      ))}
    </>
  );

  if (inline) return <div className="flex flex-wrap gap-1.5">{chips}</div>;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[min(92vw,360px)]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label="Region"
          count={value.size}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Region"
        count={value.size}
        onClear={() => onChange(new Set())}
      />
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">{chips}</div>
    </Popover>
  );
}
