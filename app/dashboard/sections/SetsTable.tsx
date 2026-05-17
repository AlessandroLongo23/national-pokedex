"use client";

import { useMemo, useState } from "react";
import { SETS } from "@/lib/data";

type SortKey = "releaseDate" | "name" | "distinctPokemonCount" | "uniqueCount";

export function SetsTable() {
  const [sortKey, setSortKey] = useState<SortKey>("releaseDate");
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    const copy = [...SETS];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [sortKey, asc]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(true);
    }
  };

  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) => (
    <th
      onClick={() => onSort(k)}
      className="cursor-pointer bg-panel-2 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted hover:text-accent"
    >
      {children} {sortKey === k ? (asc ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <section className="my-8">
      <h2 className="mb-4 text-xl font-semibold">Sets</h2>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse bg-panel text-sm">
          <thead>
            <tr>
              <Th k="name">Set</Th>
              <Th k="releaseDate">Released</Th>
              <Th k="distinctPokemonCount">Distinct Pkmn</Th>
              <Th k="uniqueCount">Unique to set</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-3 py-2.5">
                  <span
                    className={`mr-2 inline-block rounded-full border px-2 py-0.5 align-middle text-[10px] font-semibold ${
                      s.series === "Mega Evolution"
                        ? "border-me-tint/40 bg-me-tint/15 text-me-tint"
                        : "border-sv-tint/35 bg-sv-tint/15 text-sv-tint"
                    }`}
                  >
                    {s.series === "Mega Evolution" ? "ME" : "SV"}
                  </span>
                  {s.name}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.releaseDate}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.distinctPokemonCount}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{s.uniqueCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
