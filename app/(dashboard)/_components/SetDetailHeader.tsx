import Link from "next/link";
import type { BoosterWrapper, SetInfo } from "@/lib/data/types";
import { BoosterStrip } from "./BoosterStrip";
import { SeriesBadge } from "./SeriesBadge";
import { SetAvailabilityToggle } from "./SetAvailabilityToggle";
import { SetLogo } from "./SetLogo";
import { SetPageTitle } from "./SetPageTitle";

interface Props {
  set: SetInfo;
  wrappers: BoosterWrapper[];
  isLoggedIn: boolean;
}

export function SetDetailHeader({ set, wrappers, isLoggedIn }: Props) {
  const symbolUrl = set.symbolUrl ?? `https://images.pokemontcg.io/${set.id}/symbol.png`;
  const hasBoosters = wrappers.length > 0;

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-panel">
      {/* Keep feeding the AppShell breadcrumb ("Sets › <name>"). Renders null. */}
      <SetPageTitle title={set.name} />

      {/* Faint set-symbol watermark: a sense of place without adding noise. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 hidden h-56 w-56 opacity-[0.05] md:block"
        style={{
          backgroundImage: `url(${symbolUrl})`,
          backgroundSize: "contain",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />

      <div className="relative grid gap-6 p-5 md:grid-cols-[1fr_auto] md:items-center md:p-6">
        <div className="min-w-0 space-y-4">
          <SetLogo setId={set.id} setName={set.name} logoUrl={set.logoUrl} size="header" />

          <p className="text-sm text-muted">
            Released {set.releaseDate} · {set.cardCount} cards · {set.distinctPokemonCount} distinct
            Pokémon · {set.uniqueCount} unique to this set
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <SeriesBadge series={set.series} full />
            <SetAvailabilityToggle setId={set.id} />
            {isLoggedIn && (
              <Link
                href={`/packs/new?set=${set.id}`}
                className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                Log a pack from this set
              </Link>
            )}
          </div>
        </div>

        {hasBoosters && (
          <div className="md:justify-self-end">
            <BoosterStrip wrappers={wrappers} setName={set.name} size="compact" />
          </div>
        )}
      </div>
    </section>
  );
}
