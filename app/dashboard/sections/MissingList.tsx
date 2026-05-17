"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { COVERAGE, POKEDEX } from "@/lib/data";
import { spriteUrl } from "@/lib/pokeapi";

export function MissingList() {
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const byDex = new Map(POKEDEX.map((p) => [p.dex, p]));
    const all = COVERAGE.missingDex
      .map((d) => byDex.get(d))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (p) => p.name.toLowerCase().includes(needle) || String(p.dex) === needle,
    );
  }, [q]);

  return (
    <section className="my-8">
      <h2 className="mb-2 text-xl font-semibold">
        Missing from boosters{" "}
        <span className="ml-2 text-sm font-normal text-muted">
          ({COVERAGE.missingDex.length})
        </span>
      </h2>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or dex #…"
        className="mb-3 w-full max-w-xs rounded-md border border-border bg-panel px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
      />
      <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border bg-panel p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-1">
          {items.map((p) => (
            <div
              key={p.dex}
              className="flex items-center gap-2 rounded border-l-2 border-missing bg-missing/10 px-2 py-1 text-xs"
            >
              <Image
                src={spriteUrl(p.dex)}
                alt=""
                width={24}
                height={24}
                unoptimized
                loading="lazy"
                className="shrink-0"
              />
              <span className="min-w-0 truncate">
                <span className="mr-1 text-[10px] tabular-nums text-muted">#{p.dex}</span>
                {p.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
