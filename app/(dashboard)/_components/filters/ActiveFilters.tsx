"use client";

import { RARITY_LABEL } from "@/lib/data/types";
import { SETS } from "@/lib/data";
import {
  GENERATION_LABEL,
  priceBucketLabel,
} from "../../_lib/card-filters";
import { ActiveChip } from "./primitives";
import type { CardsFilterState } from "./types";

const SET_NAME = new Map(SETS.map((s) => [s.id, s.name] as const));

export function ActiveFilters({
  filters,
  onChange,
  currencySymbol,
}: {
  filters: CardsFilterState;
  onChange: (next: CardsFilterState) => void;
  currencySymbol: string;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  if (filters.supertype !== "all") {
    chips.push({
      key: `super:${filters.supertype}`,
      label: filters.supertype,
      remove: () => onChange({ ...filters, supertype: "all" }),
    });
  }

  for (const r of filters.rarities) {
    chips.push({
      key: `r:${r}`,
      label: RARITY_LABEL[r],
      remove: () => {
        const next = new Set(filters.rarities);
        next.delete(r);
        onChange({ ...filters, rarities: next });
      },
    });
  }

  for (const id of filters.setIds) {
    chips.push({
      key: `s:${id}`,
      label: SET_NAME.get(id) ?? id,
      remove: () => {
        const next = new Set(filters.setIds);
        next.delete(id);
        onChange({ ...filters, setIds: next });
      },
    });
  }

  if (filters.artist) {
    chips.push({
      key: `a:${filters.artist}`,
      label: filters.artist,
      remove: () => onChange({ ...filters, artist: null }),
    });
  }

  for (const t of filters.types) {
    chips.push({
      key: `t:${t}`,
      label: t,
      remove: () => {
        const next = new Set(filters.types);
        next.delete(t);
        onChange({ ...filters, types: next });
      },
    });
  }

  if (filters.dexFrom !== null || filters.dexTo !== null) {
    chips.push({
      key: "dex",
      label: `Dex ${filters.dexFrom ?? 1}–${filters.dexTo ?? 1025}`,
      remove: () => onChange({ ...filters, dexFrom: null, dexTo: null }),
    });
  }

  for (const b of filters.priceBuckets) {
    chips.push({
      key: `p:${b}`,
      label: priceBucketLabel(b, currencySymbol),
      remove: () => {
        const next = new Set(filters.priceBuckets);
        next.delete(b);
        onChange({ ...filters, priceBuckets: next });
      },
    });
  }

  for (const g of filters.generations) {
    chips.push({
      key: `g:${g}`,
      label: GENERATION_LABEL[g],
      remove: () => {
        const next = new Set(filters.generations);
        next.delete(g);
        onChange({ ...filters, generations: next });
      },
    });
  }

  for (const rf of filters.regionalForms) {
    chips.push({
      key: `rf:${rf}`,
      label: rf,
      remove: () => {
        const next = new Set(filters.regionalForms);
        next.delete(rf);
        onChange({ ...filters, regionalForms: next });
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <ActiveChip key={c.key} label={c.label} onRemove={c.remove} />
      ))}
    </div>
  );
}
