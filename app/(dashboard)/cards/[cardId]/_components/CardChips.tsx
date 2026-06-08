"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { POKEDEX } from "@/lib/data";
import type { Rarity } from "@/lib/data/types";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { typeRgb } from "../../../_components/pokemonTypeColors";

// Type symbol — the Pokémon type's energy badge (an SVG in /public/types,
// keyed by the lowercased TCG energy-type name). The symbol carries the
// type's color and is instantly recognizable, so it stands in for the old
// text pill; the name is revealed on hover and exposed to assistive tech and
// touch via alt + title. Falls back to a colored text pill if the asset is
// missing or the type is unknown.
export function TypeChip({ type, size = 26 }: { type: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const key = type.toLowerCase();
  if (failed) {
    const rgb = typeRgb(type);
    return (
      <span
        className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{
          backgroundColor: `rgb(${rgb} / 0.12)`,
          borderColor: `rgb(${rgb} / 0.55)`,
          color: `rgb(${rgb} / 1)`,
        }}
      >
        {type}
      </span>
    );
  }
  return (
    <span className="group/type relative inline-flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/types/${key}.png`}
        alt={type}
        title={type}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="block"
        style={{ width: size, height: size }}
      />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-panel px-2 py-1 text-[11px] font-medium normal-case tracking-normal text-text opacity-0 shadow-lg transition-opacity duration-150 group-hover/type:opacity-100"
      >
        {type}
      </span>
    </span>
  );
}

// Rarity is shown as the TCG rarity glyph (circle / diamond / 1–3 stars)
// next to the short label, tier-colored: gold for the illustration tiers (to
// match the gold star printed on the card), silver for the rare tiers, and a
// quiet gray for common/uncommon. Promo/Unknown have no canonical glyph, so
// they render label-only.
type RarityGlyph = "circle" | "diamond" | "star";
type RarityTier = "gold" | "silver" | "gray";

const RARITY_SYMBOL: Record<
  Rarity,
  { glyph: RarityGlyph; count: number; tier: RarityTier } | null
> = {
  Common: { glyph: "circle", count: 1, tier: "gray" },
  Uncommon: { glyph: "diamond", count: 1, tier: "gray" },
  Rare: { glyph: "star", count: 1, tier: "silver" },
  DoubleRare: { glyph: "star", count: 2, tier: "silver" },
  UltraRare: { glyph: "star", count: 2, tier: "silver" },
  IllustrationRare: { glyph: "star", count: 1, tier: "gold" },
  SpecialIllustrationRare: { glyph: "star", count: 2, tier: "gold" },
  HyperRare: { glyph: "star", count: 3, tier: "gold" },
  Promo: null,
  Unknown: null,
};

// Theme-aware tier colors — deep gold on light, bright gold on dark (the
// app's established `-dark dark:` favorite pattern), so the gold reads on both
// backgrounds. Symbol fill inherits this via currentColor.
const TIER_CLASS: Record<RarityTier, string> = {
  gold: "text-favorite-dark dark:text-favorite",
  silver: "text-text-secondary",
  gray: "text-muted",
};

const STAR_PATH =
  "M12 1.6l3.09 6.26 6.91 1.01-5 4.87 1.18 6.88L12 17.27l-6.18 3.25 1.18-6.88-5-4.87 6.91-1.01z";
const DIAMOND_PATH = "M12 1.5l6.5 10.5L12 22.5 5.5 12z";

function RaritySymbol({
  glyph,
  count,
  size = 12,
}: {
  glyph: RarityGlyph;
  count: number;
  size?: number;
}) {
  const unit = 24;
  const gap = 3;
  const totalUnits = count * unit + (count - 1) * gap;
  return (
    <svg
      width={(size / unit) * totalUnits}
      height={size}
      viewBox={`0 0 ${totalUnits} ${unit}`}
      fill="currentColor"
      aria-hidden
      className="shrink-0"
    >
      {Array.from({ length: count }).map((_, i) => (
        <g key={i} transform={`translate(${i * (unit + gap)}, 0)`}>
          {glyph === "circle" ? (
            <circle cx={12} cy={12} r={7.5} />
          ) : (
            <path d={glyph === "star" ? STAR_PATH : DIAMOND_PATH} />
          )}
        </g>
      ))}
    </svg>
  );
}

