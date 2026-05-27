"use client";

import { useState } from "react";
import { RARITY_LABEL, RARITY_ORDER, type Rarity } from "@/lib/data/types";
import {
  FilterButton,
  FilterChip,
  Popover,
  PopoverHeader,
} from "./primitives";

export function RarityFilter({
  value,
  onChange,
  inline,
}: {
  value: Set<Rarity>;
  onChange: (next: Set<Rarity>) => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (r: Rarity) => {
    const next = new Set(value);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    onChange(next);
  };

  if (inline) {
    return <RarityChips value={value} onToggle={toggle} />;
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[min(92vw,360px)]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label="Rarity"
          count={value.size}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Rarity"
        count={value.size}
        onClear={() => onChange(new Set())}
      />
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">
        <RarityChips value={value} onToggle={toggle} />
      </div>
    </Popover>
  );
}

function RarityChips({
  value,
  onToggle,
}: {
  value: Set<Rarity>;
  onToggle: (r: Rarity) => void;
}) {
  return (
    <>
      {RARITY_ORDER.map((r) => (
        <FilterChip key={r} active={value.has(r)} onClick={() => onToggle(r)}>
          {RARITY_LABEL[r]}
        </FilterChip>
      ))}
    </>
  );
}
