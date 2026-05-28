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
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import { logPsaSubmission } from "../_lib/transaction-actions";

interface CardResult {
  id: string;
  name: string;
  setId: string;
  number: string;
  imageSmall: string;
}

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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CardResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<CardResult[]>([]);
  const [feeDraft, setFeeDraft] = useState("");
  const [currency, setCurrency] = useState<LedgerCurrency>(defaultCurrency);
  const [submittedAtLocal, setSubmittedAtLocal] = useState<string>(nowLocalInput());
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setPicked([]);
    setFeeDraft("");
    setCurrency(defaultCurrency);
    setSubmittedAtLocal(nowLocalInput());
    setNote("");
    setError(null);
    const t = setTimeout(() => searchInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, defaultCurrency]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced search; results are filtered to owned cards client-side
  // so the picker never lets the user submit something not in their
  // collection (the RPC doesn't enforce this, but UX-wise it's the
  // expected default).
  useEffect(() => {
    if (!open) return;
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
        setResults(data.results);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [query, open]);

  if (!open) return null;

  const pickedIds = new Set(picked.map((c) => c.id));
  const visibleResults = results.filter(
    (c) => isOwned(c.id) && !pickedIds.has(c.id),
  );

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="New PSA submission"
    >
      <div className="w-full max-w-lg rounded-xl border border-border-strong bg-panel p-5 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-text">
            New PSA submission
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
          <div>
            <label className="eyebrow mb-1 block">Cards to submit</label>
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search owned cards to add…"
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text placeholder:text-muted focus:border-accent focus:outline-none"
              aria-label="Search cards"
            />
            {query.trim().length >= 2 && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-border bg-panel-2">
                {searching && visibleResults.length === 0 ? (
                  <p className="p-3 text-xs text-muted">Searching…</p>
                ) : visibleResults.length === 0 ? (
                  <p className="p-3 text-xs text-muted">No owned matches.</p>
                ) : (
                  <ul>
                    {visibleResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setPicked((prev) => [...prev, c]);
                            setQuery("");
                            setResults([]);
                            searchInputRef.current?.focus();
                          }}
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
            {picked.length > 0 && (
              <div className="mt-2 space-y-1 rounded-md border border-accent/40 bg-accent/5 p-2">
                {picked.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2.5 rounded-md px-1.5 py-1"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.imageSmall}
                      alt=""
                      className="h-8 w-6 rounded-sm object-cover"
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
                      onClick={() => setPicked((prev) => prev.filter((p) => p.id !== c.id))}
                      className="rounded-md p-1 text-muted transition hover:bg-panel hover:text-missing"
                      aria-label={`Remove ${c.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <p className="px-1.5 pt-1 text-[11px] text-muted">
                  {picked.length} card{picked.length === 1 ? "" : "s"} selected · pre-grade values
                  snapshot at save time
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="eyebrow mb-1 block" htmlFor="psa-when">
                Submitted
              </label>
              <input
                id="psa-when"
                type="datetime-local"
                value={submittedAtLocal}
                onChange={(e) => setSubmittedAtLocal(e.target.value)}
                className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark]"
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
                  className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-sm text-text focus:border-accent focus:outline-none [color-scheme:dark]"
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
                  className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
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
              className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-sm text-text focus:border-accent focus:outline-none"
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
              className="rounded-md bg-accent px-4 py-1.5 text-xs font-semibold text-bg transition hover:opacity-90 disabled:opacity-40"
            >
              {pending ? "Saving…" : "Create submission"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
