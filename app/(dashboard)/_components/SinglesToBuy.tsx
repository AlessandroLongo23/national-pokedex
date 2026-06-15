"use client";

import Link from "next/link";
import { useMemo } from "react";
import { rankSinglesToBuy, oneInNPacks } from "@/lib/packs/singles";
import { CHEAPEST_SINGLES, SPECIES } from "@/lib/data";
import { GEN_NAMES, RARITY_LABEL, type CheapestCard } from "@/lib/data/types";
import { officialArtworkUrl } from "@/lib/pokeapi";
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
          Missing species too hard to pull — cheapest printings to buy directly
        </span>
      </div>

      <ul>
        {singles.map((s, i) => {
          const oneIn = oneInNPacks(s.pBest);
          const art = SPECIES[s.dex]?.artworkUrl ?? officialArtworkUrl(s.dex);
          const cards = CHEAPEST_SINGLES[s.dex] ?? [];
          return (
            <li
              key={s.dex}
              className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border px-5 py-4 transition first:border-t-0 hover:bg-panel-2"
            >
              <span className="w-6 shrink-0 text-center text-xs text-muted nums">{i + 1}</span>

              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-lg border border-border bg-panel-2 p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={art}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className="h-full w-full object-contain"
                />
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
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

              {cards.length > 0 && (
                <div className="flex shrink-0 items-start gap-2">
                  {cards.map((c) => (
                    <CardThumb key={c.id} card={c} />
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CardThumb({ card }: { card: CheapestCard }) {
  return (
    <Link
      href={`/cards/${card.id}`}
      title={`${card.name} · ${card.setName} · ${RARITY_LABEL[card.rarity]}`}
      className="group flex w-[58px] flex-col gap-1"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.imageSmall}
        alt={`${card.name} — ${card.setName}`}
        loading="lazy"
        draggable={false}
        referrerPolicy="no-referrer"
        className="aspect-[63/88] w-full rounded-md bg-bg/60 object-contain ring-1 ring-black/30 transition-transform duration-200 ease-out group-hover:-translate-y-0.5"
      />
      <span className="min-w-0 text-center">
        <span className="block truncate text-[10px] font-medium leading-tight text-text">
          {RARITY_LABEL[card.rarity]}
        </span>
        <span className="block truncate text-[10px] leading-tight text-muted">{card.setName}</span>
      </span>
    </Link>
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
