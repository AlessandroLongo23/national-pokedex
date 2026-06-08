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
import {
  deleteSinglePurchase,
  editSinglePurchase,
  logSinglePurchase,
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

export interface SinglePurchaseEdit {
  transactionId: string;
  card: CardResult;
  quantity: number;
  unitCostCents: number;
  currency: LedgerCurrency;
  occurredAt: string;
  note: string | null;
  variant: CardVariant | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCurrency: LedgerCurrency;
  /** Pre-selected card; when provided, the search step is skipped and
   *  the card is locked (no Change affordance). Mirrors LogSaleModal's
   *  preset pattern — used by the card detail page's Buy button. */
  presetCard?: CardResult;
  /** When set, the modal pre-fills from this row and saves via
   *  editSinglePurchase instead of logSinglePurchase. The card is
   *  locked — you can't change which card a transaction is for. */
  editing?: SinglePurchaseEdit;
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

export function LogSingleModal({
  open,
  onClose,
  defaultCurrency,
  presetCard,
  editing,
}: Props) {
  const router = useRouter();
  const isEditing = !!editing;
  const initialCard = editing?.card ?? presetCard ?? null;
  const [selected, setSelected] = useState<CardResult | null>(initialCard);
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [costDraft, setCostDraft] = useState(
    editing != null ? (editing.unitCostCents / 100).toFixed(2) : "",
  );
  const [currency, setCurrency] = useState<LedgerCurrency>(
    editing?.currency ?? defaultCurrency,
  );
  const [occurredAtLocal, setOccurredAtLocal] = useState<string>(
    editing ? isoToLocalInput(editing.occurredAt) : nowLocalInput(),
  );
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [note, setNote] = useState(editing?.note ?? "");
  const [variant, setVariant] = useState<CardVariant>(
    editing?.variant ?? "normal",
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Reset on open so a previous attempt doesn't bleed into the next one.
  // When `editing` is set we rehydrate the form from the row.
  useEffect(() => {
    if (!open) return;
    setConfirmingDelete(false);
    setError(null);
    if (editing) {
      setSelected(editing.card);
      setQuantity(editing.quantity);
      setCostDraft((editing.unitCostCents / 100).toFixed(2));
      setCurrency(editing.currency);
      setOccurredAtLocal(isoToLocalInput(editing.occurredAt));
      setNote(editing.note ?? "");
      setVariant(editing.variant ?? "normal");
    } else {
      setSelected(presetCard ?? null);
      setQuantity(1);
      setCostDraft("");
      setCurrency(defaultCurrency);
      setOccurredAtLocal(nowLocalInput());
      setNote("");
      setVariant("normal");
    }
  }, [open, defaultCurrency, presetCard, editing]);

  // Escape closes; click outside closes (handled on the backdrop).
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
  const costCents = parseMoneyCents(costDraft);
  const canSubmit = !!selected && quantity > 0 && costCents != null;
  const totalCents = costCents != null ? costCents * quantity : null;

  const submit = () => {
    if (!selected) return;
    if (costCents == null) {
      setError("Enter a unit price");
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
          await editSinglePurchase({
            transactionId: editing.transactionId,
            quantity,
            unitCostCents: costCents,
            currency,
            occurredAt: iso,
            note: note.trim() || undefined,
            variant,
          });
        } else {
          await logSinglePurchase({
            cardId: selected.id,
            quantity,
            unitCostCents: costCents,
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
        await deleteSinglePurchase(editing.transactionId);
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 backdrop-blur-sm md:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Edit singles purchase" : "Log a singles purchase"}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border-strong bg-panel p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-text">
            {isEditing
              ? `Edit purchase of ${editing.card.name}`
              : presetCard
                ? `Buy ${presetCard.name}`
                : "Log a singles purchase"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2.5 text-muted transition hover:bg-panel-2 hover:text-text md:p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {selected ? (
          <PickedForm
            selected={selected}
            cardLocked={cardLocked}
            onClearCard={() => setSelected(null)}
            quantity={quantity}
            setQuantity={setQuantity}
            costDraft={costDraft}
            setCostDraft={setCostDraft}
            currency={currency}
            setCurrency={setCurrency}
            occurredAtLocal={occurredAtLocal}
            setOccurredAtLocal={setOccurredAtLocal}
            note={note}
            setNote={setNote}
            variant={variant}
            setVariant={setVariant}
            totalCents={totalCents}
            error={error}
            pending={pending}
            canSubmit={canSubmit}
            isEditing={isEditing}
            confirmingDelete={confirmingDelete}
            onConfirmDelete={() => setConfirmingDelete(true)}
            onDelete={remove}
            onCancel={onClose}
            onSubmit={submit}
          />
        ) : (
          <div className="space-y-3">
            <label className="eyebrow mb-1 block">Card</label>
            <CardPicker
              mode="single"
              autoFocus
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

interface PickedFormProps {
  selected: CardResult;
  cardLocked: boolean;
  onClearCard: () => void;
  quantity: number;
  setQuantity: (n: number) => void;
  costDraft: string;
  setCostDraft: (s: string) => void;
  currency: LedgerCurrency;
  setCurrency: (c: LedgerCurrency) => void;
  occurredAtLocal: string;
  setOccurredAtLocal: (s: string) => void;
  note: string;
  setNote: (s: string) => void;
  variant: CardVariant;
  setVariant: (v: CardVariant) => void;
  totalCents: number | null;
  error: string | null;
  pending: boolean;
  canSubmit: boolean;
  isEditing: boolean;
  confirmingDelete: boolean;
  onConfirmDelete: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onSubmit: () => void;
}

function PickedForm(props: PickedFormProps) {
  const {
    selected,
    cardLocked,
    onClearCard,
    quantity,
    setQuantity,
    costDraft,
    setCostDraft,
    currency,
    setCurrency,
    occurredAtLocal,
    setOccurredAtLocal,
    note,
    setNote,
    variant,
    setVariant,
    totalCents,
    error,
    pending,
    canSubmit,
    isEditing,
    confirmingDelete,
    onConfirmDelete,
    onDelete,
    onCancel,
    onSubmit,
  } = props;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_240px]">
      <div className="space-y-3">
        <div>
          <label className="eyebrow mb-1 block">Card</label>
          <SelectedCard
            card={selected}
            onClear={cardLocked ? undefined : onClearCard}
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
              max={100}
              step={1}
              value={quantity}
              onChange={(e) =>
                setQuantity(Math.max(1, Number(e.target.value) || 1))
              }
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm"
            />
          </div>
          <div>
            <label className="eyebrow mb-1 block" htmlFor="cost">
              Unit price
            </label>
            <div className="flex gap-2">
              <select
                value={currency}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isLedgerCurrency(v)) setCurrency(v);
                }}
                aria-label="Currency"
                className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base text-text focus:border-accent focus:outline-none [color-scheme:dark] md:text-sm"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                id="cost"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={costDraft}
                onChange={(e) => setCostDraft(e.target.value)}
                className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm"
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
            className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none [color-scheme:dark] md:text-sm"
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
            placeholder="e.g. eBay, $4 shipping"
            className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm"
          />
        </div>

        {totalCents != null && quantity > 1 && (
          <p className="text-xs text-muted">
            Total ={" "}
            <span className="font-semibold text-text tabular-nums">
              {formatMoneyCents(totalCents, currency)}
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
                onClick={onDelete}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-md border border-missing/70 bg-missing/15 px-3 py-1.5 text-xs font-semibold text-missing transition hover:bg-missing/25 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {pending ? "Deleting…" : "Confirm delete"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onConfirmDelete}
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
              onClick={onCancel}
              className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit || pending}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {pending
                ? "Saving…"
                : isEditing
                  ? "Save changes"
                  : "Log purchase"}
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
                  ? "bg-primary text-primary-foreground"
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
          className="rounded-md p-2.5 text-muted transition hover:bg-panel-2 hover:text-text md:p-1"
          aria-label="Change card"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
