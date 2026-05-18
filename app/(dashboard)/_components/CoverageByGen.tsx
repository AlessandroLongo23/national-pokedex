"use client";

import { COVERAGE, POKEDEX } from "@/lib/data";
import { GEN_NAMES, GEN_RANGES, type Generation } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";

const GENS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[];

export function CoverageByGen() {
  const { ownedSpecies } = useOwnedCards();

  return (
    <section className="rounded-xl border border-border bg-panel">
      <div className="flex items-baseline justify-between border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold">Coverage by generation</h2>
        <div className="flex gap-3 text-[10px] uppercase tracking-wider text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-owned" />
            Owned
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-covered" />
            Obtainable
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm bg-missing/60" />
            Singles only
          </span>
        </div>
      </div>
      <div className="divide-y divide-border">
        {GENS.map((g) => {
          const { covered, total } = COVERAGE.byGen[g];
          const [lo, hi] = GEN_RANGES[g];
          let ownedHere = 0;
          for (const p of POKEDEX) if (p.gen === g && ownedSpecies.has(p.dex)) ownedHere++;
          const ownedPct = total === 0 ? 0 : (ownedHere / total) * 100;
          const obtainablePct = total === 0 ? 0 : (covered / total) * 100;

          return (
            <div
              key={g}
              className="grid grid-cols-[140px_1fr_140px] items-center gap-4 px-5 py-3 text-sm md:grid-cols-[160px_1fr_180px]"
            >
              <div className="min-w-0">
                <div className="font-semibold">{GEN_NAMES[g]}</div>
                <div className="text-[11px] text-muted nums">Gen {g} · #{lo}–{hi}</div>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-panel-2">
                {/* obtainable layer (back) */}
                <div
                  className="absolute inset-y-0 left-0 bg-covered/30"
                  style={{ width: `${obtainablePct}%` }}
                />
                {/* owned layer (front) */}
                <div
                  className="absolute inset-y-0 left-0 bg-owned transition-[width] duration-500"
                  style={{ width: `${ownedPct}%` }}
                />
              </div>
              <div className="text-right text-xs nums">
                <span className="font-semibold text-owned">{ownedHere}</span>
                <span className="text-muted"> / {covered}</span>
                <span className="text-muted"> obtainable</span>
                {total !== covered && (
                  <span className="text-muted"> · {total - covered} singles</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
