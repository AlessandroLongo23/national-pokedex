"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import {
  formatMoneyCents,
  isLedgerCurrency,
  parseMoneyCents,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/currencies";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import {
  deleteSingleSale,
  editSingleSale,
  logSingleSale,
} from "../_lib/transaction-actions";
import { CARD_VARIANTS, type CardVariant } from "../_lib/variants";
import { CardPicker } from "./CardPicker";

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
  variant: CardVariant | null;
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

const VARIANT_LABEL: Record<CardVariant, string> = {
  normal: "Normal",
  holofoil: "Holo",
  reverseHolofoil: "Reverse Holo",
};

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
  const [variant, setVariant] = useState<CardVariant>(
    editing?.variant ?? "normal",
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(false);
    setError(null);
    if (editing) {
      setSelected(editing.card);
      setQuantity(editing.quantity);
      setProceedsDraft((editing.unitProceedsCents / 100).toFixed(2));
      setCurrency(editing.currency);
      setOccurredAtLocal(isoToLocalInput(editing.occurredAt));
      setNote(editing.note ?? "");
      setVariant(editing.variant ?? "normal");
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
    setVariant("normal");
  }, [open, defaultCurrency, presetCard, suggestedUnitProceedsCents, editing]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const cardLocked = !!presetCard || isEditing;
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
            variant,
          });
        } else {
          await logSingleSale({
            cardId: selected.id,
            quantity,
            unitProceedsCents: proceedsCents,
            currency,
            occurredAt: iso,
            note: note.trim() || undefined,
            variant,
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
      <div className="w-full max-w-3xl rounded-xl border border-border-strong bg-panel p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]">
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

        {selected ? (
          <div className="grid gap-4 md:grid-cols-[1fr_240px]">
            <div className="space-y-3">
              <div>
                <label className="eyebrow mb-1 block">Card</label>
                <SelectedCard
                  card={selected}
                  onClear={cardLocked ? undefined : () => setSelected(null)}
                />
              </div>

              <VariantPicker variant={variant} setVariant={setVariant} />

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
                      setQuantity(
                        Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)),
                      )
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
                      {SUPPORTED_CURRENCIES.map((c) => (
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

            <div className="hidden md:flex md:items-start md:justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selected.imageSmall}
                alt={selected.name}
                className="w-full max-w-[220px] rounded-md object-contain shadow-[0_10px_30px_-10px_rgb(0_0_0/0.6)]"
                loading="lazy"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="eyebrow mb-1 block">Card</label>
            <CardPicker
              mode="single"
              autoFocus
              filter={(c) => isOwned(c.id)}
              emptyMessage="No owned matches."
              onPick={(c) =>
                setSelected({
                  id: c.id,
                  name: c.name,
                  setId: c.setId,
                  number: c.number,
                  imageSmall: c.imageSmall,
                })
              }
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VariantPicker({
  variant,
  setVariant,
}: {
  variant: CardVariant;
  setVariant: (v: CardVariant) => void;
}) {
  return (
    <div>
      <label className="eyebrow mb-1 block">Printing</label>
      <div
        className="inline-flex rounded-md border border-border bg-panel-2 p-0.5"
        role="radiogroup"
        aria-label="Card printing"
      >
        {CARD_VARIANTS.map((v) => {
          const selected = variant === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setVariant(v)}
              className={[
                "rounded px-2.5 py-1 text-xs font-medium transition",
                selected
                  ? "bg-accent text-bg"
                  : "text-muted hover:text-text",
              ].join(" ")}
            >
              {VARIANT_LABEL[v]}
            </button>
          );
        })}
      </div>
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
