"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isCurrency, type Currency } from "@/lib/pricing/currencies";
import { getRateToEurToday } from "@/lib/pricing/exchange-rates";
import { requireUserId } from "./current-user";
import { diffLotContents, type LotContentRow } from "./lot-contents";

// Matches the pack-cost guard in pack-actions.ts: $1,000,000 in cents.
const MAX_COST_CENTS = 1_000_000_00;
const MAX_CARDS = 2048;

const costSchema = z
  .object({
    costCents: z.number().int().min(0).max(MAX_COST_CENTS).nullable(),
    currency: z.string().refine(isCurrency, "unsupported currency"),
  })
  .optional();

export interface LotCostInput {
  costCents: number | null;
  currency: Currency;
}

const contentSchema = z.object({
  cardId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(99),
});

const logLotSchema = z.object({
  contents: z.array(contentSchema).max(MAX_CARDS),
  cost: costSchema,
});

// Replaces the lot's lot_purchase ledger row with one reflecting the
// lot's current cost/currency/purchased_at/rate. Idempotent — no row
// when cost is null. deleteCardLot relies on the transactions.lot_id FK
// cascade, so no explicit delete is needed there.
async function syncLotPurchaseTransaction(
  supabase: SupabaseClient,
  userId: string,
  lotId: string,
): Promise<void> {
  const { data: lot, error: lookupErr } = await supabase
    .from("card_lots")
    .select("cost_cents, currency, purchased_at, rate_to_eur")
    .eq("id", lotId)
    .eq("user_id", userId)
    .single();
  if (lookupErr) throw new Error(lookupErr.message);

  const { error: delErr } = await supabase
    .from("transactions")
    .delete()
    .eq("lot_id", lotId)
    .eq("kind", "lot_purchase")
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  if (lot.cost_cents == null || !lot.currency) return;

  const { error: insErr } = await supabase.from("transactions").insert({
    user_id: userId,
    kind: "lot_purchase",
    occurred_at: lot.purchased_at,
    amount_cents: -lot.cost_cents,
    currency: lot.currency,
    lot_id: lotId,
    rate_to_eur: lot.rate_to_eur ?? null,
  });
  if (insErr) throw new Error(insErr.message);
}

export async function logCardLot(
  contents: LotContentRow[],
  cost?: LotCostInput,
): Promise<{ lotId: string; newCards: number }> {
  const { contents: rows, cost: parsedCost } = logLotSchema.parse({ contents, cost });

  // Dedupe by card_id, keeping the last quantity supplied.
  const byCard = new Map<string, number>();
  for (const r of rows) byCard.set(r.cardId, r.quantity);
  const cardIds = [...byCard.keys()];

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  // Snapshot ownership before writes so newCards = cards going 0 -> >=1.
  let newCards = 0;
  if (cardIds.length > 0) {
    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .in("card_id", cardIds);
    const alreadyOwned = new Set((existingOwned ?? []).map((r) => r.card_id as string));
    newCards = cardIds.filter((c) => !alreadyOwned.has(c)).length;
  }

  const lotRow: {
    user_id: string;
    cost_cents?: number | null;
    currency?: string | null;
    rate_to_eur?: number | null;
  } = { user_id: userId };
  if (parsedCost) {
    lotRow.cost_cents = parsedCost.costCents;
    lotRow.currency = parsedCost.costCents != null ? parsedCost.currency : null;
    if (parsedCost.costCents != null) {
      lotRow.rate_to_eur = await getRateToEurToday(parsedCost.currency);
    }
  }

  const { data: lot, error: lotErr } = await supabase
    .from("card_lots")
    .insert(lotRow)
    .select("id")
    .single();
  if (lotErr) throw new Error(`Failed to log lot: ${lotErr.message}`);

  if (cardIds.length > 0) {
    const contentRows = cardIds.map((card_id) => ({
      lot_id: lot.id,
      card_id,
      quantity: byCard.get(card_id)!,
    }));
    const { error: contentsErr } = await supabase.from("lot_contents").insert(contentRows);
    if (contentsErr) throw new Error(`Failed to write lot contents: ${contentsErr.message}`);

    const deltas = cardIds.map((c) => byCard.get(c)!);
    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_deltas", {
      _user_id: userId,
      _card_ids: cardIds,
      _deltas: deltas,
    });
    if (deltaErr) throw new Error(`Failed to mark owned: ${deltaErr.message}`);

    const { error: resyncErr } = await supabase.rpc("owned_cards_resync_acquired_at", {
      _user_id: userId,
      _card_ids: cardIds,
    });
    if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
  }

  if (parsedCost && parsedCost.costCents != null) {
    await syncLotPurchaseTransaction(supabase, userId, lot.id as string);
  }

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
  return { lotId: lot.id as string, newCards };
}

const updateLotSchema = z.object({
  lotId: z.string().uuid(),
  contents: z.array(contentSchema).max(MAX_CARDS),
  purchasedAt: z.string().datetime().optional(),
  cost: costSchema,
});

export interface UpdateLotOptions {
  purchasedAt?: string;
  costCents?: number | null;
  currency?: Currency;
}

