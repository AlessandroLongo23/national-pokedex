"use client";

import { COVERAGE, POKEDEX } from "@/lib/data";
import { useOwnedCards } from "../_lib/OwnedCardsContext";

function pct(n: number, d: number): string {
  if (d === 0) return "0%";
  return `${((n / d) * 100).toFixed(1)}%`;
}

interface CardProps {
  label: string;
  value: number;
  primaryPct?: string;
  secondary?: React.ReactNode;
  tone: "neutral" | "covered" | "missing" | "owned";
  emphasised?: boolean;
}

function Card({ label, value, primaryPct, secondary, tone, emphasised }: CardProps) {
  const numColor =
    tone === "covered"
      ? "text-covered"
      : tone === "missing"
        ? "text-missing"
        : tone === "owned"
          ? "text-owned"
          : "text-text";
  const barColor =
    tone === "covered"
      ? "bg-covered"
      : tone === "missing"
        ? "bg-missing"
        : tone === "owned"
          ? "bg-owned"
          : "bg-accent";
  const barPct = primaryPct ? parseFloat(primaryPct) : 0;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-xl border bg-panel p-5",
        emphasised ? "border-owned/40" : "border-border",
      ].join(" ")}
    >
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-3 flex items-baseline gap-2 nums">
        <span className={`text-4xl font-bold tracking-tight ${numColor}`}>{value}</span>
        {primaryPct && <span className="text-sm font-semibold text-muted">{primaryPct}</span>}
      </div>
      {secondary && <div className="mt-1 text-xs text-muted nums">{secondary}</div>}
      {primaryPct && (
        <div className="absolute right-0 bottom-0 left-0 h-1 bg-panel-2">
          <div
            className={`h-full ${barColor} transition-[width] duration-500`}
            style={{ width: `${Math.min(100, barPct)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function KpiCards() {
  const { ownedSpecies, ownedCards } = useOwnedCards();
  const total = POKEDEX.length;
  const obtainable = COVERAGE.totalCovered;
  const missing = COVERAGE.totalMissing;
  const ownedCount = ownedSpecies.size;

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Card label="National Pokédex" value={total} tone="neutral" />
      <Card
        label="Obtainable from boosters"
        value={obtainable}
        primaryPct={pct(obtainable, total)}
        tone="covered"
      />
      <Card
        label="Must trade or buy singles"
        value={missing}
        primaryPct={pct(missing, total)}
        tone="missing"
      />
      <Card
        label="Owned"
        value={ownedCount}
        primaryPct={pct(ownedCount, total)}
        secondary={
          <>
            {ownedCards.size} cards · {pct(ownedCount, obtainable)} of obtainable
          </>
        }
        tone="owned"
        emphasised
      />
    </section>
  );
}
