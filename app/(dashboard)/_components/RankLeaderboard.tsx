"use client";

import Link from "next/link";
import { useMemo } from "react";
import { rankSets } from "@/lib/packs/rank";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useSetAvailability } from "../_lib/SetAvailabilityContext";
import { SeriesBadge } from "./SeriesBadge";

interface Props {
  limit?: number;
  filterAvailable: boolean;
}

export function RankLeaderboard({ limit = 10, filterAvailable }: Props) {
  const { ownedSpecies } = useOwnedCards();
  const { availableSetIds } = useSetAvailability();
  const ranked = useMemo(
    () => rankSets(ownedSpecies, filterAvailable ? { filter: availableSetIds } : {}),
    [ownedSpecies, filterAvailable, availableSetIds],
  );
  const rows = ranked.slice(1, limit + 1);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Leaderboard</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted">
          Ranked by expected new Pokémon · 5,000-iteration simulation
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-0 md:min-w-[640px] border-collapse text-sm">
          <thead>
            <tr>
              <Th className="w-10 text-center">#</Th>
              <Th className="text-left">Set</Th>
              <Th className="text-right">Expected new</Th>
              <Th className="text-right">P(≥1 new)</Th>
              <Th className="text-right">Unowned</Th>
              <Th className="text-right">Released</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const rank = i + 2;
              return (
                <tr key={r.set.id} className="border-t border-border transition hover:bg-panel-2">
                  <td className="px-3 py-2.5 text-center text-xs text-muted nums">{rank}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/sets/${r.set.id}`} className="flex items-center gap-2">
                      <SeriesBadge series={r.set.series} />
                      <span className="font-medium">{r.set.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-covered nums">
                    {r.expectedNew.toFixed(2)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted nums">
                    {(r.probAtLeastOneNew * 100).toFixed(1)}%
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted nums">
                    {r.unownedInSet} / {r.set.distinctPokemonCount}
                  </td>
                  <td className="px-3 py-2.5 text-right text-xs text-muted nums">
                    {r.set.releaseDate}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-xs text-muted">
                  No further sets to rank.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`bg-panel-2 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted ${className}`}
    >
      {children}
    </th>
  );
}
