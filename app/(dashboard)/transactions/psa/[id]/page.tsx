import { notFound } from "next/navigation";
import { SETS } from "@/lib/data";
import { getAllCards } from "@/lib/data/binder-scope";
import {
  isLedgerCurrency,
  type LedgerCurrency,
} from "@/lib/ledger/money";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import { getSupabaseServer } from "@/lib/supabase/server";
import { MoneyDisplay } from "../../../_components/MoneyDisplay";
import { PageHeader } from "../../../_components/PageHeader";
import { requireUserId } from "../../../_lib/current-user";
import { loadUserPreferences } from "../../../_lib/user-preferences";
import { PsaDetailClient, type PsaCardRow } from "./_components/PsaDetailClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PsaSubmissionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const [submissionRes, cardsRes, feeRes, prefs, allCards, latestRatesFromEur] =
    await Promise.all([
      supabase
        .from("psa_submissions")
        .select("id, submitted_at, returned_at, note, created_at")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("psa_submission_cards")
        .select("card_id, pre_grade_value_cents, grade, post_grade_value_cents")
        .eq("submission_id", id),
      supabase
        .from("transactions")
        .select("id, amount_cents, currency, occurred_at, rate_to_eur")
        .eq("psa_submission_id", id)
        .eq("kind", "psa_fee")
        .maybeSingle(),
      loadUserPreferences(userId),
      getAllCards(),
      getLatestRatesFromEur(),
    ]);

  if (submissionRes.error) throw new Error(submissionRes.error.message);
  if (!submissionRes.data) notFound();

  const submission = submissionRes.data;
  const cardRows = cardsRes.data ?? [];
  const cardInfoById = new Map(
    allCards.map((c) => [c.id, c] as const),
  );

  const setNameById = new Map(SETS.map((s) => [s.id, s.name] as const));
  const cards: PsaCardRow[] = cardRows.map((r) => {
    const info = cardInfoById.get(r.card_id as string);
    const setId = info?.setId ?? null;
    return {
      cardId: r.card_id as string,
      name: info?.name ?? (r.card_id as string),
      setId,
      setName: setId ? setNameById.get(setId) ?? null : null,
      number: info?.number ?? null,
      imageSmall: info?.imageSmall ?? null,
      preGradeValueCents: (r.pre_grade_value_cents as number | null) ?? null,
      grade: (r.grade as number | null) ?? null,
      postGradeValueCents: (r.post_grade_value_cents as number | null) ?? null,
    };
  });

  const feeCurrency: LedgerCurrency = isLedgerCurrency(feeRes.data?.currency)
    ? (feeRes.data.currency as LedgerCurrency)
    : prefs.displayCurrency;
  const feeCents = feeRes.data?.amount_cents != null ? -Number(feeRes.data.amount_cents) : 0;
  const feeRateToEur =
    feeRes.data?.rate_to_eur != null ? Number(feeRes.data.rate_to_eur) : null;
  const feeOccurredAt = (feeRes.data?.occurred_at as string | null) ?? null;

  // Aggregate pre vs post for an at-a-glance "did grading help?" line.
  // Skip cards where either side is missing — we only report on the
  // ones for which we can compare honestly.
  let preTotal = 0;
  let postTotal = 0;
  let comparable = 0;
  for (const c of cards) {
    if (c.preGradeValueCents != null && c.postGradeValueCents != null) {
      preTotal += c.preGradeValueCents;
      postTotal += c.postGradeValueCents;
      comparable++;
    }
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="PSA submission"
        title={`${cards.length} card${cards.length === 1 ? "" : "s"} submitted`}
      />

      <section className="grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 text-sm md:grid-cols-4">
        <Stat
          label="Submitted"
          value={formatDate(submission.submitted_at as string)}
        />
        <Stat
          label="Returned"
          value={
            submission.returned_at
              ? formatDate(submission.returned_at as string)
              : <span className="text-muted">In transit</span>
          }
        />
        <Stat
          label="Fee"
          value={
            feeCents > 0 ? (
              <>
                −
                <MoneyDisplay
                  cents={feeCents}
                  currency={feeCurrency}
                  rateToEur={feeRateToEur}
                  asOf={feeOccurredAt}
                  displayCurrency={prefs.displayCurrency}
                  latestRatesFromEur={latestRatesFromEur}
                />
              </>
            ) : (
              <span className="text-muted">—</span>
            )
          }
          tone="neg"
        />
        {comparable > 0 && (
          <Stat
            label="Pre → post (graded)"
            value={
              <span
                className={
                  postTotal >= preTotal ? "text-covered" : "text-missing"
                }
              >
                <MoneyDisplay
                  cents={preTotal}
                  currency={feeCurrency}
                  displayCurrency={prefs.displayCurrency}
                  latestRatesFromEur={latestRatesFromEur}
                />
                {" → "}
                <MoneyDisplay
                  cents={postTotal}
                  currency={feeCurrency}
                  displayCurrency={prefs.displayCurrency}
                  latestRatesFromEur={latestRatesFromEur}
                />
              </span>
            }
          />
        )}
      </section>

      <PsaDetailClient
        submissionId={submission.id as string}
        submittedAt={submission.submitted_at as string}
        returnedAt={(submission.returned_at as string | null) ?? null}
        note={(submission.note as string | null) ?? null}
        currency={feeCurrency}
        feeCents={feeCents}
        cards={cards}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neg";
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p
        className={[
          "text-base font-semibold tabular-nums",
          tone === "neg" ? "text-missing" : "text-text",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
