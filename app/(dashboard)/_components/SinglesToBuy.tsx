"use client";

import Link from "next/link";
import { useMemo } from "react";
import { rankSinglesToBuy, oneInNPacks } from "@/lib/packs/singles";
import { GEN_NAMES, RARITY_LABEL } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useSetAvailability } from "../_lib/SetAvailabilityContext";

interface Props {
  filterAvailable: boolean;
  limit?: number;
}

export function SinglesToBuy({ filterAvailable, limit = 10 }: Props) {
  const { ownedSpecies } = useOwnedCards();
  const { availableSetIds } = useSetAvailability();
  const singles = useMemo(
    () =>
      rankSinglesToBuy(ownedSpecies, {
        filter: filterAvailable ? availableSetIds : undefined,
        limit,
      }),
    [ownedSpecies, filterAvailable, availableSetIds, limit],
  );

  if (singles.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-panel p-6 text-sm text-muted">
        Nothing to buy as a single right now — every reachable missing species is pullable from a
        pack, or your binder is already complete.
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Buy these as singles</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted">
          Missing species too hard to pull — cheaper to buy directly
        </span>
      </div>

      <ul>
        {singles.map((s, i) => {
          const oneIn = oneInNPacks(s.pBest);
          return (
            <li
              key={s.dex}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-5 py-3 transition first:border-t-0 hover:bg-panel-2"
            >
              <span className="w-6 text-center text-xs text-muted nums">{i + 1}</span>

              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-[11px] text-muted nums">
                  #{s.dex.toString().padStart(4, "0")}
                </span>
                <Link
                  href={`/pokedex/${s.dex}`}
                  className="truncate font-medium transition hover:text-accent"
                >
                  {s.name}
                </Link>
                <GenBadge gen={s.gen} />
              </div>

              <div className="text-right">
                {oneIn === null ? (
                  <span className="text-xs font-medium text-amber-400">
                    Not in your available packs
                  </span>
                ) : (
                  <span className="text-xs text-muted nums">
                    ≈1 in {Math.round(oneIn).toLocaleString()} packs
                  </span>
                )}
              </div>

              {/* TODO(price): a €/single estimate slots in here once card prices
                  are wired into the Packs page. */}
              <div className="w-full text-[11px] text-muted sm:w-auto sm:text-right">
                <span className="uppercase tracking-wider">Cheapest:</span>{" "}
                <span className="text-text">{RARITY_LABEL[s.cheapestRarity]}</span> ·{" "}
                <Link href={`/sets/${s.cheapestSetId}`} className="transition hover:text-accent">
                  {s.cheapestSetName}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function GenBadge({ gen }: { gen: number }) {
  const label = GEN_NAMES[gen as keyof typeof GEN_NAMES] ?? `Gen ${gen}`;
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full border border-border bg-panel-2 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted"
      title={`Generation ${gen}`}
    >
      {label}
    </span>
  );
}
