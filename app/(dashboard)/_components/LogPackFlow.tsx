"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { SETS } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { logPack, updatePack } from "../_lib/pack-actions";
import { CardGrid } from "./CardGrid";
import { SeriesBadge } from "./SeriesBadge";

interface Props {
  initialSetId?: string;
  // When editing an existing pack: lock the set to `initialSetId`, pre-select
  // the existing cards, and route the save through `updatePack`.
  editingPackId?: string;
  initialPickedIds?: string[];
  initialOpenedAt?: string;
}

// Convert a Date / ISO string to the local `YYYY-MM-DDTHH:mm` value expected
// by <input type="datetime-local">. The browser interprets it in the user's
// local zone, which is what we want — packs are logged "when I opened them".
function toLocalInput(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function LogPackFlow({
  initialSetId,
  editingPackId,
  initialPickedIds,
  initialOpenedAt,
}: Props) {
  const router = useRouter();
  const editing = Boolean(editingPackId);
  const [setId, setSetId] = useState<string | null>(
    initialSetId && SETS.some((s) => s.id === initialSetId) ? initialSetId : null,
  );
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(initialPickedIds ?? []),
  );
  const [openedAtLocal, setOpenedAtLocal] = useState<string>(() => toLocalInput(initialOpenedAt));
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!setId) {
      setCards(null);
      return;
    }
    setLoadingCards(true);
    setCards(null);
    fetch(`/api/cards-by-set/${setId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: CardEntry[]) => setCards(data))
      .catch(() => setCards([]))
      .finally(() => setLoadingCards(false));
  }, [setId]);

  if (!setId) {
    return <SetPicker onPick={setSetId} />;
  }

  const set = SETS.find((s) => s.id === setId);
  if (!set) return null;

  const togglePick = (cardId: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        if (editingPackId) {
          await updatePack(editingPackId, [...picked], fromLocalInput(openedAtLocal));
          router.push(`/packs?edited=${editingPackId}`);
        } else {
          const { newCards } = await logPack(set.id, [...picked]);
          router.push(`/packs?logged=${set.id}&new=${newCards}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-3">
          <SeriesBadge series={set.series} />
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted">
              {editing ? "Editing a pack from" : "Logging a pack from"}
            </p>
            <p className="text-base font-semibold">{set.name}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing && (
            <label className="flex items-center gap-1.5 text-[11px] text-muted">
              <span className="uppercase tracking-wider">Opened</span>
              <input
                type="datetime-local"
                value={openedAtLocal}
                onChange={(e) => setOpenedAtLocal(e.target.value)}
                className="rounded-md border border-border bg-panel-2 px-2 py-1 text-xs text-text focus:border-accent focus:outline-none [color-scheme:dark]"
              />
            </label>
          )}
          {!editing && (
            <button
              type="button"
              onClick={() => {
                setSetId(null);
                setPicked(new Set());
              }}
              className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
            >
              Change set
            </button>
          )}
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            disabled={picked.size === 0}
            className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>

      <PickedTray picked={picked} cards={cards ?? []} onRemove={togglePick} />

      {loadingCards ? (
        <div className="rounded-lg border border-border bg-panel p-12 text-center text-sm text-muted">
          Loading cards…
        </div>
      ) : cards && cards.length > 0 ? (
        <CardGrid
          cards={cards}
          storageKey={`log-${set.id}`}
          selectMode
          selected={picked}
          onSelect={togglePick}
          hideActions
        />
      ) : (
        <div className="rounded-lg border border-border bg-panel p-12 text-center text-sm text-muted">
          No cards available to log from this set.
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t border-border bg-panel px-4 py-3 md:-mx-8 md:px-8">
        <div className="text-sm text-muted">
          {picked.size === 0 ? (
            <>Click cards in the grid to add them to this pack.</>
          ) : (
            <>
              <span className="font-semibold text-text nums">{picked.size}</span> card
              {picked.size === 1 ? "" : "s"} selected
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href="/packs" className="text-xs text-muted transition hover:text-text">
            Cancel
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={pending || (!editing && picked.size === 0)}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
          >
            {pending
              ? "Saving…"
              : editing
                ? `Save changes (${picked.size})`
                : `Save pack (${picked.size})`}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-missing">{error}</p>}
    </div>
  );
}

function PickedTray({
  picked,
  cards,
  onRemove,
}: {
  picked: Set<string>;
  cards: CardEntry[];
  onRemove: (cardId: string) => void;
}) {
  const items = useMemo(
    () => cards.filter((c) => picked.has(c.id)).sort((a, b) => a.numberInt - b.numberInt),
    [cards, picked],
  );

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-accent/40 bg-accent/5 p-3">
      {items.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onRemove(c.id)}
          className="group flex items-center gap-1.5 rounded-md bg-panel-2 px-2 py-1 text-xs transition hover:bg-missing/20"
          aria-label={`Remove ${c.name}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={c.imageSmall}
            alt=""
            className="h-8 w-6 rounded-sm object-cover"
            loading="lazy"
          />
          <span>{c.name}</span>
          <span className="text-muted nums">#{c.number}</span>
          <span className="text-muted group-hover:text-missing">×</span>
        </button>
      ))}
    </div>
  );
}

function SetPicker({ onPick }: { onPick: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const recent = [...SETS].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
    if (!needle) return recent;
    return recent.filter(
      (s) =>
        s.name.toLowerCase().includes(needle) ||
        s.series.toLowerCase().includes(needle) ||
        s.id.toLowerCase().includes(needle),
    );
  }, [query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel p-3">
        <p className="text-sm text-muted">Which set is this pack from?</p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search set name or series…"
          className="ml-auto w-64 rounded-md border border-border bg-panel-2 px-2.5 py-1 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
        />
      </div>
      <ul className="grid gap-1.5 md:grid-cols-2">
        {filtered.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onPick(s.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-panel px-3 py-2.5 text-left transition hover:border-accent hover:bg-panel-2"
            >
              <div className="flex items-center gap-2">
                <SeriesBadge series={s.series} />
                <span className="text-sm font-medium">{s.name}</span>
              </div>
              <span className="text-[11px] text-muted nums">{s.releaseDate}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
