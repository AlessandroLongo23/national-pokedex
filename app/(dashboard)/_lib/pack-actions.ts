"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCurrency, type Currency } from "@/lib/pricing/currencies";
import { getRateToEurToday } from "@/lib/pricing/exchange-rates";
import { requireUserId } from "./current-user";

// Replaces the pack's pack_purchase ledger row with one reflecting the
// pack's current cost/currency/opened_at/rate_to_eur. Called whenever a
// pack is created or its cost/date is edited. Idempotent — if cost is
// null, the row simply doesn't exist after the sync. deletePack relies
// on the transactions.pack_id FK's on-delete cascade, so no explicit
// delete needed there.
async function syncPackPurchaseTransaction(
  supabase: SupabaseClient,
  userId: string,
  packId: string,
): Promise<void> {
  const { data: pack, error: lookupErr } = await supabase
    .from("packs_opened")
    .select("cost_cents, currency, opened_at, rate_to_eur")
    .eq("id", packId)
    .eq("user_id", userId)
    .single();
  if (lookupErr) throw new Error(lookupErr.message);

  const { error: delErr } = await supabase
    .from("transactions")
    .delete()
    .eq("pack_id", packId)
    .eq("kind", "pack_purchase")
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);

  if (pack.cost_cents == null || !pack.currency) return;

  const { error: insErr } = await supabase.from("transactions").insert({
    user_id: userId,
    kind: "pack_purchase",
    occurred_at: pack.opened_at,
    amount_cents: -pack.cost_cents,
    currency: pack.currency,
    pack_id: packId,
    rate_to_eur: pack.rate_to_eur ?? null,
  });
  if (insErr) throw new Error(insErr.message);
}

// MAX_COST_CENTS guards against a fat-fingered "$100,000,000" entry —
// no sane pack costs anywhere near this; well under postgres int range.
const MAX_COST_CENTS = 1_000_000_00;

const costSchema = z
  .object({
    costCents: z.number().int().min(0).max(MAX_COST_CENTS).nullable(),
    currency: z.string().refine(isCurrency, "unsupported currency"),
  })
  .optional();

const logPackSchema = z.object({
  setId: z.string().min(1).max(32),
  cardIds: z.array(z.string().min(1).max(64)).max(64),
  cost: costSchema,
});

export interface PackCostInput {
  costCents: number | null;
  currency: Currency;
}

export async function logPack(
  setId: string,
  cardIds: string[],
  cost?: PackCostInput,
): Promise<{ packId: string; newCards: number }> {
  const {
    setId: sid,
    cardIds: ids,
    cost: parsedCost,
  } = logPackSchema.parse({ setId, cardIds, cost });
  const deduped = [...new Set(ids)];
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  // Snapshot ownership before any writes so we can report new acquisitions
  // (qty 0 → qty ≥ 1). Cards already owned with qty > 0 are duplicates,
  // not "new".
  let newCards = 0;
  if (deduped.length > 0) {
    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .in("card_id", deduped);
    const alreadyOwned = new Set((existingOwned ?? []).map((r) => r.card_id as string));
    newCards = deduped.filter((c) => !alreadyOwned.has(c)).length;
  }

  const packRow: {
    user_id: string;
    set_id: string;
    cost_cents?: number | null;
    currency?: string | null;
    rate_to_eur?: number | null;
  } = { user_id: userId, set_id: sid };
  if (parsedCost) {
    packRow.cost_cents = parsedCost.costCents;
    packRow.currency = parsedCost.costCents != null ? parsedCost.currency : null;
    // Snapshot today's EUR rate so the pack's cost converts to any
    // display currency using the rate that was true when it was logged.
    // Null is acceptable — the display layer falls back to today's rate
    // and marks the value as approximate.
    if (parsedCost.costCents != null) {
      packRow.rate_to_eur = await getRateToEurToday(parsedCost.currency);
    }
  }

  const { data: pack, error: packErr } = await supabase
    .from("packs_opened")
    .insert(packRow)
    .select("id")
    .single();
  if (packErr) throw new Error(`Failed to log pack: ${packErr.message}`);

  if (deduped.length > 0) {
    const contents = deduped.map((card_id) => ({ pack_id: pack.id, card_id }));
    const { error: contentsErr } = await supabase.from("pack_contents").insert(contents);
    if (contentsErr) throw new Error(`Failed to write pack contents: ${contentsErr.message}`);

    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_delta", {
      _user_id: userId,
      _card_ids: deduped,
      _delta: 1,
    });
    if (deltaErr) throw new Error(`Failed to mark owned: ${deltaErr.message}`);

    // Reconcile acquired_at against the underlying events. New packs
    // default to now() so this is usually a no-op, but if any of these
    // cards were already owned from an earlier-dated pack we want the
    // owned row to reflect that earliest date.
    const { error: resyncErr } = await supabase.rpc("owned_cards_resync_acquired_at", {
      _user_id: userId,
      _card_ids: deduped,
    });
    if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
  }

  if (parsedCost && parsedCost.costCents != null) {
    await syncPackPurchaseTransaction(supabase, userId, pack.id as string);
  }

  revalidatePath("/packs");
  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  return { packId: pack.id as string, newCards };
}

