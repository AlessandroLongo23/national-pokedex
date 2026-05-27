"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid, List } from "lucide-react";
import { SETS } from "@/lib/data";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useSetAvailability } from "../_lib/SetAvailabilityContext";
import { useUser } from "../_lib/UserContext";
import { SeriesBadge } from "./SeriesBadge";
import { SetAvailabilityToggle } from "./SetAvailabilityToggle";

type SortKey = "releaseDate" | "name" | "cardCount" | "ownedCards" | "distinctPokemonCount";
type ViewMode = "list" | "grid";

// Series chips are derived from the data — most recently active series first
// (by latest release date in that series). Keeping the list dynamic means new
// series get picked up automatically as the catalog grows.
const SERIES_GROUPS: { label: string; value: string | null }[] = (() => {
  const latestBySeries = new Map<string, string>();
  for (const s of SETS) {
    const prev = latestBySeries.get(s.series);
    if (!prev || s.releaseDate > prev) latestBySeries.set(s.series, s.releaseDate);
  }
  const ordered = [...latestBySeries.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([series]) => ({ label: series, value: series }));
  return [{ label: "All", value: null }, ...ordered];
})();

const VIEW_STORAGE_KEY = "sets-view";

export function SetsTable() {
  const { ownedCards } = useOwnedCards();
  const { isAvailable } = useSetAvailability();
  const { isGuest } = useUser();
  const [sortKey, setSortKey] = useState<SortKey>("releaseDate");
  const [asc, setAsc] = useState(false);
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);
  const [availableOnly, setAvailableOnly] = useState(false);
  // Read the persisted view on the first client render so the table doesn't
  // flash through "list" before flipping to the stored value. The SSR-side
  // pass returns "list" (no localStorage there) — the brief hydration delta
  // is acceptable for a layout toggle and avoids the two-effect write race
  // where the initial mount would otherwise overwrite the stored value with
  // the default before the read finished.
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const stored = window.localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === "grid" ? "grid" : "list";
  });

  useEffect(() => {
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  const ownedBySet = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of ownedCards) {
      const setId = id.replace(/-[^-]+$/, "");
      m.set(setId, (m.get(setId) ?? 0) + 1);
    }
    return m;
  }, [ownedCards]);

  const enriched = useMemo(
    () =>
      SETS.map((s) => ({
        ...s,
        ownedCards: ownedBySet.get(s.id) ?? 0,
      })),
    [ownedBySet],
  );

  const filtered = useMemo(() => {
    return enriched.filter((s) => {
      if (availableOnly && !isAvailable(s.id)) return false;
      if (!seriesFilter) return true;
      return s.series === seriesFilter;
    });
  }, [enriched, seriesFilter, availableOnly, isAvailable]);

  const rows = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, asc]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };

  const Th = ({
    k,
    children,
    className = "",
  }: {
    k: SortKey;
    children: React.ReactNode;
    className?: string;
  }) => (
    <th
      onClick={() => onSort(k)}
      className={`cursor-pointer bg-panel-2 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted transition hover:text-accent ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sortKey === k ? (
          asc ? (
            <ChevronUp className="h-3 w-3 opacity-70" aria-hidden />
          ) : (
            <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
          )
        ) : null}
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-panel p-3">
        <div className="flex flex-wrap gap-1.5">
          {SERIES_GROUPS.map((g) => (
            <button
              key={g.label}
              type="button"
              onClick={() => setSeriesFilter(g.value)}
              className={[
                "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wider transition",
                seriesFilter === g.value
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-text",
              ].join(" ")}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <ViewToggle view={view} onChange={setView} />
          {!isGuest && (
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
              />
              Available locally only
            </label>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-panel p-10 text-center text-sm text-muted">
          No sets match this filter.
        </div>
      ) : view === "list" ? (
        <div className="overflow-x-auto rounded-xl border border-border bg-panel">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <Th k="name" className="text-left">Set</Th>
                <Th k="releaseDate" className="text-right">Released</Th>
                <Th k="cardCount" className="text-right">Cards</Th>
                <Th k="distinctPokemonCount" className="text-right">Pokémon</Th>
                {!isGuest && (
                  <>
                    <Th k="ownedCards" className="text-right">Owned</Th>
                    <th className="bg-panel-2 px-4 py-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                      Local
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const ownedPct = s.cardCount === 0 ? 0 : s.ownedCards / s.cardCount;
                return (
                  <tr key={s.id} className="border-t border-border transition hover:bg-panel-2">
                    <td className="px-4 py-4">
                      <Link href={`/sets/${s.id}`} className="flex items-center gap-3.5">
                        <SetSymbol setId={s.id} series={s.series} size={40} />
                        <span className="min-w-0 leading-tight">
                          <span className="block text-base font-semibold">{s.name}</span>
                          <span className="mt-0.5 block text-[11px] uppercase tracking-wider text-muted">
                            {s.series}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-right text-xs text-muted nums">{s.releaseDate}</td>
                    <td className="px-4 py-4 text-right text-base nums">{s.cardCount}</td>
                    <td className="px-4 py-4 text-right text-muted nums">{s.distinctPokemonCount}</td>
                    {!isGuest && (
                      <>
                        <td className="px-4 py-4 text-right nums">
                          <div className="inline-flex items-center gap-2.5">
                            <span className="text-base font-semibold text-owned">{s.ownedCards}</span>
                            <span className="text-muted">/ {s.cardCount}</span>
                            <span className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-panel-2">
                              <span
                                className="block h-full bg-owned"
                                style={{ width: `${ownedPct * 100}%` }}
                              />
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <SetAvailabilityToggle setId={s.id} compact />
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((s) => {
            const ownedPct = s.cardCount === 0 ? 0 : s.ownedCards / s.cardCount;
            return (
              <li key={s.id}>
                <div className="group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-panel p-4 transition hover:border-border-strong">
                  <div className="flex items-start justify-between gap-2">
                    <SeriesBadge series={s.series} />
                    {!isGuest && <SetAvailabilityToggle setId={s.id} compact />}
                  </div>

                  <Link
                    href={`/sets/${s.id}`}
                    className="flex h-20 items-center justify-center rounded-lg bg-bg/50 transition group-hover:bg-bg/70"
                  >
                    <SetLogo setId={s.id} setName={s.name} />
                  </Link>

                  <Link href={`/sets/${s.id}`} className="block min-w-0">
                    <span className="block truncate text-base font-semibold transition group-hover:text-accent">
                      {s.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted nums">
                      {s.releaseDate} · {s.cardCount} cards · {s.distinctPokemonCount} Pokémon
                    </span>
                  </Link>

                  {!isGuest && (
                    <div className="mt-auto flex items-center gap-2 text-xs">
                      <span className="font-semibold text-owned nums">{s.ownedCards}</span>
                      <span className="text-muted nums">/ {s.cardCount}</span>
                      <span className="ml-auto h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                        <span
                          className="block h-full bg-owned"
                          style={{ width: `${ownedPct * 100}%` }}
                        />
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="View mode"
      className="inline-flex rounded-md border border-border bg-panel-2 p-0.5"
    >
      <ToggleButton active={view === "list"} onClick={() => onChange("list")} label="List view">
        <List className="h-3.5 w-3.5" aria-hidden />
      </ToggleButton>
      <ToggleButton active={view === "grid"} onClick={() => onChange("grid")} label="Grid view">
        <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
      </ToggleButton>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
  label,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[
        "flex h-7 w-7 items-center justify-center rounded transition",
        active
          ? "bg-accent/15 text-accent"
          : "text-muted hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SetSymbol({
  setId,
  series,
  size,
}: {
  setId: string;
  series: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className="flex flex-shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        <SeriesBadge series={series} />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://images.pokemontcg.io/${setId}/symbol.png`}
      alt=""
      onError={() => setFailed(true)}
      loading="lazy"
      draggable={false}
      className="flex-shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}

function SetLogo({ setId, setName }: { setId: string; setName: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return <span className="text-sm font-bold tracking-tight text-text">{setName}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://images.pokemontcg.io/${setId}/logo.png`}
      alt={setName}
      onError={() => setFailed(true)}
      loading="lazy"
      draggable={false}
      className="max-h-16 w-auto max-w-[80%] object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.3)]"
    />
  );
}
