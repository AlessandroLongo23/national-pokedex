import Link from "next/link";
import type { BoosterWrapper, SetInfo } from "@/lib/data/types";
import { BoosterStrip, packWrappers } from "./BoosterStrip";
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
  const hasPacks = packWrappers(wrappers).length > 0;

  return (
    <section className="border-b border-border pb-6">
      {/* Keep feeding the AppShell breadcrumb ("Sets › <name>"). Renders null. */}
      <SetPageTitle title={set.name} />

      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-8">
        {/* Center: the official set logo, enlarged. DOM-first so it leads on mobile. */}
        <div className="flex justify-center md:col-start-2 md:row-start-1">
          <SetLogo setId={set.id} setName={set.name} logoUrl={set.logoUrl} size="hero" />
        </div>

        {/* Left: booster pack artwork (packs only — posters and blisters filtered out). */}
        {hasPacks && (
          <div className="flex justify-center md:col-start-1 md:row-start-1 md:justify-self-start">
            <BoosterStrip wrappers={wrappers} setName={set.name} size="compact" />
          </div>
        )}

        {/* Right: metadata, era badge, availability, and the log-a-pack action. */}
        <div className="flex flex-col items-center gap-4 text-center md:col-start-3 md:row-start-1 md:items-end md:text-right">
          <p className="text-sm text-muted">
            Released {set.releaseDate} · {set.cardCount} cards · {set.distinctPokemonCount} distinct
            Pokémon
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 md:justify-end">
            {/* Set symbol as a small glyph beside the era badge. Background image so a
                404 degrades to empty space, not a broken-image icon. */}
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden
                className="h-6 w-6 shrink-0 bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url(${symbolUrl})` }}
              />
              <SeriesBadge series={set.series} full />
            </span>
            <SetAvailabilityToggle setId={set.id} />
          </div>

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
    </section>
  );
}
