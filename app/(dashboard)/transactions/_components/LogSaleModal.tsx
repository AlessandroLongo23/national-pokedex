"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import {
  formatMoneyCents,
  isLedgerCurrency,
  LEDGER_CURRENCIES,
  parseMoneyCents,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import {
  deleteSingleSale,
  editSingleSale,
  logSingleSale,
} from "../_lib/transaction-actions";

interface CardResult {
  id: string;
  name: string;
  setId: string;
  number: string;
  imageSmall: string;
}

export interface SingleSaleEdit {
  transactionId: string;
  card: CardResult;
  quantity: number;
  unitProceedsCents: number;
  currency: LedgerCurrency;
  occurredAt: string;
  note: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCurrency: LedgerCurrency;
  /** Pre-selected card; when provided, the search step is skipped. */
  presetCard?: CardResult;
  /** Max sellable quantity for the preset card (typically the owned qty). */
  presetMaxQty?: number;
  /** Optional default for the unit-proceeds field (e.g. current market). */
  suggestedUnitProceedsCents?: number | null;
  /** When set, the modal edits an existing sale instead of creating a
   *  new one. The card is locked. presetMaxQty should be the user's
   *  current owned qty + the existing sale's qty (so the user can shift
   *  copies back into the sale without hitting the "not enough" guard). */
  editing?: SingleSaleEdit;
}

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowLocalInput();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function LogSaleModal({
  open,
  onClose,
  defaultCurrency,
  presetCard,
  presetMaxQty,
  suggestedUnitProceedsCents,
  editing,
}: Props) {
  const router = useRouter();
  const { isOwned } = useOwnedCards();
  const isEditing = !!editing;
  const initialCard = editing?.card ?? presetCard ?? null;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<CardResult | null>(initialCard);
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [proceedsDraft, setProceedsDraft] = useState(
    editing != null ? (editing.unitProceedsCents / 100).toFixed(2) : "",
  );
  const [currency, setCurrency] = useState<LedgerCurrency>(
    editing?.currency ?? defaultCurrency,
  );
  const [occurredAtLocal, setOccurredAtLocal] = useState<string>(
    editing ? isoToLocalInput(editing.occurredAt) : nowLocalInput(),
  );
  const [note, setNote] = useState(editing?.note ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Reset on open so a previous attempt doesn't bleed into the next one.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setConfirmingDelete(false);
    setError(null);
    if (editing) {
      setSelected(editing.card);
      setQuantity(editing.quantity);
      setProceedsDraft((editing.unitProceedsCents / 100).toFixed(2));
      setCurrency(editing.currency);
      setOccurredAtLocal(isoToLocalInput(editing.occurredAt));
      setNote(editing.note ?? "");
      return;
    }
    setSelected(presetCard ?? null);
    setQuantity(1);
    setProceedsDraft(
      suggestedUnitProceedsCents != null
        ? (suggestedUnitProceedsCents / 100).toFixed(2)
        : "",
    );
    setCurrency(defaultCurrency);
    setOccurredAtLocal(nowLocalInput());
    setNote("");
    const t = setTimeout(
      () => (presetCard ? null : searchInputRef.current?.focus()),
      0,
    );
    return () => {
      if (t) clearTimeout(t);
    };
  }, [open, defaultCurrency, presetCard, suggestedUnitProceedsCents, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || selected) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/cards/search?q=${encodeURIComponent(trimmed)}&limit=25`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error("search failed");
        const data = (await res.json()) as { results: CardResult[] };
        // Sales need a card you actually own. Filtering client-side
        // keeps the API generic; the RPC enforces the same rule on the
        // server as a backstop.
        setResults(data.results.filter((c) => isOwned(c.id)));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, selected, open, isOwned]);

  if (!open) return null;

  const proceedsCents = parseMoneyCents(proceedsDraft);
  const maxQty = presetMaxQty ?? 100;
  const qtyValid = quantity > 0 && quantity <= maxQty;
  const canSubmit = !!selected && qtyValid && proceedsCents != null;
  const totalCents = proceedsCents != null ? proceedsCents * quantity : null;

  const submit = () => {
    if (!selected) return;
    if (proceedsCents == null) {
      setError("Enter a unit proceeds amount");
      return;
    }
    if (!qtyValid) {
      setError(`Quantity must be between 1 and ${maxQty}`);
      return;
    }
    const iso = localToIso(occurredAtLocal);
    if (!iso) {
      setError("Invalid date");
      return;
    }
    setError(null);
    start(async () => {
      try {
        if (editing) {
          await editSingleSale({
            transactionId: editing.transactionId,
            quantity,
            unitProceedsCents: proceedsCents,
            currency,
            occurredAt: iso,
            note: note.trim() || undefined,
          });
        } else {
          await logSingleSale({
            cardId: selected.id,
            quantity,
            unitProceedsCents: proceedsCents,
            currency,
            occurredAt: iso,
            note: note.trim() || undefined,
          });
        }
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const remove = () => {
    if (!editing) return;
    setError(null);
    start(async () => {
      try {
        await deleteSingleSale(editing.transactionId);
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit sale" : "Sell a card"}
    >
      <div className="w-full max-w-md rounded-xl border border-border-strong bg-panel p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-text">
            {isEditing
              ? `Edit sale of ${editing.card.name}`
              : presetCard
                ? `Sell ${presetCard.name}`
                : "Log a sale"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted transition hover:bg-panel-2 hover:text-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          {!presetCard && !isEditing && (
            <div>
              <label className="eyebrow mb-1 block">Card</label>
              {selected ? (
                <SelectedCard card={selected} onClear={() => setSelected(null)} />
              ) : (
                <CardSearch
                  ref={searchInputRef}
                  query={query}
                  onQueryChange={setQuery}
                  results={results}
                  searching={searching}
                  onPick={(c) => {
                    setSelected(c);
                    setQuery("");
                    setResults([]);
                  }}
                />
              )}
            </div>
          )}

          {isEditing && selected && (
            <div>
              <label className="eyebrow mb-1 block">Card</label>
              <SelectedCard card={selected} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eyebrow mb-1 block" htmlFor="qty">
                Quantity
              </label>
              <input
                id="qty"
                type="number"
                min={1}
                max={maxQty}
                step={1}
                value={quantity}
                onChange={(e) =>
                  setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))
                }
                className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
              />
              {presetMaxQty != null && (
                <p className="mt-1 text-[11px] text-muted">
                  {presetMaxQty} owned
                </p>
              )}
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor="proceeds">
                Unit proceeds
              </label>
              <div className="flex gap-2">
                <select
                  value={currency}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (isLedgerCurrency(v)) setCurrency(v);
                  }}
                  aria-label="Currency"
                  className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark]"
                >
                  {LEDGER_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  id="proceeds"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={proceedsDraft}
                  onChange={(e) => setProceedsDraft(e.target.value)}
                  className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="eyebrow mb-1 block" htmlFor="when">
              When
            </label>
            <input
              id="when"
              type="datetime-local"
              value={occurredAtLocal}
              onChange={(e) => setOccurredAtLocal(e.target.value)}
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark]"
            />
          </div>

          <div>
            <label className="eyebrow mb-1 block" htmlFor="note">
              Note <span className="text-muted">(optional)</span>
            </label>
            <input
              id="note"
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. eBay buyer, trade for X"
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          {totalCents != null && quantity > 1 && (
            <p className="text-xs text-muted">
              Total ={" "}
              <span className="font-semibold text-covered tabular-nums">
                +{formatMoneyCents(totalCents, currency)}
              </span>{" "}
              for {quantity} copies
            </p>
          )}

          {error && <p className="text-sm text-missing">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1">
            {isEditing ? (
              confirmingDelete ? (
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="inline-flex items-center gap-1.5 rounded-md border border-missing/70 bg-missing/15 px-3 py-1.5 text-xs font-semibold text-missing transition hover:bg-missing/25 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {pending ? "Deleting…" : "Confirm delete"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-missing/60 hover:text-missing"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Delete
                </button>
              )
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={!canSubmit || pending}
                className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-40"
              >
                {pending
                  ? "Saving…"
                  : isEditing
                    ? "Save changes"
                    : "Log sale"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CardSearch({
  query,
  onQueryChange,
  results,
  searching,
  onPick,
  ref,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  results: CardResult[];
  searching: boolean;
  onPick: (c: CardResult) => void;
  ref: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-2">
      <input
        ref={ref}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by card name…"
        className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
        aria-label="Search card"
      />
      {query.trim().length >= 2 && (
        <div className="max-h-64 overflow-y-auto rounded-md border border-border bg-panel-2">
          {searching && results.length === 0 ? (
            <p className="p-3 text-xs text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-xs text-muted">No owned matches.</p>
          ) : (
            <ul>
              {results.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onPick(c)}
                    className="flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-sm transition hover:bg-panel"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.imageSmall}
                      alt=""
                      className="h-9 w-7 rounded-sm object-cover"
                      loading="lazy"
                    />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <span className="shrink-0 text-[11px] text-muted tabular-nums">
                      {c.setId}-{c.number}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SelectedCard({
  card,
  onClear,
}: {
  card: CardResult;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-accent/40 bg-accent/5 p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.imageSmall}
        alt=""
        className="h-10 w-7 rounded-sm object-cover"
        loading="lazy"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text">{card.name}</p>
        <p className="text-[11px] text-muted tabular-nums">
          {card.setId}-{card.number}
        </p>
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md p-1 text-muted transition hover:bg-panel-2 hover:text-text"
          aria-label="Change card"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
