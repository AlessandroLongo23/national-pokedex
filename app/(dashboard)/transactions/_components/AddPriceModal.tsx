"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  formatMoneyCents,
  isLedgerCurrency,
  parseMoneyCents,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/currencies";
import { setPackCost } from "../../_lib/pack-actions";
import { setLotCost } from "../../_lib/lot-actions";

export type AddPriceTarget =
  | { kind: "pack"; packId: string; label: string }
  | { kind: "lot"; lotId: string; label: string };

interface Props {
  open: boolean;
  onClose: () => void;
  target: AddPriceTarget;
  defaultCurrency: LedgerCurrency;
}

// Inline pricing for a pack or lot that was logged without a cost. The
// full editors (/packs/[id]/edit, /transactions/lots/[id]/edit) both load
// the whole ~20k-card catalogue to render their card pickers, which is a
// heavy trip for what is usually a single number — so the ledger offers
// this instead and keeps the user on the page.
export function AddPriceModal({ open, onClose, target, defaultCurrency }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [currency, setCurrency] = useState<LedgerCurrency>(defaultCurrency);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft("");
    setCurrency(defaultCurrency);
    setError(null);
  }, [open, defaultCurrency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the amount field on open — the modal exists to capture one
  // number, so the user should be able to type it immediately.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const cents = parseMoneyCents(draft);

  const submit = () => {
    if (cents == null) {
      setError("Enter an amount");
      return;
    }
    setError(null);
    start(async () => {
      try {
        if (target.kind === "pack") {
          await setPackCost(target.packId, cents, currency);
        } else {
          await setLotCost(target.lotId, cents, currency);
        }
        onClose();
        // The synthetic unpriced row is computed on the server, so the
        // ledger needs a refetch for it to become a real priced row.
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
      aria-label="Add price"
    >
      <div className="w-full max-w-sm rounded-xl border border-border-strong bg-panel p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]">
        <div className="mb-1 flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-text">
            Add price
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md p-2.5 text-muted transition hover:bg-panel-2 hover:text-text md:p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-[13px] text-muted">{target.label}</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label className="eyebrow mb-2 block" htmlFor="add-price-amount">
            Price paid
          </label>
          <div className="flex gap-2">
            <input
              ref={inputRef}
              id="add-price-amount"
              type="text"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0.00"
              aria-label="Price paid"
              className="w-full min-w-0 flex-1 rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base tabular-nums text-text focus:border-accent focus:outline-none md:text-sm"
            />
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
          </div>

          {cents != null && (
            <p className="mt-2 text-xs text-muted">
              Ledger entry:{" "}
              <span className="font-semibold text-missing tabular-nums">
                −{formatMoneyCents(cents, currency)}
              </span>
            </p>
          )}

          {error && <p className="mt-2 text-sm text-missing">{error}</p>}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending || cents == null}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Saving…" : "Save price"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
