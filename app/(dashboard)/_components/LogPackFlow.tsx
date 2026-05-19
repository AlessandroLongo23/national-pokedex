"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CalendarClock, ChevronDown, Tag, X } from "lucide-react";
import { SETS } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import {
  formatMoneyCents,
  isLedgerCurrency,
  LEDGER_CURRENCIES,
  type LedgerCurrency,
  parseMoneyCents,
} from "@/lib/ledger/money";
import { deletePack, logPack, updatePack } from "../_lib/pack-actions";
import { useSetPageTitle } from "../_lib/PageTitleContext";
import { CardGrid } from "./CardGrid";
import { SeriesBadge } from "./SeriesBadge";

interface Props {
  initialSetId?: string;
  // Currency to default the price-paid field to when the user hasn't set
  // one yet — driven by the user's price-source preference upstream.
  defaultCurrency: LedgerCurrency;
  // When editing an existing pack: lock the set to `initialSetId`, pre-select
  // the existing cards, and route the save through `updatePack`.
  editingPackId?: string;
  editingSetName?: string;
  editingSetSeries?: string;
  initialPickedIds?: string[];
  initialOpenedAt?: string;
  initialCostCents?: number | null;
  initialCurrency?: LedgerCurrency | null;
}

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

function splitLocalInput(value: string): { date: string; time: string } {
  // "2026-04-10T21:56" → { date: "2026-04-10", time: "21:56" }
  const [date = "", time = ""] = value.split("T");
  return { date, time };
}

function joinLocalInput(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}

