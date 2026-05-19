"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  fetchPricesForCards,
  pickPrice,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import { requireUserId } from "../../_lib/current-user";
import { loadUserPreferences } from "../../_lib/user-preferences";

// Cap matches the pack-cost guard in pack-actions.ts: $1,000,000 in cents.
// More than enough for any singles purchase that doesn't involve a vintage
// PSA 10 Charizard. Postgres int range is far higher; this is purely a
// guard against fat-fingered entries.
const MAX_COST_CENTS = 1_000_000_00;

const logSinglePurchaseSchema = z.object({
  cardId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(100),
  unitCostCents: z.number().int().min(0).max(MAX_COST_CENTS),
  currency: z.enum(["USD", "EUR"]),
  occurredAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

const editSinglePurchaseSchema = z.object({
  transactionId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  unitCostCents: z.number().int().min(0).max(MAX_COST_CENTS),
  currency: z.enum(["USD", "EUR"]),
  occurredAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

const editSingleSaleSchema = z.object({
  transactionId: z.string().uuid(),
  quantity: z.number().int().min(1).max(100),
  unitProceedsCents: z.number().int().min(0).max(MAX_COST_CENTS),
  currency: z.enum(["USD", "EUR"]),
  occurredAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

const logSingleSaleSchema = z.object({
  cardId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(100),
  unitProceedsCents: z.number().int().min(0).max(MAX_COST_CENTS),
  currency: z.enum(["USD", "EUR"]),
  occurredAt: z.string().datetime(),
  note: z.string().max(500).optional(),
});

export interface LogSinglePurchaseInput {
  cardId: string;
  quantity: number;
  unitCostCents: number;
  currency: "USD" | "EUR";
  occurredAt: string;
  note?: string;
}

export interface EditSinglePurchaseInput {
  transactionId: string;
  quantity: number;
  unitCostCents: number;
  currency: "USD" | "EUR";
  occurredAt: string;
  note?: string;
}

export interface EditSingleSaleInput {
  transactionId: string;
  quantity: number;
  unitProceedsCents: number;
  currency: "USD" | "EUR";
  occurredAt: string;
  note?: string;
}

export interface LogSingleSaleInput {
  cardId: string;
  quantity: number;
  unitProceedsCents: number;
  currency: "USD" | "EUR";
  occurredAt: string;
  note?: string;
}

// Records a singles purchase atomically via the log_single_purchase RPC:
// the function inserts the ledger row and bumps owned_cards in one
// transaction so a failure in either step rolls back both. Earlier
// versions of this action used two separate calls and could leave
// orphan ledger rows when the UDF errored (e.g. the card_id-ambiguity
// bug fixed in 20260523140000).
export async function logSinglePurchase(
  input: LogSinglePurchaseInput,
): Promise<{ transactionId: string }> {
  const parsed = logSinglePurchaseSchema.parse(input);
  await requireUserId();
  const supabase = await getSupabaseServer();

  const totalCents = parsed.unitCostCents * parsed.quantity;

  const { data: txnId, error } = await supabase.rpc("log_single_purchase", {
    _card_id: parsed.cardId,
    _quantity: parsed.quantity,
    _total_cost_cents: totalCents,
    _currency: parsed.currency,
    _occurred_at: parsed.occurredAt,
    _note: parsed.note ?? null,
  });
  if (error) throw new Error(`Failed to log purchase: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
  return { transactionId: txnId as string };
}

// ─── PSA submission flow ──────────────────────────────────────────────

const logPsaSubmissionSchema = z.object({
  cardIds: z.array(z.string().min(1).max(64)).min(1).max(64),
  submittedAt: z.string().datetime(),
  feeCents: z.number().int().min(0).max(MAX_COST_CENTS),
  currency: z.enum(["USD", "EUR"]),
  note: z.string().max(500).optional(),
});

export interface LogPsaSubmissionInput {
  cardIds: string[];
  submittedAt: string;
  feeCents: number;
  currency: "USD" | "EUR";
  note?: string;
}

// Creates a PSA submission with N cards atomically: writes the
// submission header, one psa_submission_cards row per card (with
// pre_grade_value_cents snapshotted from the user's currently-preferred
// price source), and one psa_fee transactions row if fee > 0.
export async function logPsaSubmission(
  input: LogPsaSubmissionInput,
): Promise<{ submissionId: string }> {
  const parsed = logPsaSubmissionSchema.parse(input);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const deduped = [...new Set(parsed.cardIds)];
  const prefs = await loadUserPreferences(userId);
  const source: PriceSource = prefs.priceSource;
  const priceMap = await fetchPricesForCards(deduped);
  const preGradeValues = deduped.map((id) => {
    const v = pickPrice(priceMap.get(id), source);
    return v == null ? null : Math.round(v * 100);
  });

  const { data: submissionId, error } = await supabase.rpc("log_psa_submission", {
    _card_ids: deduped,
    _pre_grade_values: preGradeValues,
    _submitted_at: parsed.submittedAt,
    _fee_cents: parsed.feeCents,
    _currency: parsed.currency,
    _note: parsed.note ?? null,
  });
  if (error) throw new Error(`Failed to create submission: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath(`/transactions/psa/${submissionId as string}`);
  return { submissionId: submissionId as string };
}

const updatePsaSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  returnedAt: z.string().datetime().nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export interface UpdatePsaSubmissionOptions {
  returnedAt?: string | null;
  note?: string | null;
}

// Updates submission-level metadata (returned_at + note). Per-card
// fields use updatePsaSubmissionCard.
export async function updatePsaSubmission(
  submissionId: string,
  options: UpdatePsaSubmissionOptions,
): Promise<void> {
  const parsed = updatePsaSubmissionSchema.parse({ submissionId, ...options });
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const patch: Record<string, unknown> = {};
  if (options.returnedAt !== undefined) patch.returned_at = parsed.returnedAt ?? null;
  if (options.note !== undefined) patch.note = parsed.note ?? null;
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("psa_submissions")
    .update(patch)
    .eq("id", parsed.submissionId)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to update submission: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath(`/transactions/psa/${parsed.submissionId}`);
}

const updatePsaSubmissionCardSchema = z.object({
  submissionId: z.string().uuid(),
  cardId: z.string().min(1).max(64),
  preGradeValueCents: z.number().int().min(0).max(MAX_COST_CENTS).nullable().optional(),
  grade: z.number().int().min(1).max(10).nullable().optional(),
});

export interface UpdatePsaCardOptions {
  preGradeValueCents?: number | null;
  grade?: number | null;
}

// post_grade_value_cents is intentionally NOT in the input shape: it's a
// market-price snapshot, derived server-side from the free pokemontcg.io
// pricing whenever the grade is set, the same way pre_grade is snapshot
// at submission time. Setting the grade triggers a fresh fetch; clearing
// the grade clears the post-grade value (no "after" without a grade).
export async function updatePsaSubmissionCard(
  submissionId: string,
  cardId: string,
  options: UpdatePsaCardOptions,
): Promise<void> {
  const parsed = updatePsaSubmissionCardSchema.parse({
    submissionId,
    cardId,
    ...options,
  });
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const patch: Record<string, unknown> = {};
  if (options.preGradeValueCents !== undefined)
    patch.pre_grade_value_cents = parsed.preGradeValueCents ?? null;
  if (options.grade !== undefined) {
    patch.grade = parsed.grade ?? null;
    if (parsed.grade == null) {
      // No grade → no post-grade value either.
      patch.post_grade_value_cents = null;
    } else {
      // Snapshot the card's market price right now (raw price; the free
      // pokemontcg.io API has no PSA-graded variant prices). Honest gap:
      // it doesn't reflect grade premium. If the API has no price the
      // field stays null.
      const prefs = await loadUserPreferences(userId);
      const priceMap = await fetchPricesForCards([parsed.cardId]);
      const v = pickPrice(priceMap.get(parsed.cardId), prefs.priceSource);
      patch.post_grade_value_cents = v == null ? null : Math.round(v * 100);
    }
  }
  if (Object.keys(patch).length === 0) return;

  // RLS limits the update to the submission's owner via the
  // psa_submission_cards policy; no explicit user_id check needed here.
  const { error } = await supabase
    .from("psa_submission_cards")
    .update(patch)
    .eq("submission_id", parsed.submissionId)
    .eq("card_id", parsed.cardId);
  if (error) throw new Error(`Failed to update submission card: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath(`/transactions/psa/${parsed.submissionId}`);
}

export async function deletePsaSubmission(submissionId: string): Promise<void> {
  const parsed = z.string().uuid().parse(submissionId);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  // Cascading FKs handle psa_submission_cards and the linked psa_fee
  // transaction; deleting just the parent is enough.
  const { error } = await supabase
    .from("psa_submissions")
    .delete()
    .eq("id", parsed)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to delete submission: ${error.message}`);

  revalidatePath("/transactions");
}

// Records a card sale atomically: writes a positive transactions row
// and decrements owned_cards.quantity (with row delete at zero) in one
// RPC call. The RPC raises if the user doesn't own enough copies, so
// the ledger never reflects a sale that wasn't backed by inventory.
export async function logSingleSale(
  input: LogSingleSaleInput,
): Promise<{ transactionId: string }> {
  const parsed = logSingleSaleSchema.parse(input);
  await requireUserId();
  const supabase = await getSupabaseServer();

  const totalCents = parsed.unitProceedsCents * parsed.quantity;

  const { data: txnId, error } = await supabase.rpc("log_single_sale", {
    _card_id: parsed.cardId,
    _quantity: parsed.quantity,
    _total_proceeds_cents: totalCents,
    _currency: parsed.currency,
    _occurred_at: parsed.occurredAt,
    _note: parsed.note ?? null,
  });
  if (error) throw new Error(`Failed to log sale: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
  return { transactionId: txnId as string };
}

// ─── Edit / delete: singles purchase ─────────────────────────────────

export async function editSinglePurchase(input: EditSinglePurchaseInput): Promise<void> {
  const parsed = editSinglePurchaseSchema.parse(input);
  await requireUserId();
  const supabase = await getSupabaseServer();

  const totalCents = parsed.unitCostCents * parsed.quantity;
  const { error } = await supabase.rpc("edit_single_purchase", {
    _txn_id: parsed.transactionId,
    _quantity: parsed.quantity,
    _total_cost_cents: totalCents,
    _currency: parsed.currency,
    _occurred_at: parsed.occurredAt,
    _note: parsed.note ?? null,
  });
  if (error) throw new Error(`Failed to update purchase: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
}

export async function deleteSinglePurchase(transactionId: string): Promise<void> {
  const parsed = z.string().uuid().parse(transactionId);
  await requireUserId();
  const supabase = await getSupabaseServer();

  const { error } = await supabase.rpc("delete_single_purchase", { _txn_id: parsed });
  if (error) throw new Error(`Failed to delete purchase: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
}

// ─── Edit / delete: sale ─────────────────────────────────────────────

export async function editSingleSale(input: EditSingleSaleInput): Promise<void> {
  const parsed = editSingleSaleSchema.parse(input);
  await requireUserId();
  const supabase = await getSupabaseServer();

  const totalCents = parsed.unitProceedsCents * parsed.quantity;
  const { error } = await supabase.rpc("edit_single_sale", {
    _txn_id: parsed.transactionId,
    _quantity: parsed.quantity,
    _total_proceeds_cents: totalCents,
    _currency: parsed.currency,
    _occurred_at: parsed.occurredAt,
    _note: parsed.note ?? null,
  });
  if (error) throw new Error(`Failed to update sale: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
}

export async function deleteSingleSale(transactionId: string): Promise<void> {
  const parsed = z.string().uuid().parse(transactionId);
  await requireUserId();
  const supabase = await getSupabaseServer();

  const { error } = await supabase.rpc("delete_single_sale", { _txn_id: parsed });
  if (error) throw new Error(`Failed to delete sale: ${error.message}`);

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
}

// ─── PSA fee editing (inline on the submission detail page) ──────────

const updatePsaFeeSchema = z.object({
  submissionId: z.string().uuid(),
  feeCents: z.number().int().min(0).max(MAX_COST_CENTS),
  currency: z.enum(["USD", "EUR"]),
});

// Sets the fee for a submission. Updates the existing psa_fee
// transaction if there is one, inserts a new one if the user previously
// had a zero fee, or deletes the row if the new fee is zero.
export async function updatePsaFee(
  submissionId: string,
  feeCents: number,
  currency: "USD" | "EUR",
): Promise<void> {
  const parsed = updatePsaFeeSchema.parse({ submissionId, feeCents, currency });
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: submission, error: subErr } = await supabase
    .from("psa_submissions")
    .select("submitted_at, note")
    .eq("id", parsed.submissionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (subErr) throw new Error(subErr.message);
  if (!submission) throw new Error("Submission not found");

  const { data: existingFee, error: feeErr } = await supabase
    .from("transactions")
    .select("id")
    .eq("psa_submission_id", parsed.submissionId)
    .eq("kind", "psa_fee")
    .maybeSingle();
  if (feeErr) throw new Error(feeErr.message);

  if (parsed.feeCents === 0) {
    if (existingFee) {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .eq("id", existingFee.id);
      if (error) throw new Error(error.message);
    }
  } else if (existingFee) {
    const { error } = await supabase
      .from("transactions")
      .update({
        amount_cents: -parsed.feeCents,
        currency: parsed.currency,
      })
      .eq("id", existingFee.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      kind: "psa_fee",
      occurred_at: submission.submitted_at,
      amount_cents: -parsed.feeCents,
      currency: parsed.currency,
      psa_submission_id: parsed.submissionId,
      note: submission.note ?? null,
    });
    if (error) throw new Error(error.message);
  }

  revalidatePath("/transactions");
  revalidatePath(`/transactions/psa/${parsed.submissionId}`);
}
