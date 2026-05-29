"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid, List, Search, X } from "lucide-react";
import { formatSetCode, SETS } from "@/lib/data";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useSetAvailability } from "../_lib/SetAvailabilityContext";
import { useUser } from "../_lib/UserContext";
import { DEFAULT_SERIES_TINT, SERIES_TINT } from "./SeriesBadge";
import { SetAvailabilityToggle } from "./SetAvailabilityToggle";
import { Tooltip } from "./Tooltip";

type SortKey =
  | "releaseDate"
  | "name"
  | "cardCount"
  | "ownedCards"
  | "distinctPokemonCount"
  | "packsOpened";
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

export function SetsTable({
  packCountsBySet = {},
}: {
  packCountsBySet?: Record<string, number>;
}) {
  const { ownedCards } = useOwnedCards();
  const { isAvailable, overrides, clearAll } = useSetAvailability();
  const { isGuest } = useUser();
  const [sortKey, setSortKey] = useState<SortKey>("releaseDate");
  const [asc, setAsc] = useState(false);
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
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
        packsOpened: packCountsBySet[s.id] ?? 0,
      })),
    [ownedBySet, packCountsBySet],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter((s) => {
      if (availableOnly && !isAvailable(s.id)) return false;
      if (seriesFilter && s.series !== seriesFilter) return false;
      if (q && !s.name.toLowerCase().includes(q) && !s.series.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [enriched, seriesFilter, search, availableOnly, isAvailable]);

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-lg border border-border bg-panel p-3">
        <div className="relative min-w-0 flex-1 sm:min-w-[220px] sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sets or eras"
            aria-label="Search sets or eras"
            className="h-8 w-full rounded-md border border-border bg-panel-2 pl-8 pr-7 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted transition hover:text-text"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>

        <select
          value={seriesFilter ?? ""}
          onChange={(e) => setSeriesFilter(e.target.value || null)}
          aria-label="Filter by era"
          className="h-8 rounded-md border border-border bg-panel-2 px-2.5 pr-7 text-xs text-text focus:border-accent focus:outline-none [color-scheme:dark]"
        >
          {SERIES_GROUPS.map((g) => (
            <option key={g.label} value={g.value ?? ""}>
              {g.value === null ? "All eras" : g.label}
            </option>
          ))}
        </select>

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

        {!isGuest && overrides.size > 0 && (
          <Tooltip content="Forget your manual local-availability picks. Sets revert to the auto-detected default (recent sets stay available, older sets do not).">
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-panel-2 px-2 py-1 text-[11px] text-muted transition hover:border-accent hover:text-accent"
            >
              Reset {overrides.size} override{overrides.size === 1 ? "" : "s"}
            </button>
          </Tooltip>
        )}

        <ViewToggle view={view} onChange={setView} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
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
                    <Th k="packsOpened" className="text-right">Packs</Th>
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
                        <SetLogo setId={s.id} setName={s.name} logoUrl={s.logoUrl} size="sm" />
                        <span className="min-w-0 leading-tight">
                          <span className="block text-base font-semibold">{s.name}</span>
                          <span className="mt-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
                            <SetCodeBadge setId={s.id} series={s.series} />
                            {s.ptcgoCode && (
                              <span className="rounded border border-border bg-panel-2 px-1 py-px text-[10px] font-medium uppercase tracking-wider text-muted">
                                {s.ptcgoCode}
                              </span>
                            )}
                            <span>{s.series}</span>
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
                          {s.packsOpened > 0 ? (
                            <span className="text-base font-semibold">{s.packsOpened}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
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
            // Completed sets earn the emerald edge (celebration); untouched sets dim back so the started-but-unfinished middle pops when scanning.
            const stateClass = isGuest
              ? ""
              : s.cardCount > 0 && s.ownedCards >= s.cardCount
                ? "border-covered/70 hover:border-covered"
                : s.ownedCards === 0
                  ? "opacity-70 hover:opacity-100"
                  : "";
            return (
              <li key={s.id}>
                <div
                  className={`group relative flex h-full flex-col gap-3 rounded-xl border border-border bg-panel p-4 transition hover:border-border-strong ${stateClass}`}
                >
                  {!isGuest && (
                    <div className="absolute right-3 top-3 z-10">
                      <SetAvailabilityToggle setId={s.id} compact />
                    </div>
                  )}

                  <Link
                    href={`/sets/${s.id}`}
                    aria-label={s.name}
                    className="flex h-full flex-col gap-3"
                  >
                    <span className="flex h-20 items-center justify-center">
                      <SetLogo setId={s.id} setName={s.name} logoUrl={s.logoUrl} />
                    </span>

                    <span className="block min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <SetCodeBadge setId={s.id} series={s.series} />
                        {s.ptcgoCode && (
                          <span className="rounded border border-border bg-panel-2 px-1 py-px text-[10px] font-medium uppercase tracking-wider text-muted">
                            {s.ptcgoCode}
                          </span>
                        )}
                      </span>
                      <span className="mt-1 flex items-baseline gap-1.5 text-[11px] text-muted nums">
                        <span className="text-text">{s.distinctPokemonCount}</span>
                        <span>Pokémon</span>
                        <span aria-hidden>·</span>
                        <span>{s.cardCount} cards</span>
                        <span aria-hidden className="ml-auto opacity-60">{s.releaseDate}</span>
                      </span>
                    </span>

                    {!isGuest && (
                      <span className="mt-auto flex items-center gap-2 text-xs">
                        {s.ownedCards === 0 ? (
                          <span className="text-[11px] text-muted">Not started</span>
                        ) : (
                          <>
                            <span className="font-semibold text-owned nums">{s.ownedCards}</span>
                            <span className="text-muted nums">/ {s.cardCount}</span>
                            <span className="ml-auto h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                              <span
                                className="block h-full bg-owned"
                                style={{ width: `${ownedPct * 100}%` }}
                              />
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      </div>
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

function SetLogo({
  setId,
  setName,
  logoUrl,
  size = "lg",
}: {
  setId: string;
  setName: string;
  logoUrl?: string;
  size?: "sm" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span
        className={
          size === "sm"
            ? "flex h-10 w-[120px] flex-shrink-0 items-center justify-center text-center text-xs font-semibold tracking-tight text-text"
            : "text-sm font-bold tracking-tight text-text"
        }
      >
        {setName}
      </span>
    );
  }
  const src = logoUrl ?? `https://images.pokemontcg.io/${setId}/logo.png`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={setName}
      onError={() => setFailed(true)}
      loading="lazy"
      draggable={false}
      className={
        size === "sm"
          ? "h-10 w-[120px] flex-shrink-0 object-contain"
          : "max-h-16 w-auto max-w-[80%] object-contain drop-shadow-[0_3px_10px_rgba(0,0,0,0.3)]"
      }
    />
  );
}

function SetCodeBadge({ setId, series }: { setId: string; series: string }) {
  const tint = SERIES_TINT[series] ?? DEFAULT_SERIES_TINT;
  return (
    <span
      className={[
        "inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider",
        tint,
      ].join(" ")}
    >
      {formatSetCode(setId)}
    </span>
  );
}
