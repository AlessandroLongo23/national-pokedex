import Image from "next/image";
import Link from "next/link";
import { POKEDEX, SPECIES } from "@/lib/data";
import { GEN_NAMES, type Generation } from "@/lib/data/types";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { BinderSlot } from "./BinderSlot";
import { SpeciesPagination } from "./SpeciesPagination";
import { typeRgb } from "./pokemonTypeColors";

interface Props {
  dex: number;
}

export function SpeciesHero({ dex }: Props) {
  const species = SPECIES[dex];
  if (!species) return null;
  const gen = species.generation as Generation;
  const primaryRgb = typeRgb(species.types[0]);

  return (
    <section
      className="relative overflow-hidden rounded-2xl border bg-panel"
      style={{ borderColor: `rgb(${primaryRgb} / 0.35)` }}
    >
      {/* Type-keyed halo — gives every species page a hue without theming the whole UI. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(circle at 18% 50%, rgb(${primaryRgb} / 0.18), transparent 55%)`,
        }}
      />
      <div className="relative">
        <SpeciesPagination dex={dex} />
      </div>
      <div className="relative grid gap-6 p-6 md:grid-cols-[320px_1fr] md:p-8">
        <div className="flex justify-center md:justify-start">
          <Image
            src={species.artworkUrl ?? officialArtworkUrl(dex)}
            alt={species.name}
            width={320}
            height={320}
            unoptimized
            className="h-64 w-64 object-contain md:h-80 md:w-80"
          />
        </div>
        <div className="space-y-4">
          <BinderSlot dex={dex} />
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted nums">
              #{dex} · Gen {gen} · {GEN_NAMES[gen]}
            </div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">{species.name}</h1>
            <p className="mt-1 text-sm text-muted">{species.genus}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {species.types.map((t) => {
              const rgb = typeRgb(t);
              return (
                <span
                  key={t}
                  className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white"
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

          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-panel-2 p-3 text-sm">
            <Stat label="Height" value={`${(species.heightDm / 10).toFixed(1)} m`} />
            <Stat label="Weight" value={`${(species.weightHg / 10).toFixed(1)} kg`} />
            <Stat
              label="Abilities"
              value={species.abilities.map((a) => a.name).join(", ") || "—"}
              small
            />
          </div>

          {species.evolutionChain.length > 1 && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted">Evolution</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {species.evolutionChain.map((stage, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-muted">→</span>}
                    <div className="flex flex-wrap gap-1">
                      {stage.map((d) => (
                        <EvoChip key={d} dex={d} highlight={d === dex} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {species.flavorText && (
            <p className="text-sm leading-relaxed text-muted italic">
              “{species.flavorText}”
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={small ? "mt-1 text-xs leading-snug" : "mt-1 font-semibold nums"}>
        {value}
      </div>
    </div>
  );
}

function EvoChip({ dex, highlight }: { dex: number; highlight?: boolean }) {
  const entry = POKEDEX.find((p) => p.dex === dex);
  return (
    <Link
      href={`/pokedex/${dex}`}
      className={[
        "flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition",
        highlight
          ? "border-owned/60 bg-owned/15 text-owned"
          : "border-border bg-panel-2 hover:border-accent hover:text-accent",
      ].join(" ")}
    >
      <Image
        src={officialArtworkUrl(dex)}
        alt=""
        width={20}
        height={20}
        unoptimized
        className="h-5 w-5 object-contain"
      />
      <span>{entry?.name ?? `#${dex}`}</span>
    </Link>
  );
}
