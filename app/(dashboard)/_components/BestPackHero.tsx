"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BOOSTERS } from "@/lib/data";
import { rankSets } from "@/lib/packs/rank";
import type { BoosterWrapper } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useSetAvailability } from "../_lib/SetAvailabilityContext";
import { BoosterStrip } from "./BoosterStrip";
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
  const wrappers: BoosterWrapper[] = bestSetId ? BOOSTERS[bestSetId] ?? [] : [];

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
                  className="block h-16 w-auto max-w-[360px] object-contain object-left drop-shadow-[0_4px_18px_rgba(0,0,0,0.35)] md:h-24"
                />
                <span className="sr-only">{best.set.name}</span>
              </>
            )}
            <p className="mt-3 text-sm text-muted">
              Released {best.set.releaseDate} · {best.unownedInSet} of{" "}
              {best.set.distinctPokemonCount} Pokémon in this set still missing from your binder.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/packs/new?set=${best.set.id}`}
              className="rounded-md bg-primary px-4 py-2.5 md:py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              Log a pack of this set
            </Link>
            <Link
              href={`/sets/${best.set.id}`}
              className="rounded-md border border-border-strong bg-panel-2 px-4 py-2.5 md:py-2 text-sm font-medium transition hover:border-accent hover:text-accent"
            >
              View set
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 self-start md:w-[280px]">
          <Metric value={best.expectedNew.toFixed(2)} label="Expected new / pack" highlight />
          <Metric
            value={`${(best.probAtLeastOneNew * 100).toFixed(1)}%`}
            label="P(≥1 new in pack)"
          />
          <Metric value={best.unownedInSet} label="Unowned in set" />
          <Metric value={best.set.distinctPokemonCount} label="Set size" />
        </div>
      </div>

      {wrappers.length > 0 && (
        <div className="relative border-t border-accent/15 bg-bg/40 px-6 py-5 md:px-8 md:py-6">
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
              {wrappers.length > 1
                ? `${wrappers.length} booster variants`
                : "Booster pack"}
            </span>
            <Link
              href={`/packs/new?set=${best.set.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-muted transition hover:text-accent"
            >
              Log a pack
              <ArrowRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
          <BoosterStrip wrappers={wrappers} setName={best.set.name} />
        </div>
      )}
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
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{label}</div>
    </div>
  );
}