function formatOpenedAt(value: string): string {
  if (!value) return "Set a date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Set a date";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LogPackFlow({
  initialSetId,
  defaultCurrency,
  editingPackId,
  editingSetName,
  editingSetSeries,
  initialPickedIds,
  initialOpenedAt,
  initialCostCents,
  initialCurrency,
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
  const initialOpenedAtLocal = useMemo(() => toLocalInput(initialOpenedAt), [initialOpenedAt]);
  const [costCents, setCostCents] = useState<number | null>(initialCostCents ?? null);
  const [currency, setCurrency] = useState<LedgerCurrency>(
    initialCurrency ?? defaultCurrency,
  );
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [loadingCards, setLoadingCards] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

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

  const initialSet = useMemo(() => new Set(initialPickedIds ?? []), [initialPickedIds]);
  const { added, removed } = useMemo(() => {
    if (!editing) return { added: 0, removed: 0 };
    let a = 0;
    let r = 0;
    for (const id of picked) if (!initialSet.has(id)) a++;
    for (const id of initialSet) if (!picked.has(id)) r++;
    return { added: a, removed: r };
  }, [editing, picked, initialSet]);

  const costDirty = useMemo(() => {
    if (!editing) return costCents != null;
    const baseCost = initialCostCents ?? null;
    const baseCurrency = initialCurrency ?? defaultCurrency;
    return costCents !== baseCost || currency !== baseCurrency;
  }, [editing, costCents, currency, initialCostCents, initialCurrency, defaultCurrency]);

  const dirty = useMemo(() => {
    if (!editing) return picked.size > 0 || costDirty;
    if (added > 0 || removed > 0) return true;
    if (openedAtLocal !== initialOpenedAtLocal) return true;
    return costDirty;
  }, [editing, picked.size, added, removed, openedAtLocal, initialOpenedAtLocal, costDirty]);

  // beforeunload guard so a stray Cmd-W doesn't silently drop edits.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
          await updatePack(editingPackId, [...picked], {
            openedAt: fromLocalInput(openedAtLocal),
            costCents,
            currency,
          });
          router.push(`/packs?edited=${editingPackId}`);
        } else {
          const { newCards } = await logPack(set.id, [...picked], {
            costCents,
            currency,
          });
          router.push(`/packs?logged=${set.id}&new=${newCards}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const performEmpty = () => {
    if (!editingPackId) return;
    setError(null);
    start(async () => {
      try {
        await deletePack(editingPackId);
        router.push(`/packs?deleted=${editingPackId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const guardExit = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!dirty) return;
    if (!window.confirm("Discard unsaved changes to this pack?")) {
      e.preventDefault();
    }
  };

  return (
    <div className="space-y-5">
      {editing ? (
        <EditContextBar
          setName={editingSetName ?? set.name}
          series={editingSetSeries ?? set.series}
          openedAtLocal={openedAtLocal}
          onOpenedAtChange={setOpenedAtLocal}
          dirtyDate={openedAtLocal !== initialOpenedAtLocal}
          costCents={costCents}
          currency={currency}
          onCostChange={setCostCents}
          onCurrencyChange={setCurrency}
          dirtyCost={costDirty}
          onExitClick={guardExit}
        />
      ) : (
        <LoggingContextBar
          set={set}
          onChangeSet={() => {
            setSetId(null);
            setPicked(new Set());
          }}
          onClear={() => setPicked(new Set())}
          canClear={picked.size > 0}
          costCents={costCents}
          currency={currency}
          onCostChange={setCostCents}
          onCurrencyChange={setCurrency}
          dirtyCost={costDirty}
        />
      )}

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

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-panel/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <FooterStatus
          editing={editing}
          picked={picked}
          added={added}
          removed={removed}
          dirty={dirty}
          confirmingEmpty={confirmingEmpty}
        />
        <div className="flex items-center gap-2">
          {confirmingEmpty ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingEmpty(false)}
                className="rounded-md border border-border bg-panel-2 px-3 py-2 text-xs text-muted transition hover:text-text"
              >
                Keep pack
              </button>
              <button
                type="button"
                onClick={performEmpty}
                disabled={pending}
                className="rounded-md border border-missing/70 bg-missing/15 px-4 py-2 text-sm font-semibold text-missing transition hover:bg-missing/25 disabled:opacity-50"
              >
                {pending ? "Removing…" : "Yes, delete pack"}
              </button>
            </>
          ) : editing && picked.size === 0 ? (
            <button
              type="button"
              onClick={() => setConfirmingEmpty(true)}
              className="rounded-md border border-missing/60 bg-transparent px-4 py-2 text-sm font-semibold text-missing transition hover:bg-missing/15"
            >
              Empty this pack
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending || (!editing && picked.size === 0) || (editing && !dirty)}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-40"
            >
              {pending
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : `Save pack (${picked.size})`}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-missing">{error}</p>}
    </div>
  );
}

function EditContextBar({
  setName,
  series,
  openedAtLocal,
  onOpenedAtChange,
  dirtyDate,
  costCents,
  currency,
  onCostChange,
  onCurrencyChange,
  dirtyCost,
  onExitClick,
}: {
  setName: string;
  series: string;
  openedAtLocal: string;
  onOpenedAtChange: (value: string) => void;
  dirtyDate: boolean;
  costCents: number | null;
  currency: LedgerCurrency;
  onCostChange: (cents: number | null) => void;
  onCurrencyChange: (c: LedgerCurrency) => void;
  dirtyCost: boolean;
  onExitClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  useSetPageTitle(setName);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg border border-border bg-panel px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <SeriesBadge series={series} />
        <div className="min-w-0">
          <p className="eyebrow">Edit pack</p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-text">{setName}</h1>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <PricePaidField
          costCents={costCents}
          currency={currency}
          onCostChange={onCostChange}
          onCurrencyChange={onCurrencyChange}
          dirty={dirtyCost}
        />
        <OpenedAtField
          value={openedAtLocal}
          onChange={onOpenedAtChange}
          dirty={dirtyDate}
        />
        <Link
          href="/packs"
          onClick={onExitClick}
          className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
        >
          Exit
        </Link>
      </div>
    </div>
  );
}

function LoggingContextBar({
  set,
  onChangeSet,
  onClear,
  canClear,
  costCents,
  currency,
  onCostChange,
  onCurrencyChange,
  dirtyCost,
}: {
  set: { id: string; name: string; series: string };
  onChangeSet: () => void;
  onClear: () => void;
  canClear: boolean;
  costCents: number | null;
  currency: LedgerCurrency;
  onCostChange: (cents: number | null) => void;
  onCurrencyChange: (c: LedgerCurrency) => void;
  dirtyCost: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel p-4">
      <div className="flex items-center gap-3">
        <SeriesBadge series={set.series} />
        <div>
          <p className="eyebrow">Logging a pack from</p>
          <p className="text-base font-semibold">{set.name}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <PricePaidField
          costCents={costCents}
          currency={currency}
          onCostChange={onCostChange}
          onCurrencyChange={onCurrencyChange}
          dirty={dirtyCost}
        />
        <button
          type="button"
          onClick={onChangeSet}
          className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
        >
          Change set
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text disabled:opacity-40"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function OpenedAtField({
  value,
  onChange,
  dirty,
}: {
  value: string;
  onChange: (v: string) => void;
  dirty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setNow = useCallback(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    onChange(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
    );
  }, [onChange]);

  const { date, time } = splitLocalInput(value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          "inline-flex items-center gap-2 rounded-md border bg-panel-2 px-3 py-1.5 text-xs transition",
          dirty
            ? "border-accent/60 text-text"
            : "border-border text-muted hover:text-text",
        ].join(" ")}
      >
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        <span className="nums">Opened {formatOpenedAt(value)}</span>
        <ChevronDown
          className={[
            "h-3.5 w-3.5 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-[280px] rounded-lg border border-border-strong bg-panel p-3 shadow-[0_18px_44px_-16px_rgb(0_0_0/0.7)]"
          role="dialog"
          aria-label="Pack opened at"
        >
          <p className="eyebrow mb-2">When did you open it?</p>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => onChange(joinLocalInput(e.target.value, time))}
              className="flex-1 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none [color-scheme:dark]"
              aria-label="Date"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => onChange(joinLocalInput(date, e.target.value))}
              className="w-[96px] rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none [color-scheme:dark]"
              aria-label="Time"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={setNow}
              className="text-[11px] text-muted underline-offset-2 transition hover:text-text hover:underline"
            >
              Set to now
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-border bg-panel-2 px-2.5 py-1 text-[11px] text-text transition hover:border-accent/60"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PricePaidField({
  costCents,
  currency,
  onCostChange,
  onCurrencyChange,
  dirty,
}: {
  costCents: number | null;
  currency: LedgerCurrency;
  onCostChange: (cents: number | null) => void;
  onCurrencyChange: (c: LedgerCurrency) => void;
  dirty: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(
    costCents != null ? (costCents / 100).toFixed(2) : "",
  );
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the draft text in sync if the canonical value changes from
  // outside (initial load, parent reset). Only resync when not editing
  // so we don't yank what the user is typing.
  useEffect(() => {
    if (open) return;
    setDraft(costCents != null ? (costCents / 100).toFixed(2) : "");
  }, [costCents, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = () => {
    if (draft.trim() === "") {
      onCostChange(null);
      return;
    }
    const parsed = parseMoneyCents(draft);
    if (parsed != null) onCostChange(parsed);
  };

  const label = costCents != null ? `Paid ${formatMoneyCents(costCents, currency)}` : "Add price";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={[
          "inline-flex items-center gap-2 rounded-md border bg-panel-2 px-3 py-1.5 text-xs transition",
          dirty
            ? "border-accent/60 text-text"
            : "border-border text-muted hover:text-text",
        ].join(" ")}
      >
        <Tag className="h-3.5 w-3.5" aria-hidden />
        <span className="nums">{label}</span>
        <ChevronDown
          className={[
            "h-3.5 w-3.5 transition-transform duration-200",
            open ? "rotate-180" : "",
          ].join(" ")}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-[260px] rounded-lg border border-border-strong bg-panel p-3 shadow-[0_18px_44px_-16px_rgb(0_0_0/0.7)]"
          role="dialog"
          aria-label="Pack price paid"
        >
          <p className="eyebrow mb-2">How much did this pack cost?</p>
          <div className="flex gap-2">
            <select
              value={currency}
              onChange={(e) => {
                const next = e.target.value;
                if (isLedgerCurrency(next)) onCurrencyChange(next);
              }}
              className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none [color-scheme:dark]"
              aria-label="Currency"
            >
              {LEDGER_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commit();
                  setOpen(false);
                }
              }}
              placeholder="0.00"
              className="flex-1 rounded-md border border-border bg-panel-2 px-2 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
              aria-label="Price paid"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setDraft("");
                onCostChange(null);
              }}
              className="text-[11px] text-muted underline-offset-2 transition hover:text-text hover:underline"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                commit();
                setOpen(false);
              }}
              className="rounded-md border border-border bg-panel-2 px-2.5 py-1 text-[11px] text-text transition hover:border-accent/60"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FooterStatus({
  editing,
  picked,
  added,
  removed,
  dirty,
  confirmingEmpty,
}: {
  editing: boolean;
  picked: Set<string>;
  added: number;
  removed: number;
  dirty: boolean;
  confirmingEmpty: boolean;
}) {
  if (confirmingEmpty) {
    return (
      <p className="max-w-[40ch] text-sm text-text">
        This deletes the pack record. Cards already marked owned stay owned.
      </p>
    );
  }
  if (editing) {
    if (picked.size === 0) {
      return (
        <p className="text-sm text-muted">
          No cards left in this pack. Saving will delete the record.
        </p>
      );
    }
    if (!dirty) {
      return <p className="text-sm text-muted">No changes yet.</p>;
    }
    return (
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted">
        {added > 0 && (
          <span className="nums font-medium text-covered">+{added} added</span>
        )}
        {removed > 0 && (
          <span className="nums font-medium text-missing">−{removed} removed</span>
        )}
        <span className="nums text-muted">
          {picked.size} card{picked.size === 1 ? "" : "s"} total
        </span>
      </p>
    );
  }
  if (picked.size === 0) {
    return <p className="text-sm text-muted">Click cards to add them to this pack.</p>;
  }
  return (
    <p className="text-sm text-muted">
      <span className="nums font-semibold text-text">{picked.size}</span> in this pack
    </p>
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
          className="group flex items-center gap-1.5 rounded-md bg-panel-2 px-2 py-1 text-xs transition hover:bg-panel-3"
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
          <X
            className="h-3 w-3 text-muted transition-colors group-hover:text-missing"
            aria-hidden
          />
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
