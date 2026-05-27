"use client";

import type { Supertype } from "@/lib/data/types";
import { Segmented } from "./primitives";

export type SupertypeFilter = "all" | Supertype;

const SUPERTYPES: readonly { value: SupertypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Pokémon", label: "Pokémon" },
  { value: "Trainer", label: "Trainer" },
  { value: "Energy", label: "Energy" },
];

export function SupertypeTabs({
  value,
  onChange,
}: {
  value: SupertypeFilter;
  onChange: (next: SupertypeFilter) => void;
}) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={SUPERTYPES}
      ariaLabel="Card supertype"
    />
  );
}
