"use client";

import { useMemo, useState } from "react";
import { COVERAGE, POKEDEX } from "@/lib/data";
import { useOwned } from "../OwnedContext";
import { FilterBar, type GridFilter } from "./FilterBar";
import { PokemonCell } from "./PokemonCell";

export function PokedexGrid() {
  const { owned } = useOwned();
  const [filter, setFilter] = useState<GridFilter>("all");
  const missingSet = useMemo(() => new Set(COVERAGE.missingDex), []);

  const isVisible = (dex: number): boolean => {
    const isMissing = missingSet.has(dex);
    const isCovered = !isMissing;
    const isOwned = owned.has(dex);
    switch (filter) {
      case "all":
        return true;
      case "covered":
        return isCovered;
      case "missing":
        return isMissing;
      case "owned":
        return isOwned;
      case "needed":
        return !isOwned;
    }
  };

  return (
    <section className="my-8">
      <h2 className="mb-2 text-xl font-semibold">
        Full Pokédex Grid{" "}
        <span className="ml-2 text-sm font-normal text-muted">
          — click any cell to toggle &ldquo;owned&rdquo;
        </span>
      </h2>
      <FilterBar value={filter} onChange={setFilter} />
      <div className="grid max-sm:grid-cols-[repeat(15,1fr)] max-md:grid-cols-[repeat(20,1fr)] md:grid-cols-[repeat(25,1fr)] gap-[2px] rounded-xl border border-border bg-panel p-3">
        {POKEDEX.map((p) => (
          <PokemonCell
            key={p.dex}
            dex={p.dex}
            isCovered={!missingSet.has(p.dex)}
            hidden={!isVisible(p.dex)}
          />
        ))}
      </div>
    </section>
  );
}