const updatePackSchema = z.object({
  packId: z.string().uuid(),
  cardIds: z.array(z.string().min(1).max(64)).max(64),
  openedAt: z.string().datetime().optional(),
  cost: costSchema,
});

export interface UpdatePackOptions {
  openedAt?: string;
  costCents?: number | null;
  currency?: Currency;
}

export async function updatePack(
  packId: string,
  cardIds: string[],
  options: UpdatePackOptions = {},
): Promise<{ newCards: number }> {
  const cost =
    options.currency !== undefined
      ? { costCents: options.costCents ?? null, currency: options.currency }
      : undefined;
  const {
    packId: pid,
    cardIds: ids,
    openedAt: when,
    cost: parsedCost,
  } = updatePackSchema.parse({
    packId,
    cardIds,
    openedAt: options.openedAt,
    cost,
  });
  const deduped = [...new Set(ids)];
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: pack, error: lookupErr } = await supabase
    .from("packs_opened")
    .select("id, currency")
    .eq("id", pid)
    .eq("user_id", userId)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (!pack) throw new Error("Pack not found");

  const packPatch: {
    opened_at?: string;
    cost_cents?: number | null;
    currency?: string | null;
    rate_to_eur?: number | null;
  } = {};
  if (when) packPatch.opened_at = when;
  if (parsedCost) {
    packPatch.cost_cents = parsedCost.costCents;
    packPatch.currency = parsedCost.costCents != null ? parsedCost.currency : null;
    // Ledger truth: keep the original snapshot rate when the currency
    // didn't change (the user is just correcting the amount on the same
    // day they paid). Only refetch when the currency actually changed or
    // when going from null cost to a real cost.
    const currencyChanged =
      parsedCost.costCents != null && pack.currency !== parsedCost.currency;
    if (parsedCost.costCents == null) {
      packPatch.rate_to_eur = null;
    } else if (currencyChanged) {
      packPatch.rate_to_eur = await getRateToEurToday(parsedCost.currency);
    }
  }
  if (Object.keys(packPatch).length > 0) {
    const { error: patchErr } = await supabase
      .from("packs_opened")
      .update(packPatch)
      .eq("id", pid)
      .eq("user_id", userId);
    if (patchErr) throw new Error(patchErr.message);
  }

  // Diff the pack against its existing contents so we can apply the
  // quantity deltas correctly: each pack contributes +1 to qty per card,
  // so adding a card to this pack should +1, removing should −1. The RPC
  // floors at zero (no row when qty hits 0).
  const { data: existingContents } = await supabase
    .from("pack_contents")
    .select("card_id")
    .eq("pack_id", pid);
  const existingSet = new Set(
    (existingContents ?? []).map((r) => r.card_id as string),
  );
  const newSet = new Set(deduped);
  const added = deduped.filter((c) => !existingSet.has(c));
  const removed = [...existingSet].filter((c) => !newSet.has(c));

  if (removed.length > 0) {
    const { error: delErr } = await supabase
      .from("pack_contents")
      .delete()
      .eq("pack_id", pid)
      .in("card_id", removed);
    if (delErr) throw new Error(delErr.message);
  }

  let newCards = 0;
  if (added.length > 0) {
    const rows = added.map((card_id) => ({ pack_id: pid, card_id }));
    const { error: insErr } = await supabase.from("pack_contents").insert(rows);
    if (insErr) throw new Error(insErr.message);

    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", userId)
      .in("card_id", added);
    const alreadyOwned = new Set(
      (existingOwned ?? []).map((r) => r.card_id as string),
    );
    newCards = added.filter((c) => !alreadyOwned.has(c)).length;

    const { error: addErr } = await supabase.rpc("owned_cards_apply_delta", {
      _user_id: userId,
      _card_ids: added,
      _delta: 1,
    });
    if (addErr) throw new Error(addErr.message);
  }

  if (removed.length > 0) {
    const { error: remErr } = await supabase.rpc("owned_cards_apply_delta", {
      _user_id: userId,
      _card_ids: removed,
      _delta: -1,
    });
    if (remErr) throw new Error(remErr.message);
  }

  // Resync acquired_at for every card whose source-event set may have
  // shifted: anything added (this pack is now a source), anything
  // removed (this pack is no longer a source), and — if opened_at moved
  // — every card still in the pack. Always-on union keeps the call
  // simple; the RPC is a no-op for cards untouched by this edit.
  if (when || added.length > 0 || removed.length > 0) {
    const resyncIds = [...new Set([...existingSet, ...newSet])];
    if (resyncIds.length > 0) {
      const { error: resyncErr } = await supabase.rpc(
        "owned_cards_resync_acquired_at",
        { _user_id: userId, _card_ids: resyncIds },
      );
      if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
    }
  }

  // Cost or date may have changed — re-mirror into the ledger. Skipping
  // the sync when neither changed avoids a redundant write per save.
  if (parsedCost || when) {
    await syncPackPurchaseTransaction(supabase, userId, pid);
  }

  revalidatePath("/packs");
  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  return { newCards };
}