export async function updateCardLot(
  lotId: string,
  contents: LotContentRow[],
  options: UpdateLotOptions = {},
): Promise<{ newCards: number }> {
  const cost =
    options.currency !== undefined
      ? { costCents: options.costCents ?? null, currency: options.currency }
      : undefined;
  const {
    lotId: lid,
    contents: rows,
    purchasedAt: when,
    cost: parsedCost,
  } = updateLotSchema.parse({ lotId, contents, purchasedAt: options.purchasedAt, cost });

  const nextByCard = new Map<string, number>();
  for (const r of rows) nextByCard.set(r.cardId, r.quantity);

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: lot, error: lookupErr } = await supabase
    .from("card_lots")
    .select("id, currency")
    .eq("id", lid)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (!lot) throw new Error("Lot not found");

  const lotPatch: {
    purchased_at?: string;
    cost_cents?: number | null;
    currency?: string | null;
    rate_to_eur?: number | null;
  } = {};
  if (when) lotPatch.purchased_at = when;
  if (parsedCost) {
    lotPatch.cost_cents = parsedCost.costCents;
    lotPatch.currency = parsedCost.costCents != null ? parsedCost.currency : null;
    const currencyChanged =
      parsedCost.costCents != null && lot.currency !== parsedCost.currency;
    if (parsedCost.costCents == null) {
      lotPatch.rate_to_eur = null;
    } else if (currencyChanged) {
      lotPatch.rate_to_eur = await getRateToEurToday(parsedCost.currency);
    }
  }
  if (Object.keys(lotPatch).length > 0) {
    const { error: patchErr } = await supabase
      .from("card_lots")
      .update(lotPatch)
      .eq("id", lid)
      .eq("user_id", userId);
    if (patchErr) throw new Error(patchErr.message);
  }

  const { data: existingContents } = await supabase
    .from("lot_contents")
    .select("card_id, quantity")
    .eq("lot_id", lid);
  const existingByCard = new Map<string, number>(
    (existingContents ?? []).map((r) => [r.card_id as string, r.quantity as number]),
  );

  const diff = diffLotContents(existingByCard, nextByCard);

  // Write contents: upsert changed rows, delete removed rows.
  if (diff.upserts.length > 0) {
    const upsertRows = diff.upserts.map((u) => ({
      lot_id: lid,
      card_id: u.cardId,
      quantity: u.quantity,
    }));
    const { error: upErr } = await supabase
      .from("lot_contents")
      .upsert(upsertRows, { onConflict: "lot_id,card_id" });
    if (upErr) throw new Error(upErr.message);
  }
  if (diff.removals.length > 0) {
    const { error: delErr } = await supabase
      .from("lot_contents")
      .delete()
      .eq("lot_id", lid)
      .in("card_id", diff.removals);
    if (delErr) throw new Error(delErr.message);
  }

  // newCards = cards being added that the user doesn't already own.
  let newCards = 0;
  const addedCardIds = diff.deltaCardIds.filter(
    (c, i) => diff.deltas[i]! > 0 && !existingByCard.has(c),
  );
  if (addedCardIds.length > 0) {
    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .in("card_id", addedCardIds);
    const alreadyOwned = new Set((existingOwned ?? []).map((r) => r.card_id as string));
    newCards = addedCardIds.filter((c) => !alreadyOwned.has(c)).length;
  }

  // Apply owned deltas.
  if (diff.deltaCardIds.length > 0) {
    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_deltas", {
      _user_id: userId,
      _card_ids: diff.deltaCardIds,
      _deltas: diff.deltas,
    });
    if (deltaErr) throw new Error(deltaErr.message);
  }

  // Resync acquired_at for the union of touched cards (date or membership
  // may have shifted). Always-on union; the RPC no-ops untouched cards.
  if (when || diff.deltaCardIds.length > 0) {
    const resyncIds = [...new Set([...existingByCard.keys(), ...nextByCard.keys()])];
    if (resyncIds.length > 0) {
      const { error: resyncErr } = await supabase.rpc("owned_cards_resync_acquired_at", {
        _user_id: userId,
        _card_ids: resyncIds,
      });
      if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
    }
  }

  if (parsedCost || when) {
    await syncLotPurchaseTransaction(supabase, userId, lid);
  }

  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
  return { newCards };
}

export async function deleteCardLot(lotId: string): Promise<void> {
  const lid = z.string().uuid().parse(lotId);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: contents } = await supabase
    .from("lot_contents")
    .select("card_id, quantity, card_lots!inner(user_id)")
    .eq("lot_id", lid)
    .eq("card_lots.user_id", userId);
  const cardIds = (contents ?? []).map((r) => r.card_id as string);
  const deltas = (contents ?? []).map((r) => -(r.quantity as number));

  if (cardIds.length > 0) {
    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_deltas", {
      _user_id: userId,
      _card_ids: cardIds,
      _deltas: deltas,
    });
    if (deltaErr) throw new Error(`Failed to decrement owned: ${deltaErr.message}`);
  }

  const { error } = await supabase
    .from("card_lots")
    .delete()
    .eq("user_id", userId)
    .eq("id", lid);
  if (error) throw new Error(`Failed to delete lot: ${error.message}`);

  if (cardIds.length > 0) {
    const { error: resyncErr } = await supabase.rpc("owned_cards_resync_acquired_at", {
      _user_id: userId,
      _card_ids: cardIds,
    });
    if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
  }
  // The lot_purchase ledger row (if any) cascades via transactions.lot_id.
  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/collection");
}
