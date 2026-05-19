"use server";

import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "./current-user";

const cardIdSchema = z.string().min(1).max(64);

export async function toggleOwnedCard(
  cardId: string,
): Promise<{ owned: boolean; quantity: number }> {
  const id = cardIdSchema.parse(cardId);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: existing } = await supabase
    .from("owned_cards")
    .select("card_id")
    .eq("user_id", userId)
    .eq("card_id", id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("owned_cards")
      .delete()
      .eq("user_id", userId)
      .eq("card_id", id);
    if (error) throw new Error(error.message);
    return { owned: false, quantity: 0 };
  }

  const { error } = await supabase
    .from("owned_cards")
    .insert({ user_id: userId, card_id: id, quantity: 1 });
  if (error) throw new Error(error.message);
  return { owned: true, quantity: 1 };
}

const adjustSchema = z.object({
  cardId: cardIdSchema,
  delta: z.number().int().min(-99).max(99),
});

export async function adjustOwnedQuantity(
  cardId: string,
  delta: number,
): Promise<{ quantity: number }> {
  const { cardId: id, delta: d } = adjustSchema.parse({ cardId, delta });
  if (d === 0) {
    const userId = await requireUserId();
    const supabase = await getSupabaseServer();
    const { data } = await supabase
      .from("owned_cards")
      .select("quantity")
      .eq("user_id", userId)
      .eq("card_id", id)
      .maybeSingle();
    return { quantity: (data?.quantity as number | undefined) ?? 0 };
  }

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("owned_cards_apply_delta", {
    _user_id: userId,
    _card_ids: [id],
    _delta: d,
  });
  if (error) throw new Error(error.message);
  const row = (data as { card_id: string; quantity: number }[] | null)?.[0];
  return { quantity: row?.quantity ?? 0 };
}

const setQtySchema = z.object({
  cardId: cardIdSchema,
  quantity: z.number().int().min(0).max(999),
});

export async function setOwnedQuantity(
  cardId: string,
  quantity: number,
): Promise<{ quantity: number }> {
  const { cardId: id, quantity: qty } = setQtySchema.parse({ cardId, quantity });
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase.rpc("owned_cards_set_quantity", {
    _user_id: userId,
    _card_id: id,
    _qty: qty,
  });
  if (error) throw new Error(error.message);
  return { quantity: (data as number | null) ?? 0 };
}

export async function toggleWishlistCard(cardId: string): Promise<{ wishlisted: boolean }> {
  const id = cardIdSchema.parse(cardId);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: existing } = await supabase
    .from("wishlist_cards")
    .select("card_id")
    .eq("user_id", userId)
    .eq("card_id", id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("wishlist_cards")
      .delete()
      .eq("user_id", userId)
      .eq("card_id", id);
    if (error) throw new Error(error.message);
    return { wishlisted: false };
  }

  const { error } = await supabase
    .from("wishlist_cards")
    .insert({ user_id: userId, card_id: id });
  if (error) throw new Error(error.message);
  return { wishlisted: true };
}

const bulkSchema = z.array(cardIdSchema).max(2048);

export async function bulkSetOwned(cardIds: string[], owned: boolean): Promise<{ changed: number }> {
  const ids = [...new Set(bulkSchema.parse(cardIds))];
  if (ids.length === 0) return { changed: 0 };
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  if (owned) {
    const rows = ids.map((card_id) => ({ user_id: userId, card_id, quantity: 1 }));
    const { error } = await supabase
      .from("owned_cards")
      .upsert(rows, { onConflict: "user_id,card_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { changed: ids.length };
  }

  const { error } = await supabase
    .from("owned_cards")
    .delete()
    .eq("user_id", userId)
    .in("card_id", ids);
  if (error) throw new Error(error.message);
  return { changed: ids.length };
}

export async function bulkSetWishlist(
  cardIds: string[],
  wishlisted: boolean,
): Promise<{ changed: number }> {
  const ids = [...new Set(bulkSchema.parse(cardIds))];
  if (ids.length === 0) return { changed: 0 };
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  if (wishlisted) {
    const rows = ids.map((card_id) => ({ user_id: userId, card_id }));
    const { error } = await supabase
      .from("wishlist_cards")
      .upsert(rows, { onConflict: "user_id,card_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { changed: ids.length };
  }

  const { error } = await supabase
    .from("wishlist_cards")
    .delete()
    .eq("user_id", userId)
    .in("card_id", ids);
  if (error) throw new Error(error.message);
  return { changed: ids.length };
}
