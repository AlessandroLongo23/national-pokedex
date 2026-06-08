"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CalendarClock, ChevronDown, Layers, Tag, X } from "lucide-react";
import type { CardEntry } from "@/lib/data/types";
import {
  formatMoneyCents,
  isLedgerCurrency,
  parseMoneyCents,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/currencies";
import { applyCardFilters } from "../_lib/catalog-filter";
import { sortCards, type CardSort } from "../_lib/card-sort";
import { deleteCardLot, logCardLot, updateCardLot } from "../_lib/lot-actions";
import { VirtualizedCardGrid } from "../cards/_components/VirtualizedCardGrid";
import {
  CardFiltersToolbar,
  emptyFilters,
  type CardsFilterState,
} from "./CardFiltersToolbar";

interface Props {
  cards: CardEntry[];
  artists: string[];
  types: string[];
  defaultCurrency: LedgerCurrency;
  // Edit mode:
  editingLotId?: string;
  initialContents?: { cardId: string; quantity: number }[];
  initialPurchasedAt?: string;
  initialCostCents?: number | null;
  initialCurrency?: LedgerCurrency | null;
  // When set, this create-mode flow is consolidating existing single
  // purchases; saving creates the lot AND deletes these single txn rows.
  sourceSingleIds?: string[];
}

const SIZE_KEY = "cardgrid.size.lot-flow";

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
  const [date = "", time = ""] = value.split("T");
  return { date, time };
}
function joinLocalInput(date: string, time: string): string {
  if (!date) return "";
  return `${date}T${time || "00:00"}`;
}
function formatPurchasedAt(value: string): string {
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

export function LogLotFlow({
  cards,
  artists,
  types,
  defaultCurrency,
  editingLotId,
  initialContents,
  initialPurchasedAt,
  initialCostCents,
  initialCurrency,
  sourceSingleIds,
}: Props) {
  const router = useRouter();
  const editing = Boolean(editingLotId);

  const [picked, setPicked] = useState<Map<string, number>>(
    () => new Map((initialContents ?? []).map((c) => [c.cardId, c.quantity])),
  );
  const [costCents, setCostCents] = useState<number | null>(initialCostCents ?? null);
  const [currency, setCurrency] = useState<LedgerCurrency>(initialCurrency ?? defaultCurrency);
  const [purchasedAtLocal, setPurchasedAtLocal] = useState<string>(() =>
    toLocalInput(initialPurchasedAt),
  );

  const [filters, setFilters] = useState<CardsFilterState>(() => emptyFilters());
  const [sort, setSort] = useState<CardSort>("number");
  const [cols, setCols] = useState(5);
  const [searchDebounced, setSearchDebounced] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingEmpty, setConfirmingEmpty] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.search), 150);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    const raw = window.localStorage.getItem(SIZE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) setCols(Math.max(2, Math.min(10, n)));
    }
  }, []);
  useEffect(() => {
    window.localStorage.setItem(SIZE_KEY, String(cols));
  }, [cols]);

  const filtered = useMemo(
    () => applyCardFilters(cards, filters, searchDebounced),
    [cards, filters, searchDebounced],
  );
  const sorted = useMemo(() => sortCards(filtered, sort), [filtered, sort]);
  const cardsById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const initialMap = useMemo(
    () => new Map((initialContents ?? []).map((c) => [c.cardId, c.quantity])),
    [initialContents],
  );

  const distinct = picked.size;
  let copies = 0;
  for (const q of picked.values()) copies += q;

  const dirty = useMemo(() => {
    if (!editing) return picked.size > 0 || costCents != null;
    if (picked.size !== initialMap.size) return true;
    for (const [id, q] of picked) if (initialMap.get(id) !== q) return true;
    if (purchasedAtLocal !== toLocalInput(initialPurchasedAt)) return true;
    const baseCost = initialCostCents ?? null;
    const baseCurrency = initialCurrency ?? defaultCurrency;
    return costCents !== baseCost || currency !== baseCurrency;
  }, [
    editing,
    picked,
    initialMap,
    purchasedAtLocal,
    initialPurchasedAt,
    costCents,
    currency,
    initialCostCents,
    initialCurrency,
    defaultCurrency,
  ]);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const setQuantity = useCallback((cardId: string, quantity: number) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (quantity <= 0) next.delete(cardId);
      else next.set(cardId, Math.min(99, quantity));
      return next;
    });
  }, []);

  const submit = () => {
    setError(null);
    const contents = [...picked.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));
    start(async () => {
      try {
        if (editingLotId) {
          await updateCardLot(editingLotId, contents, {
            purchasedAt: fromLocalInput(purchasedAtLocal),
            costCents,
            currency,
          });
          router.push(`/transactions?lotEdited=${editingLotId}`);
        } else {
          const { lotId } = await logCardLot(
            contents,
            { costCents, currency },
            {
              purchasedAt: fromLocalInput(purchasedAtLocal),
              consumeSingleIds: sourceSingleIds,
            },
          );
          router.push(`/transactions?lotLogged=${lotId}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const performEmpty = () => {
    if (!editingLotId) return;
    setError(null);
    start(async () => {
      try {
        await deleteCardLot(editingLotId);
        router.push(`/transactions?lotDeleted=${editingLotId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-4">
      {sourceSingleIds && sourceSingleIds.length > 0 && (
        <p className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-2 text-xs text-muted">
          Grouping{" "}
          <span className="font-semibold text-text">{sourceSingleIds.length}</span>{" "}
          single purchase{sourceSingleIds.length === 1 ? "" : "s"} — saving replaces
          {sourceSingleIds.length === 1 ? " it" : " them"} with this bulk lot.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-panel p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-panel-2 text-accent">
            <Layers className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="eyebrow">{editing ? "Editing bulk lot" : "Logging a bulk lot"}</p>
            <p className="text-base font-semibold">Pick cards from anywhere</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PricePaidField
            costCents={costCents}
            currency={currency}
            onCostChange={setCostCents}
            onCurrencyChange={setCurrency}
          />
          <PurchasedAtField value={purchasedAtLocal} onChange={setPurchasedAtLocal} />
          {picked.size > 0 && (
            <button
              type="button"
              onClick={() => setPicked(new Map())}
              className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
            >
              Clear
            </button>
          )}
          <Link
            href="/transactions"
            onClick={(e) => {
              if (dirty && !window.confirm("Discard this bulk lot?")) e.preventDefault();
            }}
            className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
          >
            Exit
          </Link>
        </div>
      </div>

      <PickedTray
        picked={picked}
        cardsById={cardsById}
        onRemove={(id) => setQuantity(id, 0)}
        onSetQty={setQuantity}
      />

      <CardFiltersToolbar
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        cols={cols}
        onColsChange={setCols}
        resultCount={sorted.length}
        totalCount={cards.length}
        artists={artists}
        types={types}
      />

      <VirtualizedCardGrid
        cards={sorted}
        cols={cols}
        selected={picked}
        onQuantityChange={setQuantity}
      />

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-panel/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <p className="text-sm text-muted">
          {distinct === 0 ? (
            "Click cards to add them to this lot."
          ) : (
            <>
              <span className="nums font-semibold text-text">{distinct}</span> card
              {distinct === 1 ? "" : "s"} ·{" "}
              <span className="nums font-semibold text-text">{copies}</span> cop
              {copies === 1 ? "y" : "ies"}
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {confirmingEmpty ? (
            <>
              <button
                type="button"
                onClick={() => setConfirmingEmpty(false)}
                className="rounded-md border border-border bg-panel-2 px-3 py-2 text-xs text-muted transition hover:text-text"
              >
                Keep lot
              </button>
              <button
                type="button"
                onClick={performEmpty}
                disabled={pending}
                className="rounded-md border border-missing/70 bg-missing/15 px-4 py-2 text-sm font-semibold text-missing transition hover:bg-missing/25 disabled:opacity-50"
              >
                {pending ? "Removing…" : "Yes, delete lot"}
              </button>
            </>
          ) : editing && picked.size === 0 ? (
            <button
              type="button"
              onClick={() => setConfirmingEmpty(true)}
              className="rounded-md border border-missing/60 bg-transparent px-4 py-2 text-sm font-semibold text-missing transition hover:bg-missing/15"
            >
              Delete this lot
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={pending || (!editing && picked.size === 0) || (editing && !dirty)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Saving…" : editing ? "Save changes" : `Save lot (${copies})`}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-missing">{error}</p>}
    </div>
  );
}

function PickedTray({
  picked,
  cardsById,
  onRemove,
  onSetQty,
}: {
  picked: Map<string, number>;
  cardsById: Map<string, CardEntry>;
  onRemove: (cardId: string) => void;
  onSetQty: (cardId: string, qty: number) => void;
}) {
  const items = useMemo(
    () =>
      [...picked.entries()]
        .map(([id, qty]) => ({ card: cardsById.get(id), qty }))
        .filter((x): x is { card: CardEntry; qty: number } => x.card != null)
        .sort((a, b) => a.card.name.localeCompare(b.card.name)),
    [picked, cardsById],
  );
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-accent/40 bg-accent/5 p-3">
      {items.map(({ card, qty }) => (
        <div
          key={card.id}
          className="group flex items-center gap-1.5 rounded-md bg-panel-2 px-2 py-1 text-xs"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.imageSmall}
            alt=""
            className="h-8 w-6 rounded-sm object-cover"
            loading="lazy"
          />
          <span className="max-w-[120px] truncate">{card.name}</span>
          <span className="inline-flex items-center rounded bg-panel-3 tabular-nums">
            <button
              type="button"
              onClick={() => onSetQty(card.id, qty - 1)}
              className="px-1.5 text-muted transition hover:text-text"
              aria-label={`Decrease ${card.name} quantity`}
            >
              −
            </button>
            <span className="px-1 text-text nums">×{qty}</span>
            <button
              type="button"
              onClick={() => onSetQty(card.id, qty + 1)}
              className="px-1.5 text-muted transition hover:text-text"
              aria-label={`Increase ${card.name} quantity`}
            >
              +
            </button>
          </span>
          <button
            type="button"
            onClick={() => onRemove(card.id)}
            aria-label={`Remove ${card.name}`}
          >
            <X
              className="h-3 w-3 text-muted transition-colors group-hover:text-missing"
              aria-hidden
            />
          </button>
        </div>
      ))}
    </div>
  );
}

function PurchasedAtField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
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
        className="inline-flex items-center gap-2 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
      >
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        <span className="nums">Purchased {formatPurchasedAt(value)}</span>
        <ChevronDown
          className={["h-3.5 w-3.5 transition-transform duration-200", open ? "rotate-180" : ""].join(" ")}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-[280px] rounded-lg border border-border-strong bg-panel p-3 shadow-[0_18px_44px_-16px_rgb(0_0_0/0.7)]"
          role="dialog"
          aria-label="Lot purchased at"
        >
          <p className="eyebrow mb-2">When did you buy it?</p>
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
}: {
  costCents: number | null;
  currency: LedgerCurrency;
  onCostChange: (cents: number | null) => void;
  onCurrencyChange: (c: LedgerCurrency) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string>(
    costCents != null ? (costCents / 100).toFixed(2) : "",
  );
  const rootRef = useRef<HTMLDivElement>(null);

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
        className="inline-flex items-center gap-2 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
      >
        <Tag className="h-3.5 w-3.5" aria-hidden />
        <span className="nums">{label}</span>
        <ChevronDown
          className={["h-3.5 w-3.5 transition-transform duration-200", open ? "rotate-180" : ""].join(" ")}
          aria-hidden
        />
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-2 w-[260px] rounded-lg border border-border-strong bg-panel p-3 shadow-[0_18px_44px_-16px_rgb(0_0_0/0.7)]"
          role="dialog"
          aria-label="Lot price paid"
        >
          <p className="eyebrow mb-2">How much did this lot cost?</p>
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
              {SUPPORTED_CURRENCIES.map((c) => (
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
