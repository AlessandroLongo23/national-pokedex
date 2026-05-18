"use server";

import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "./current-user";

const cardIdSchema = z.string().min(1).max(64);

export async function toggleOwnedCard(cardId: string): Promise<{ owned: boolean }> {
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
    return { owned: false };
  }

  const { error } = await supabase
    .from("owned_cards")
    .insert({ user_id: userId, card_id: id });
  if (error) throw new Error(error.message);
  return { owned: true };
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
    const rows = ids.map((card_id) => ({ user_id: userId, card_id }));
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