export function RarityBadge({ rarity, label }: { rarity: Rarity; label: string }) {
  const sym = RARITY_SYMBOL[rarity];
  const tierClass = sym ? TIER_CLASS[sym.tier] : "text-muted";
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${tierClass}`}
    >
      {sym && <RaritySymbol glyph={sym.glyph} count={sym.count} />}
      {label}
    </span>
  );
}

// Set chip — symbol image + set name, links to the set page. The symbol
// PNGs come from pokemontcg.io; some sets (promos, custom prints) don't
// have one, so onError falls back to a bullet.
export function SetChip({
  setId,
  setName,
  number,
  symbolUrl,
}: {
  setId: string;
  setName: string;
  number: string;
  symbolUrl?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Link
      href={`/sets/${setId}`}
      className="group inline-flex items-center gap-2 text-text"
    >
      {failed ? (
        <span
          aria-hidden
          className="inline-flex h-5 w-5 items-center justify-center rounded-sm bg-panel-2 text-[10px] font-semibold uppercase text-muted"
        >
          {setId.slice(0, 2)}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={symbolUrl ?? `https://images.pokemontcg.io/${setId}/symbol.png`}
          alt=""
          width={20}
          height={20}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-5 w-5 shrink-0 object-contain"
          // Most set symbols are dark designs meant for white card stock —
          // lift them slightly so they read on the dark panel.
          style={{ filter: "brightness(1.05) contrast(1.05)" }}
        />
      )}
      <span className="font-medium transition group-hover:text-accent">
        {setName}
      </span>
      <span className="text-muted nums">· {number}</span>
    </Link>
  );
}

export function PokemonChip({
  dex,
  size = "md",
}: {
  dex: number;
  size?: "sm" | "md";
}) {
  const entry = POKEDEX.find((p) => p.dex === dex);
  const dim = size === "sm" ? 22 : 28;
  return (
    <Link
      href={`/pokedex/${dex}`}
      className="group inline-flex items-center gap-2 text-text transition hover:text-accent"
    >
      <Image
        src={officialArtworkUrl(dex)}
        alt=""
        width={48}
        height={48}
        unoptimized
        className="shrink-0 object-contain"
        style={{ height: dim, width: dim }}
      />
      <span className="font-medium">{entry?.name ?? `#${dex}`}</span>
      <span className="text-muted nums">· #{dex}</span>
    </Link>
  );
}

// Compact inline evolution chain. Stages flow left-to-right with chevrons;
// the current Pokémon is tinted with the owned hue so the user can scan
// "where am I in this chain?" at a glance.
export function EvolutionRow({
  chain,
  currentDex,
}: {
  chain: number[][];
  currentDex: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chain.map((stage, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <ChevronRight
              aria-hidden
              className="h-3.5 w-3.5 text-muted/60"
            />
          )}
          <div className="flex flex-wrap gap-1">
            {stage.map((d) => (
              <EvoChip key={d} dex={d} highlight={d === currentDex} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EvoChip({ dex, highlight }: { dex: number; highlight?: boolean }) {
  const entry = POKEDEX.find((p) => p.dex === dex);
  return (
    <Link
      href={`/pokedex/${dex}`}
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition",
        highlight
          ? "border-owned/60 bg-owned/15 text-owned-dark dark:text-owned"
          : "border-border bg-panel-2 hover:border-accent hover:text-accent",
      ].join(" ")}
    >
      <Image
        src={officialArtworkUrl(dex)}
        alt=""
        width={20}
        height={20}
        unoptimized
        className="h-4 w-4 object-contain"
      />
      <span>{entry?.name ?? `#${dex}`}</span>
    </Link>
  );
}

// Plain pill for card-mechanic tags ("Stage 2", "MEGA", "ex") and the
// regulation mark. Quiet bordered chips — they're meaningful to collectors
// but shouldn't compete with type / rarity.
export function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-panel-2 px-2 py-0.5 text-[11px] font-medium text-text">
      {children}
    </span>
  );
}
