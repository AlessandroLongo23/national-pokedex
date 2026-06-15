"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BOOSTERS } from "@/lib/data";
import { rankSets } from "@/lib/packs/rank";
import type { BoosterWrapper } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useSetAvailability } from "../_lib/SetAvailabilityContext";
import { BoosterStrip, packWrappers } from "./BoosterStrip";
import { RankLeaderboard } from "./RankLeaderboard";
import { SeriesBadge } from "./SeriesBadge";

interface Props {
  filterAvailable: boolean;
}

export function BestPackHero({ filterAvailable }: Props) {
  const { ownedSpecies } = useOwnedCards();
  const { availableSetIds } = useSetAvailability();
  const ranked = useMemo(
    () => rankSets(ownedSpecies, filterAvailable ? { filter: availableSetIds } : {}),
    [ownedSpecies, filterAvailable, availableSetIds],
  );
  const best = ranked[0];

  const [logoFailed, setLogoFailed] = useState<string | null>(null);
  const bestSetId = best?.set.id;
  const wrappers: BoosterWrapper[] = bestSetId ? packWrappers(BOOSTERS[bestSetId] ?? []) : [];

  if (!best) {
    return (
      <section className="rounded-2xl border border-border bg-panel p-6 text-sm text-muted">
        No sets available to recommend. Mark one as available locally on the Sets page, or
        disable the local-only filter above.
      </section>
    );
  }

  const logoUrl = best.set.logoUrl ?? `https://images.pokemontcg.io/${best.set.id}/logo.png`;
  const symbolUrl = best.set.symbolUrl ?? `https://images.pokemontcg.io/${best.set.id}/symbol.png`;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-accent/40 bg-gradient-to-br from-accent/10 via-panel to-panel">
      {/* Watermark: the set's symbol glyph, pushed off-canvas top-right, very low opacity.
          Gives the hero a sense of place without adding decoration noise. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-16 hidden h-72 w-72 opacity-[0.06] md:block"
        style={{
          backgroundImage: `url(${symbolUrl})`,
          backgroundSize: "contain",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div className="relative grid gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
        {/* Left: name, then the metrics moved beneath it. */}
        <div className="min-w-0 space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-accent">
              Best pack to open next
            </span>
            <SeriesBadge series={best.set.series} />
          </div>

          <div>
            {logoFailed === best.set.id ? (
              <h2 className="text-3xl font-bold tracking-tight md:text-4xl">{best.set.name}</h2>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={best.set.name}
                  onError={() => setLogoFailed(best.set.id)}
                  draggable={false}
                  className="block h-16 w-auto max-w-full object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.35)] md:h-24 md:max-w-[360px]"
                />
                <span className="sr-only">{best.set.name}</span>
              </>
            )}
            <p className="mt-3 text-sm text-muted">
              Released {best.set.releaseDate} · {best.unownedInSet} of{" "}
              {best.set.distinctPokemonCount} Pokémon in this set still missing from your binder.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric value={best.expectedNew.toFixed(2)} label="Expected new / pack" highlight />
            <Metric
              value={`${(best.probAtLeastOneNew * 100).toFixed(1)}%`}
              label="P(≥1 new in pack)"
            />
            <Metric value={best.unownedInSet} label="Unowned in set" />
            <Metric value={best.set.distinctPokemonCount} label="Set size" />
          </div>
        </div>

        {/* Right: pack artworks (metrics' old spot), then the two buttons below. */}
        <div className="space-y-5 self-start md:w-[300px]">
          {wrappers.length > 0 && (
            <div>
              <div className="mb-3 flex items-baseline gap-3">
                <span className="text-[11px] uppercase md:text-[10px] tracking-[0.18em] text-muted">
                  {wrappers.length > 1 ? `${wrappers.length} booster variants` : "Booster pack"}
                </span>
              </div>
              <BoosterStrip wrappers={wrappers} setName={best.set.name} />
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/packs/new?set=${best.set.id}`}
              className="rounded-md bg-primary px-4 py-2.5 md:py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Log a pack of this set
            </Link>
            <Link
              href={`/sets/${best.set.id}`}
              className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-panel-2 px-4 py-2.5 md:py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
            >
              View set
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </div>

      {/* The rest of the packs, merged into the same widget. */}
      <RankLeaderboard embedded filterAvailable={filterAvailable} />
    </section>
  );
}

function Metric({
  value,
  label,
  highlight,
}: {
  value: string | number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border bg-panel-2 px-3 py-2.5",
        highlight ? "border-accent/40" : "border-border",
      ].join(" ")}
    >
      <div className={`text-xl font-bold nums ${highlight ? "text-accent" : "text-text"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] uppercase md:text-[10px] tracking-wider text-muted">{label}</div>
    </div>
  );
}
