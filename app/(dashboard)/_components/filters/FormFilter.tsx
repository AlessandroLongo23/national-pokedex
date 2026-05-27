"use client";

import { useState } from "react";
import {
  REGIONAL_FORMS,
  type RegionalForm,
} from "../../_lib/card-filters";
import {
  FilterButton,
  FilterChip,
  Popover,
  PopoverHeader,
} from "./primitives";

export function FormFilter({
  value,
  onChange,
  inline,
}: {
  value: Set<RegionalForm>;
  onChange: (next: Set<RegionalForm>) => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (f: RegionalForm) => {
    const next = new Set(value);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    onChange(next);
  };

  const chips = (
    <>
      {REGIONAL_FORMS.map((f) => (
        <FilterChip key={f} active={value.has(f)} onClick={() => toggle(f)}>
          {f}
        </FilterChip>
      ))}
    </>
  );

  if (inline) return <div className="flex flex-wrap gap-1.5">{chips}</div>;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[min(92vw,280px)]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label="Form"
          count={value.size}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Regional form"
        count={value.size}
        onClear={() => onChange(new Set())}
      />
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">{chips}</div>
    </Popover>
  );
}
