"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import {
  formatMoneyCents,
  isLedgerCurrency,
  parseMoneyCents,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { SUPPORTED_CURRENCIES } from "@/lib/pricing/currencies";
import { MoneyDisplay } from "../../../../_components/MoneyDisplay";
import { Tooltip } from "../../../../_components/Tooltip";
import { useUser } from "../../../../_lib/UserContext";
import {
  deletePsaSubmission,
  updatePsaFee,
  updatePsaSubmission,
  updatePsaSubmissionCard,
} from "../../../_lib/transaction-actions";

export interface PsaCardRow {
  cardId: string;
  name: string;
  setId: string | null;
  setName: string | null;
  number: string | null;
  imageSmall: string | null;
  preGradeValueCents: number | null;
  grade: number | null;
  postGradeValueCents: number | null;
}

interface Props {
  submissionId: string;
  submittedAt: string;
  returnedAt: string | null;
  note: string | null;
  currency: LedgerCurrency;
  feeCents: number;
  cards: PsaCardRow[];
}

interface CardDraft {
  preDraft: string;
  grade: number | null;
}

interface SubmissionDraft {
  returnedAt: string; // "YYYY-MM-DD" or ""
  note: string;
  feeDraft: string; // "12.34" or ""
  feeCurrency: LedgerCurrency;
  cards: Map<string, CardDraft>;
}

// ─── helpers ─────────────────────────────────────────────────────────

function todayLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoToLocalDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function localDateToIso(value: string): string | null {
  if (!value) return null;
  // Treat the date as start-of-day in the user's local timezone.
  const d = new Date(`${value}T00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function centsToDraft(cents: number | null): string {
  return cents != null && cents > 0 ? (cents / 100).toFixed(2) : "";
}

// What's actually in the DB right now. The dirty check compares the
// user's draft against this, so reset/discard always returns the user
// to "what the server thinks", not to whatever default the form
// suggested at first mount.
function buildDbDraft(props: Props): SubmissionDraft {
  const cards = new Map<string, CardDraft>();
  for (const c of props.cards) {
    cards.set(c.cardId, {
      preDraft: centsToDraft(c.preGradeValueCents),
      grade: c.grade,
    });
  }
  return {
    returnedAt: isoToLocalDate(props.returnedAt),
    note: props.note ?? "",
    feeDraft: centsToDraft(props.feeCents),
    feeCurrency: props.currency,
    cards,
  };
}

// Initial editing draft. Differs from buildDbDraft only by prefilling
// today's date when the submission has no return date yet — saves the
// user a click in the common "I just got them back" case. The form
// still validates that grades and return date stay consistent, so this
// prefill alone doesn't enable saving anything bogus.
function buildInitialDraft(props: Props, db: SubmissionDraft): SubmissionDraft {
  return {
    ...db,
    cards: new Map(db.cards),
    returnedAt: db.returnedAt === "" ? todayLocal() : db.returnedAt,
  };
}

function draftsEqual(a: SubmissionDraft, b: SubmissionDraft): boolean {
  if (a.returnedAt !== b.returnedAt) return false;
  if (a.note !== b.note) return false;
  if (a.feeDraft !== b.feeDraft) return false;
  if (a.feeCurrency !== b.feeCurrency) return false;
  if (a.cards.size !== b.cards.size) return false;
  for (const [id, ac] of a.cards) {
    const bc = b.cards.get(id);
    if (!bc) return false;
    if (ac.preDraft !== bc.preDraft) return false;
    if (ac.grade !== bc.grade) return false;
  }
  return true;
}

// ─── component ───────────────────────────────────────────────────────

export function PsaDetailClient(props: Props) {
  const { submissionId } = props;
  const router = useRouter();
  const { displayCurrency, latestRatesFromEur } = useUser();
  const db = useMemo(() => buildDbDraft(props), [props]);
  const [draft, setDraft] = useState<SubmissionDraft>(() => buildInitialDraft(props, db));
  const [pending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When server data changes (e.g., post-grade snapshot just landed),
  // refresh the db reference but preserve the user's in-flight edits
  // by re-running buildInitialDraft only if the user is currently in
  // a clean state.
  useEffect(() => {
    if (draftsEqual(draft, db)) {
      setDraft(buildInitialDraft(props, db));
    }
    // We deliberately depend only on `db` (which changes when props
    // change) — re-syncing on every draft edit would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db]);

  const dirty = !draftsEqual(draft, db);

  // Either grade + return go together, or both stay blank. "Just a return
  // date" and "just a grade" both block save.
  const validation = useMemo<{ ok: boolean; message: string | null }>(() => {
    const hasReturned = draft.returnedAt.trim() !== "";
    const hasAnyGrade = [...draft.cards.values()].some((c) => c.grade != null);
    if (hasReturned && !hasAnyGrade) {
      return {
        ok: false,
        message: "Set a grade on at least one card before recording a return date.",
      };
    }
    if (!hasReturned && hasAnyGrade) {
      return {
        ok: false,
        message: "Grades are set — pick a return date to record this batch as back.",
      };
    }
    // Fee draft must parse if non-empty.
    if (draft.feeDraft.trim() !== "" && parseMoneyCents(draft.feeDraft) === null) {
      return { ok: false, message: "Submission fee isn't a valid number." };
    }
    // Pre-grade drafts must parse if non-empty.
    for (const c of draft.cards.values()) {
      if (c.preDraft.trim() !== "" && parseMoneyCents(c.preDraft) === null) {
        return { ok: false, message: "Pre-grade value isn't a valid number." };
      }
    }
    return { ok: true, message: null };
  }, [draft]);

  const canSave = dirty && validation.ok && !pending;

  // Warn on tab close / hard reload with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const guardNavigate = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!dirty) return;
    if (!window.confirm("Discard unsaved changes to this submission?")) {
      e.preventDefault();
    }
  };

  // ── mutators ────────────────────────────────────────────────────────

  const setReturnedAt = (v: string) =>
    setDraft((d) => ({ ...d, returnedAt: v }));
  const setNote = (v: string) => setDraft((d) => ({ ...d, note: v }));
  const setFeeDraft = (v: string) => setDraft((d) => ({ ...d, feeDraft: v }));
  const setFeeCurrency = (c: LedgerCurrency) =>
    setDraft((d) => ({ ...d, feeCurrency: c }));
  const setCardPre = (cardId: string, v: string) =>
    setDraft((d) => {
      const nextCards = new Map(d.cards);
      const c = nextCards.get(cardId);
      if (c) nextCards.set(cardId, { ...c, preDraft: v });
      return { ...d, cards: nextCards };
    });
  const setCardGrade = (cardId: string, grade: number | null) =>
    setDraft((d) => {
      const nextCards = new Map(d.cards);
      const c = nextCards.get(cardId);
      if (c) nextCards.set(cardId, { ...c, grade });
      return { ...d, cards: nextCards };
    });

  const reset = () => {
    setDraft(buildInitialDraft(props, db));
    setError(null);
  };

  const save = () => {
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        // Submission-level (returned_at, note). Skip if unchanged.
        const returnedChanged = draft.returnedAt !== db.returnedAt;
        const noteChanged = draft.note !== db.note;
        if (returnedChanged || noteChanged) {
          await updatePsaSubmission(submissionId, {
            ...(returnedChanged
              ? {
                  returnedAt:
                    draft.returnedAt === ""
                      ? null
                      : localDateToIso(draft.returnedAt),
                }
              : {}),
            ...(noteChanged ? { note: draft.note.trim() || null } : {}),
          });
        }

        // Fee. updatePsaFee handles insert/update/delete based on amount.
        const feeChanged =
          draft.feeDraft !== db.feeDraft || draft.feeCurrency !== db.feeCurrency;
        if (feeChanged) {
          const nextFeeCents =
            draft.feeDraft.trim() === ""
              ? 0
              : parseMoneyCents(draft.feeDraft) ?? 0;
          await updatePsaFee(submissionId, nextFeeCents, draft.feeCurrency);
        }

        // Per-card changes. Run sequentially so a grade change reliably
        // triggers the post-grade snapshot before the next iteration.
        for (const [cardId, draftCard] of draft.cards) {
          const dbCard = db.cards.get(cardId);
          if (!dbCard) continue;
          const preChanged = draftCard.preDraft !== dbCard.preDraft;
          const gradeChanged = draftCard.grade !== dbCard.grade;
          if (!preChanged && !gradeChanged) continue;
          await updatePsaSubmissionCard(submissionId, cardId, {
            ...(preChanged
              ? {
                  preGradeValueCents:
                    draftCard.preDraft.trim() === ""
                      ? null
                      : parseMoneyCents(draftCard.preDraft) ?? null,
                }
              : {}),
            ...(gradeChanged ? { grade: draftCard.grade } : {}),
          });
        }

        // RSC payload refresh — props will update with the new server
        // state on the next render cycle.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const remove = () => {
    setError(null);
    startTransition(async () => {
      try {
        await deletePsaSubmission(submissionId);
        router.push("/transactions");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  // ── view ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <Link
        href="/transactions"
        onClick={guardNavigate}
        className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Transactions
      </Link>

      <div className="space-y-5 rounded-lg border border-border bg-panel p-5">
        <div className="grid gap-5 md:grid-cols-2">
          <Labeled
            label="Returned date"
            hint={
              draft.returnedAt === ""
                ? "Leave blank while still at PSA"
                : null
            }
          >
            <div className="flex gap-2">
              <input
                type="date"
                value={draft.returnedAt}
                onChange={(e) => setReturnedAt(e.target.value)}
                className="flex-1 rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm [color-scheme:dark]"
              />
              {draft.returnedAt !== "" && (
                <Tooltip content="Clear return date">
                  <button
                    type="button"
                    onClick={() => setReturnedAt("")}
                    className="rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-xs text-muted transition hover:text-text"
                  >
                    Clear
                  </button>
                </Tooltip>
              )}
            </div>
          </Labeled>

          <Labeled label="Submission fee" hint="Money out — recorded as a transaction.">
            <div className="flex gap-2">
              <select
                value={draft.feeCurrency}
                onChange={(e) => {
                  const v = e.target.value;
                  if (isLedgerCurrency(v)) setFeeCurrency(v);
                }}
                aria-label="Fee currency"
                className="rounded-md border border-border bg-panel-2 px-2 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm [color-scheme:dark]"
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
                value={draft.feeDraft}
                onChange={(e) => setFeeDraft(e.target.value)}
                placeholder="0.00"
                className="w-full rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text focus:border-accent focus:outline-none md:text-sm"
              />
            </div>
          </Labeled>
        </div>

        <Labeled label="Note">
          <textarea
            rows={2}
            value={draft.note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — e.g. Express service, expected return Aug"
            className="w-full resize-none rounded-md border border-border bg-panel-2 px-2.5 py-1.5 text-base text-text placeholder:text-muted focus:border-accent focus:outline-none md:text-sm"
          />
        </Labeled>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-panel">
        {/* On mobile the 5-column grading table scrolls horizontally within this
            bordered card (min-w forces room for the inputs); desktop fits to
            full width as before. */}
        <table className="min-w-[560px] text-sm md:min-w-full">
          <thead className="border-b border-border text-left text-[11px] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Card</th>
              <th className="px-4 py-2 font-medium">Pre-grade value</th>
              <th className="px-4 py-2 font-medium">Grade</th>
              <th className="px-4 py-2 font-medium">Post-grade value</th>
              <th className="px-4 py-2 text-right font-medium">Delta</th>
            </tr>
          </thead>
          <tbody>
            {props.cards.map((row) => {
              const cardDraft = draft.cards.get(row.cardId);
              if (!cardDraft) return null;
              return (
                <CardRow
                  key={row.cardId}
                  row={row}
                  cardDraft={cardDraft}
                  currency={draft.feeCurrency}
                  displayCurrency={displayCurrency}
                  latestRatesFromEur={latestRatesFromEur}
                  onPreChange={(v) => setCardPre(row.cardId, v)}
                  onGradeChange={(g) => setCardGrade(row.cardId, g)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <SaveBar
        dirty={dirty}
        canSave={canSave}
        pending={pending}
        message={error ?? validation.message}
        onReset={reset}
        onSave={save}
      />

      <div className="flex justify-end">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text"
            >
              Keep submission
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="rounded-md border border-missing/70 bg-missing/15 px-4 py-1.5 text-xs font-semibold text-missing transition hover:bg-missing/25 disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Yes, delete submission"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-missing/60 hover:text-missing"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete submission
          </button>
        )}
      </div>
    </div>
  );
}

// ─── subcomponents ───────────────────────────────────────────────────

function Labeled({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <p className="eyebrow">{label}</p>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function CardRow({
  row,
  cardDraft,
  currency,
  displayCurrency,
  latestRatesFromEur,
  onPreChange,
  onGradeChange,
}: {
  row: PsaCardRow;
  cardDraft: CardDraft;
  currency: LedgerCurrency;
  displayCurrency: import("@/lib/pricing/currencies").Currency;
  latestRatesFromEur: Record<
    import("@/lib/pricing/currencies").Currency,
    number
  >;
  onPreChange: (v: string) => void;
  onGradeChange: (g: number | null) => void;
}) {
  // The post-grade value reflects the DB snapshot. If the user changed
  // the grade locally but hasn't saved yet, show a small "pending"
  // marker so they know the displayed value still reflects the old grade.
  const gradeDiffersFromDb = cardDraft.grade !== row.grade;
  const delta =
    row.preGradeValueCents != null && row.postGradeValueCents != null
      ? row.postGradeValueCents - row.preGradeValueCents
      : null;

  return (
    <tr className="border-b border-border/60 last:border-b-0">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          {row.imageSmall ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={row.imageSmall}
              alt=""
              className="h-10 w-7 shrink-0 rounded-sm object-cover"
              loading="lazy"
            />
          ) : (
            <div className="h-10 w-7 shrink-0 rounded-sm bg-panel-2" />
          )}
          <div className="min-w-0">
            <Link
              href={`/cards/${encodeURIComponent(row.cardId)}`}
              className="block truncate text-sm text-text underline-offset-2 hover:underline"
            >
              {row.name}
            </Link>
            <p className="text-[11px] text-muted tabular-nums">
              {row.setId && row.number ? `${row.setId}-${row.number}` : row.cardId}
              {row.setName && (
                <>
                  {" · "}
                  <span>{row.setName}</span>
                </>
              )}
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted">{currency}</span>
          <input
            type="text"
            inputMode="decimal"
            value={cardDraft.preDraft}
            onChange={(e) => onPreChange(e.target.value)}
            placeholder="—"
            className="w-24 rounded-md border border-border bg-panel-2 px-2 py-2 text-base text-text focus:border-accent focus:outline-none md:py-1 md:text-sm"
          />
        </div>
      </td>
      <td className="px-4 py-3">
        <select
          value={cardDraft.grade ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onGradeChange(v === "" ? null : parseInt(v, 10));
          }}
          className="rounded-md border border-border bg-panel-2 px-2 py-2 text-base text-text focus:border-accent focus:outline-none md:py-1 md:text-sm [color-scheme:dark]"
        >
          <option value="">—</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((g) => (
            <option key={g} value={g}>
              PSA {g}
            </option>
          ))}
        </select>
      </td>
      <Tooltip
        content={
          gradeDiffersFromDb
            ? "Save to snapshot the new post-grade price"
            : row.grade == null
              ? "Set a grade to snapshot the post-grade market price"
              : row.postGradeValueCents == null
                ? "No market price available for this card"
                : "Snapshotted from market price when the grade was last saved"
        }
      >
        <td className="px-4 py-3">
        <span
          className={[
            "text-sm tabular-nums",
            gradeDiffersFromDb ? "text-muted italic" : "",
          ].join(" ")}
        >
          {row.postGradeValueCents != null ? (
            <MoneyDisplay
              cents={row.postGradeValueCents}
              currency={currency}
              displayCurrency={displayCurrency}
              latestRatesFromEur={latestRatesFromEur}
            />
          ) : (
            "—"
          )}
          {gradeDiffersFromDb && (
            <span className="ml-1 text-[11px]">· save to refresh</span>
          )}
        </span>
        </td>
      </Tooltip>
      <td className="px-4 py-3 text-right">
        {delta != null ? (
          <span
            className={[
              "font-semibold tabular-nums",
              delta >= 0 ? "text-covered" : "text-missing",
            ].join(" ")}
          >
            {delta >= 0 ? "+" : "−"}
            <MoneyDisplay
              cents={Math.abs(delta)}
              currency={currency}
              displayCurrency={displayCurrency}
              latestRatesFromEur={latestRatesFromEur}
            />
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

function SaveBar({
  dirty,
  canSave,
  pending,
  message,
  onReset,
  onSave,
}: {
  dirty: boolean;
  canSave: boolean;
  pending: boolean;
  message: string | null;
  onReset: () => void;
  onSave: () => void;
}) {
  if (!dirty && !message) return null;
  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-strong bg-panel/95 px-4 py-3 shadow-[0_18px_44px_-16px_rgb(0_0_0/0.7)] backdrop-blur">
      <p
        className={[
          "min-w-0 flex-1 text-sm",
          message ? "text-missing" : "text-muted",
        ].join(" ")}
      >
        {message ?? "Unsaved changes."}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onReset}
          disabled={!dirty || pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:text-text disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
