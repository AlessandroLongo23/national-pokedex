import Link from "next/link";
import { ArrowRight, CreditCard, Layers, type LucideIcon } from "lucide-react";
import { POKEDEX, SETS } from "@/lib/data";
import { getAllCards } from "@/lib/data/binder-scope";
import { PokeballIcon } from "@/lib/components/ui/PokedexLogo";

export async function PublicHero() {
  const allCards = await getAllCards();
  const stats = {
    pokemon: POKEDEX.length,
    sets: SETS.length,
    cards: allCards.length,
  };

  return (
    <div className="mx-auto max-w-[1080px] space-y-10 py-4">
      <section className="space-y-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-accent">
          National Pokédex Binder
        </p>
        <h1 className="text-3xl font-bold tracking-tight md:text-5xl">
          One TCG card per Pokémon.
          <br />
          <span className="text-muted">All 1,025 of them.</span>
        </h1>
        <p className="max-w-[60ch] text-sm leading-relaxed text-muted md:text-base">
          A personal project tracking progress toward a complete binder of Scarlet
          &amp; Violet–era cards — one entry per National Pokédex number. Browse the
          catalog freely, or sign in to track what you own.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Sign in
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-4 py-2.5 text-sm font-semibold text-text transition hover:border-accent hover:text-accent"
          >
            Create account
          </Link>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <BrowseCard
          href="/pokedex"
          Icon={PokeballIcon}
          eyebrow="Catalog"
          title="Pokédex"
          meta={`${stats.pokemon.toLocaleString()} species`}
          blurb="Every National Pokédex entry, with the cards available across the tracked sets."
        />
        <BrowseCard
          href="/sets"
          Icon={Layers}
          eyebrow="Catalog"
          title="Sets"
          meta={`${stats.sets} sets`}
          blurb="Scarlet & Violet — plus Mega Evolution — series, with release dates and pool sizes."
        />
        <BrowseCard
          href="/cards"
          Icon={CreditCard}
          eyebrow="Catalog"
          title="Cards"
          meta={`${stats.cards.toLocaleString()} cards`}
          blurb="Every card from the tracked sets — filter by rarity, type, set, or artist."
        />
      </section>
    </div>
  );
}

function BrowseCard({
  href,
  Icon,
  eyebrow,
  title,
  meta,
  blurb,
}: {
  href: string;
  Icon: LucideIcon | ((p: { className?: string }) => React.ReactElement);
  eyebrow: string;
  title: string;
  meta: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-lg border border-border bg-panel p-5 transition hover:border-accent/60 hover:bg-panel-2"
    >
      <div className="flex items-center justify-between">
        <Icon className="h-5 w-5 text-muted transition group-hover:text-accent" />
        <ArrowRight className="h-4 w-4 text-muted/60 transition group-hover:text-accent" aria-hidden />
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted/70">{eyebrow}</p>
        <h2 className="mt-0.5 text-lg font-semibold tracking-tight text-text">{title}</h2>
        <p className="mt-0.5 text-[11px] tabular-nums text-muted">{meta}</p>
      </div>
      <p className="text-sm leading-relaxed text-muted">{blurb}</p>
    </Link>
  );
}
