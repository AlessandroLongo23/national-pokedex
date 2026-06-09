"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CARD_INDEX_BY_VARIANT, POKEDEX, SPECIES } from "@/lib/data";
import type { RegionalVariant, VariantRegion } from "@/lib/data/types";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import { typeRgb } from "../../_components/pokemonTypeColors";

const REGION_LABEL: Record<VariantRegion, string> = {
  alola: "Alolan",
  galar: "Galarian",
  hisui: "Hisuian",
  paldea: "Paldean",
};

const REGION_LETTER: Record<VariantRegion, string> = {
  alola: "A",
  galar: "G",
  hisui: "H",
  paldea: "P",
};

export function VariantHero({ form }: { form: RegionalVariant }) {
  const species = SPECIES[form.baseDex];
  const baseName =
    POKEDEX.find((p) => p.dex === form.baseDex)?.name ?? species?.name ?? `#${form.baseDex}`;
  // The variant's OWN types (e.g. Galarian Zapdos is Fighting/Flying), not the
  // base species' — falling back to base only for pre-types-ingest data.
  const types = form.types?.length ? form.types : (species?.types ?? []);
  const regionLabel = REGION_LABEL[form.region];
  const regionLetter = REGION_LETTER[form.region];
  const primaryRgb = typeRgb(types[0]);

  return (
    <section className="relative" data-region={form.region}>
      <div className="grid gap-5 py-5 md:grid-cols-[176px_1fr] md:items-start md:gap-7 md:py-6">
        <div className="flex justify-center md:justify-start">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4"
              style={{
                background: `radial-gradient(circle at 50% 58%, rgb(${primaryRgb} / 0.22), transparent 62%)`,
              }}
            />
            <Image
              src={officialArtworkUrl(form.artworkId ?? form.baseDex)}
              alt={form.displayName}
              width={192}
              height={192}
              unoptimized
              className="relative h-36 w-36 object-contain md:h-44 md:w-44"
            />
          </div>
        </div>
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm bg-variant/85 px-1 text-[10px] font-bold leading-none text-bg">
              {regionLetter}
            </span>
            <span className="eyebrow text-variant">
              Regional Variant · {regionLabel}
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-start md:gap-8">
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{form.displayName}</h1>
              <div className="flex flex-wrap items-center gap-2">
                {types.map((t) => {
                  const rgb = typeRgb(t);
                  return (
                    <span
                      key={t}
                      className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em]"
                      style={{
                        backgroundColor: `rgb(${rgb} / 0.14)`,
                        borderColor: `rgb(${rgb} / 0.7)`,
                        color: `rgb(${rgb} / 1)`,
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex md:justify-end">
              <VariantBinderSlot variantKey={form.variantKey} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="eyebrow">Base species</div>
            <Link
              href={`/pokedex/${form.baseDex}`}
              className="group inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-panel-2 px-2.5 py-1 text-xs transition hover:border-accent hover:text-accent"
            >
              <Image
                src={officialArtworkUrl(form.baseDex)}
                alt=""
                width={22}
                height={22}
                unoptimized
                className="h-5 w-5 object-contain"
              />
              <span>
                #{form.baseDex} {baseName}
              </span>
              <ArrowUpRight aria-hidden className="h-3.5 w-3.5 text-muted group-hover:text-accent" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function VariantBinderSlot({ variantKey }: { variantKey: string }) {
  const { ownedCountForVariantForm } = useOwnedCards();
  const total = CARD_INDEX_BY_VARIANT[variantKey]?.length ?? 0;
  const owned = ownedCountForVariantForm(variantKey);
  const filled = owned > 0;
  const printingLabel = total === 1 ? "printing" : "printings";

  return (
    <div className="flex flex-col items-start gap-2 md:items-end">
      <div
        className={[
          "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em]",
          filled
            ? "border-variant/60 bg-variant/15 text-variant"
            : "border-border-strong/70 bg-panel-2 text-muted",
        ].join(" ")}
      >
        <span
          aria-hidden
          className={["h-1.5 w-1.5 rounded-full", filled ? "bg-variant" : "border border-muted/70"].join(" ")}
        />
        <span>Variant form {filled ? "owned" : "unowned"}</span>
      </div>
      <div className="flex items-baseline gap-1.5 nums">
        <span
          className={[
            "text-4xl font-semibold leading-none tracking-tight md:text-5xl",
            filled ? "text-variant" : "text-text",
          ].join(" ")}
        >
          {owned}
        </span>
        <span className="text-2xl font-medium leading-none text-muted md:text-3xl">/ {total}</span>
      </div>
      <p className="text-xs text-muted nums">
        {printingLabel} {filled ? "owned" : "available"}
      </p>
    </div>
  );
}
