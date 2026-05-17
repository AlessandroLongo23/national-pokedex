"use client";

import { COVERAGE, POKEDEX } from "@/lib/data";
import { useOwned } from "../OwnedContext";

export function HeadlineStats() {
  const { owned } = useOwned();
  const stats: { num: number; label: string; tone?: "covered" | "missing" | "me" | "owned" }[] = [
    { num: POKEDEX.length, label: "National Pokédex (Gen 1–9)" },
    { num: COVERAGE.totalCovered, label: "Obtainable from boosters", tone: "covered" },
    { num: COVERAGE.totalMissing, label: "Must trade / buy singles", tone: "missing" },
    { num: COVERAGE.meAdded.length, label: "Added by ME (vs SV only)", tone: "me" },
    { num: owned.size, label: "Owned (click cells to mark)", tone: "owned" },
  ];

  const toneColor: Record<string, string> = {
    covered: "text-covered",
    missing: "text-missing",
    me: "text-me-tint",
    owned: "text-owned",
  };

  return (
    <section className="my-6 grid grid-cols-2 gap-3 md:grid-cols-5">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-panel p-4">
          <div
            className={`text-3xl font-bold tracking-tight tabular-nums ${
              s.tone ? toneColor[s.tone] : ""
            }`}
          >
            {s.num}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wider text-muted">{s.label}</div>
        </div>
      ))}
    </section>
  );
}
