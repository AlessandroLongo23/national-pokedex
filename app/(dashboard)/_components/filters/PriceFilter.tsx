"use client";

import { useState } from "react";
import {
  PRICE_BUCKETS,
  priceBucketLabel,
  type PriceBucket,
} from "../../_lib/card-filters";
import {
  FilterButton,
  FilterChip,
  Popover,
  PopoverHeader,
} from "./primitives";

export function PriceFilter({
  value,
  onChange,
  currencySymbol,
  inline,
}: {
  value: Set<PriceBucket>;
  onChange: (next: Set<PriceBucket>) => void;
  currencySymbol: string;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (b: PriceBucket) => {
    const next = new Set(value);
    if (next.has(b)) next.delete(b);
    else next.add(b);
    onChange(next);
  };

  const chips = (
    <>
      {PRICE_BUCKETS.map((b) => (
        <FilterChip key={b} active={value.has(b)} onClick={() => toggle(b)}>
          {priceBucketLabel(b, currencySymbol)}
        </FilterChip>
      ))}
    </>
  );

  if (inline) return <div className="flex flex-wrap gap-1.5">{chips}</div>;

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      width="w-[min(92vw,300px)]"
      trigger={({ toggle, open }) => (
        <FilterButton
          label="Price"
          count={value.size}
          open={open}
          onClick={toggle}
        />
      )}
    >
      <PopoverHeader
        label="Price"
        count={value.size}
        onClear={() => onChange(new Set())}
      />
      <div className="flex flex-wrap gap-1.5 px-3 pb-3">{chips}</div>
    </Popover>
  );
}
