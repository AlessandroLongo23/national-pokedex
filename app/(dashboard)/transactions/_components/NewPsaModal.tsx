"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  formatMoneyCents,
  isLedgerCurrency,
  parseMoneyCents,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/currencies";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import { logPsaSubmission } from "../_lib/transaction-actions";
import { CardPicker, type CardPickerResult } from "./CardPicker";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultCurrency: LedgerCurrency;
}

function nowLocalInput(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function NewPsaModal({ open, onClose, defaultCurrency }: Props) {
  const router = useRouter();
  const { isOwned } = useOwnedCards();
  const [picked, setPicked] = useState<CardPickerResult[]>([]);
  const [feeDraft, setFeeDraft] = useState("");
  const [currency, setCurrency] = useState<LedgerCurrency>(defaultCurrency);
  const [submittedAtLocal, setSubmittedAtLocal] = useState<string>(nowLocalInput());
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setFeeDraft("");
    setCurrency(defaultCurrency);
    setSubmittedAtLocal(nowLocalInput());
    setNote("");
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

  if (!open) return null;

  const feeCents = parseMoneyCents(feeDraft);
  const canSubmit = picked.length > 0 && feeCents != null;

  const submit = () => {
    if (picked.length === 0) {
      setError("Pick at least one card");
      return;
    }
    if (feeCents == null) {
      setError("Enter a fee (use 0 if you prepaid)");
      return;
    }
    const iso = localToIso(submittedAtLocal);
    if (!iso) {
      setError("Invalid date");
      return;
    }
    setError(null);
    start(async () => {
      try {
        const { submissionId } = await logPsaSubmission({
          cardIds: picked.map((c) => c.id),
          submittedAt: iso,
          feeCents,
          currency,
          note: note.trim() || undefined,
        });
        onClose();
        router.push(`/transactions/psa/${submissionId}`);
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
      aria-label="New PSA submission"
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-border-strong bg-panel p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-text">
            New PSA submission
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

        <div className="space-y-4">
          <div>
            <label className="eyebrow mb-2 block">Cards to submit</label>
            <CardPicker
              mode="multi"
              autoFocus
              filter={(c) => isOwned(c.id)}
              emptyMessage="No owned matches."
              picked={picked}
              onPickedChange={setPicked}
            />
            {picked.length > 0 && (
              <p className="mt-2 text-[11px] text-muted">
                Pre-grade values will be snapshotted at save time from your
                current price source.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="eyebrow mb-1 block" htmlFor="psa-when">
                Submitted
              </label>
              <input
                id="psa-when"
                type="datetime-local"
                value={submittedAtLocal}
                onChange={(e) => setSubmittedAtLocal(e.target.value)}
                className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none [color-scheme:dark] md:text-sm"
              />
            </div>
            <div>
              <label className="eyebrow mb-1 block" htmlFor="psa-fee">
                Submission fee
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
                  id="psa-fee"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={feeDraft}
                  onChange={(e) => setFeeDraft(e.target.value)}
                  className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="eyebrow mb-1 block" htmlFor="psa-note">
              Note <span className="text-muted">(optional)</span>
            </label>
            <input
              id="psa-note"
              type="text"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Value bulk, expected return Aug"
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm"
            />
          </div>

          {feeCents != null && feeCents > 0 && (
            <p className="text-xs text-muted">
              Ledger entry:{" "}
              <span className="font-semibold text-missing tabular-nums">
                −{formatMoneyCents(feeCents, currency)}
              </span>
            </p>
          )}

          {error && <p className="text-sm text-missing">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
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
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Saving…" : "Create submission"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
