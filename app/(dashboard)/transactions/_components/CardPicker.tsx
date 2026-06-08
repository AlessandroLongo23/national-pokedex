"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, X } from "lucide-react";
import { SETS } from "@/lib/data";
import { RARITY_LABEL, type Rarity } from "@/lib/data/types";

// Shape returned by /api/cards/search. Larger image + rarity were added
// in this PR so the preview pane has everything it needs without a
// secondary fetch. Callers should treat this as the single canonical
// card-result shape across the transactions modals.
export interface CardPickerResult {
  id: string;
  name: string;
  setId: string;
  number: string;
  imageSmall: string;
  imageLarge: string;
  rarity: Rarity;
  regulationMark: string | null;
}

interface CardPickerSingleProps {
  mode: "single";
  onPick: (card: CardPickerResult) => void;
  picked?: never;
  onPickedChange?: never;
}

interface CardPickerMultiProps {
  mode: "multi";
  onPick?: never;
  picked: CardPickerResult[];
  onPickedChange: (next: CardPickerResult[]) => void;
}

type CardPickerProps = (CardPickerSingleProps | CardPickerMultiProps) & {
  /** Optional client-side filter applied after the API responds — used
   *  by Sell / PSA modals to restrict to owned cards. */
  filter?: (card: CardPickerResult) => boolean;
  /** Message shown when search returns zero (post-filter) results. */
  emptyMessage?: string;
  /** Focus the search input on mount. */
  autoFocus?: boolean;
};

const setNameById = new Map(SETS.map((s) => [s.id, s.name] as const));

// One stop for all card-search UI in the transactions area. The
// old inline `CardSearch` lived as three byte-identical copies in
// LogSingleModal / LogSaleModal / NewPsaModal with 36×28px thumbnails
// nobody could read at a glance. This component replaces them with a
// two-pane layout (list on the left, full-size card preview on the
// right) so the user can visually disambiguate prints like 21 different
// Sparks before committing.
export function CardPicker(props: CardPickerProps) {
  const { filter, emptyMessage, autoFocus } = props;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardPickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (autoFocus) {
      // setTimeout so the input is mounted in the surrounding modal
      // before we grab focus (mirror of the LogSingleModal pattern).
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setHoverIdx(0);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(trimmed)}&limit=20`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results: CardPickerResult[] };
        setResults(data.results);
        setHoverIdx(0);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  // In multi mode, hide already-picked cards so they don't appear twice
  // (matches the pre-refactor NewPsaModal behavior). N ≤ 20 results, so
  // computing inline is fine.
  const pickedIds =
    props.mode === "multi" ? new Set(props.picked.map((c) => c.id)) : null;
  const visible = results.filter((c) => {
    if (filter && !filter(c)) return false;
    if (pickedIds && pickedIds.has(c.id)) return false;
    return true;
  });

  const handlePick = (card: CardPickerResult) => {
    if (props.mode === "single") {
      props.onPick(card);
    } else {
      props.onPickedChange([...props.picked, card]);
    }
  };

  const handleUnpick = (cardId: string) => {
    if (props.mode === "multi") {
      props.onPickedChange(props.picked.filter((c) => c.id !== cardId));
    }
  };

  // Keep the focused list item in view when arrow keys move past the
  // viewport edge. Standalone behavior so callers don't have to wire
  // their own scrollIntoView.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[hoverIdx];
    if (item && "scrollIntoView" in item) {
      (item as HTMLElement).scrollIntoView({ block: "nearest" });
    }
  }, [hoverIdx, visible.length]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (visible.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const card = visible[hoverIdx];
      if (card) {
        handlePick(card);
        if (props.mode === "multi") {
          // Stay focused for rapid multi-pick; clear the query so the
          // user can search for the next card immediately.
          setQuery("");
        }
      }
    }
  };

  const preview = visible[hoverIdx] ?? null;
  const hasQuery = query.trim().length >= 2;

  return (
    <div className="flex flex-col gap-3 md:flex-row">
      <div className="flex w-full flex-col gap-2 md:w-[360px] md:shrink-0">
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search by card name…"
          className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none md:text-sm"
          aria-label="Search card"
        />
        <div className="min-h-[280px] max-h-[440px] overflow-y-auto rounded-md border border-border bg-panel-2">
          {!hasQuery ? (
            <p className="p-3 text-xs text-muted">Start typing to search.</p>
          ) : searching && visible.length === 0 ? (
            <p className="p-3 text-xs text-muted">Searching…</p>
          ) : visible.length === 0 ? (
            <p className="p-3 text-xs text-muted">
              {emptyMessage ?? "No matches."}
            </p>
          ) : (
            <ul ref={listRef}>
              {visible.map((c, i) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handlePick(c)}
                    onMouseEnter={() => setHoverIdx(i)}
                    className={[
                      "flex w-full items-start gap-3 px-2.5 py-2 text-left text-sm transition",
                      i === hoverIdx ? "bg-panel" : "hover:bg-panel/70",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.imageSmall}
                      alt=""
                      className="h-[66px] w-[48px] shrink-0 rounded-sm object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text">{c.name}</p>
                      <p className="truncate text-[11px] text-muted">
                        {setNameById.get(c.setId) ?? c.setId} · #{c.number}
                        {" · "}
                        {RARITY_LABEL[c.rarity] ?? c.rarity}
                      </p>
                    </div>
                    <span className="shrink-0 self-center text-[11px] text-muted tabular-nums">
                      {c.setId}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {props.mode === "multi" && props.picked.length > 0 && (
          <div className="space-y-1 rounded-md border border-accent/40 bg-accent/5 p-2">
            {props.picked.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.imageSmall}
                  alt=""
                  className="h-9 w-7 rounded-sm object-cover"
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{c.name}</p>
                  <p className="text-[11px] text-muted tabular-nums">
                    {c.setId}-{c.number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnpick(c.id)}
                  className="rounded-md p-2.5 text-muted transition hover:bg-panel hover:text-missing md:p-1"
                  aria-label={`Remove ${c.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <p className="px-1.5 pt-1 text-[11px] text-muted">
              <Check className="mr-1 inline h-3 w-3" aria-hidden />
              {props.picked.length} card
              {props.picked.length === 1 ? "" : "s"} selected
            </p>
          </div>
        )}
      </div>

      <div className="flex min-h-[280px] flex-1 items-start justify-center rounded-md border border-border bg-panel-2 p-4">
        {preview ? (
          <div className="flex w-full flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.imageLarge}
              alt={preview.name}
              className="max-h-[360px] w-auto rounded-md object-contain shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)]"
              loading="lazy"
            />
            <div className="w-full text-center">
              <p className="text-sm font-semibold text-text">{preview.name}</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {setNameById.get(preview.setId) ?? preview.setId} · #
                {preview.number}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-wider text-muted">
                {RARITY_LABEL[preview.rarity] ?? preview.rarity}
                {preview.regulationMark
                  ? ` · Regulation ${preview.regulationMark}`
                  : ""}
              </p>
            </div>
          </div>
        ) : (
          <p className="self-center text-center text-xs text-muted">
            {hasQuery
              ? "Hover or arrow-key through the list to preview a card."
              : "Type at least two characters to search."}
          </p>
        )}
      </div>
    </div>
  );
}
