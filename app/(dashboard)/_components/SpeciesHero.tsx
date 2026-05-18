import Image from "next/image";
import Link from "next/link";
import { POKEDEX, SPECIES } from "@/lib/data";
import type { Generation } from "@/lib/data/types";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { BinderSlot } from "./BinderSlot";
import { SpeciesPagination } from "./SpeciesPagination";
import { typeRgb } from "./pokemonTypeColors";

interface Props {
  dex: number;
}

const REGION_BY_GEN: Record<Generation, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

export function SpeciesHero({ dex }: Props) {
  const species = SPECIES[dex];
  if (!species) return null;
  const region = REGION_BY_GEN[species.generation as Generation] ?? `Gen ${species.generation}`;
  const primaryRgb = typeRgb(species.types[0]);

  // Inline meta: height · weight · abilities. One line, dense, no metric grid.
  // Abilities can be empty for some legacy entries; filter so dots don't dangle.
  const abilities = species.abilities.map((a) => a.name).join(", ");
  const meta = [
    `${(species.heightDm / 10).toFixed(1)} m`,
    `${(species.weightHg / 10).toFixed(1)} kg`,
    abilities,
  ].filter(Boolean);

  // Only show the evolution row when there's somewhere else to go — guards
  // single-stage chains that contain only the current dex.
  const hasEvolution = species.evolutionChain.flat().some((d) => d !== dex);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-panel">
      <SpeciesPagination dex={dex} />
      <div className="grid gap-5 px-5 py-5 md:grid-cols-[176px_1fr] md:gap-7 md:px-7 md:py-6">
        <div className="relative flex justify-center md:justify-start">
          {/* Only color cue: a soft ground-glow keyed to primary type. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle at 50% 58%, rgb(${primaryRgb} / 0.22), transparent 62%)`,
            }}
          />
          <Image
            src={species.artworkUrl ?? officialArtworkUrl(dex)}
            alt={species.name}
            width={192}
            height={192}
            unoptimized
            className="relative h-36 w-36 object-contain md:h-44 md:w-44"
          />
        </div>
        <div className="space-y-4">
          <div className="eyebrow">
            #{dex} · {region}
          </div>

          <BinderSlot dex={dex} />

          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{species.name}</h1>
            <p className="text-sm text-muted">{species.genus}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {species.types.map((t) => {
              const rgb = typeRgb(t);
              return (
                <span
                  key={t}
                  className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white"
                  style={{
                    backgroundColor: `rgb(${rgb} / 0.85)`,
                    borderColor: `rgb(${rgb} / 1)`,
                    textShadow: "0 1px 1px rgb(0 0 0 / 0.35)",
                  }}
                >
                  {t}
                </span>
              );
            })}
          </div>

          {meta.length > 0 && (
            <p className="text-sm nums">
              {meta.map((part, i) => (
                <span key={i}>
                  {i > 0 && <span aria-hidden className="mx-2 text-muted/40">·</span>}
                  <span className="text-text">{part}</span>
                </span>
              ))}
            </p>
          )}

          {hasEvolution && (
            <div>
              <div className="eyebrow">Evolution</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {species.evolutionChain.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i > 0 && <span aria-hidden className="text-muted/60">→</span>}
                    <div className="flex flex-wrap gap-1.5">
                      {stage.map((d) => (
                        <EvoChip key={d} dex={d} highlight={d === dex} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function EvoChip({ dex, highlight }: { dex: number; highlight?: boolean }) {
  const entry = POKEDEX.find((p) => p.dex === dex);
  return (
    <Link
      href={`/pokedex/${dex}`}
      className={[
        "inline-flex min-h-9 items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition",
        highlight
          ? "border-owned/60 bg-owned/15 text-owned"
          : "border-border bg-panel-2 hover:border-accent hover:text-accent active:border-accent active:bg-panel-3 active:text-accent",
      ].join(" ")}
    >
      <Image
        src={officialArtworkUrl(dex)}
        alt=""
        width={22}
        height={22}
        unoptimized
        className="h-5 w-5 object-contain"
      />
      <span>{entry?.name ?? `#${dex}`}</span>
    </Link>
  );
}