export async function deletePack(packId: string): Promise<void> {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  // Decrement the qty contributed by this pack so deleting the record
  // also undoes its contribution to ownership counts. Cards acquired
  // from other packs/sources stay > 0 thanks to the RPC's floor.
  const { data: contents } = await supabase
    .from("pack_contents")
    .select("card_id, packs_opened!inner(user_id)")
    .eq("pack_id", packId)
    .eq("packs_opened.user_id", userId);
  const cardIds = (contents ?? []).map((r) => r.card_id as string);
  if (cardIds.length > 0) {
    const { error: deltaErr } = await supabase.rpc("owned_cards_apply_delta", {
      _user_id: userId,
      _card_ids: cardIds,
      _delta: -1,
    });
    if (deltaErr) throw new Error(`Failed to decrement owned: ${deltaErr.message}`);
  }

  const { error } = await supabase
    .from("packs_opened")
    .delete()
    .eq("user_id", userId)
    .eq("id", packId);
  if (error) throw new Error(`Failed to delete pack: ${error.message}`);

  // Resync acquired_at for the cards this pack used to feed. If they're
  // still owned via another pack the date may shift later; if they were
  // removed by the apply_delta above the row is gone and the RPC just
  // skips it.
  if (cardIds.length > 0) {
    const { error: resyncErr } = await supabase.rpc(
      "owned_cards_resync_acquired_at",
      { _user_id: userId, _card_ids: cardIds },
    );
    if (resyncErr) throw new Error(`Failed to resync acquired_at: ${resyncErr.message}`);
  }
  // The pack_purchase row (if any) is removed via the FK cascade on
  // transactions.pack_id, so no explicit ledger delete is needed.
  revalidatePath("/packs");
  revalidatePath("/transactions");
  revalidatePath("/portfolio");
}
