"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { POKEDEX } from "@/lib/data";
import type { Rarity } from "@/lib/data/types";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { typeRgb } from "../../../_components/pokemonTypeColors";

// Type pill — colored to the type's canonical hue. Pokémon types carry a
// strong visual association in fans' heads; using the recognized color does
// the icon's job without inventing pictograms.
export function TypeChip({ type }: { type: string }) {
  const rgb = typeRgb(type);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
      style={{
        backgroundColor: `rgb(${rgb} / 0.12)`,
        borderColor: `rgb(${rgb} / 0.55)`,
        color: `rgb(${rgb} / 1)`,
      }}
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `rgb(${rgb} / 1)` }}
      />
      {type}
    </span>
  );
}

const RARITY_RGB: Record<Rarity, string> = {
  Common: "138 147 163",
  Uncommon: "134 239 172",
  Rare: "147 197 253",
  DoubleRare: "96 165 250",
  UltraRare: "196 181 253",
  IllustrationRare: "240 171 252",
  SpecialIllustrationRare: "253 164 175",
  HyperRare: "252 211 77",
  Promo: "138 147 163",
  Unknown: "138 147 163",
};

export function RarityBadge({ rarity, label }: { rarity: Rarity; label: string }) {
  const rgb = RARITY_RGB[rarity];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
      style={{
        backgroundColor: `rgb(${rgb} / 0.12)`,
        borderColor: `rgb(${rgb} / 0.55)`,
        color: `rgb(${rgb} / 1)`,
      }}
    >
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
