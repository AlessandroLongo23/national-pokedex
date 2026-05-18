"use server";

import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "./current-user";

const cardIdSchema = z.string().min(1).max(64);

export async function toggleFavoriteCard(cardId: string): Promise<{ favorited: boolean }> {
  const id = cardIdSchema.parse(cardId);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: existing } = await supabase
    .from("user_favorites")
    .select("card_id")
    .eq("user_id", userId)
    .eq("card_id", id)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("user_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("card_id", id);
    if (error) throw new Error(error.message);
    return { favorited: false };
  }

  const { error } = await supabase
    .from("user_favorites")
    .insert({ user_id: userId, card_id: id });
  if (error) throw new Error(error.message);
  return { favorited: true };
}

const bulkSchema = z.array(cardIdSchema).max(2048);

export async function bulkSetFavorites(
  cardIds: string[],
  favorited: boolean,
): Promise<{ changed: number }> {
  const ids = [...new Set(bulkSchema.parse(cardIds))];
  if (ids.length === 0) return { changed: 0 };
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  if (favorited) {
    const rows = ids.map((card_id) => ({ user_id: userId, card_id }));
    const { error } = await supabase
      .from("user_favorites")
      .upsert(rows, { onConflict: "user_id,card_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { changed: ids.length };
  }

  const { error } = await supabase
    .from("user_favorites")
    .delete()
    .eq("user_id", userId)
    .in("card_id", ids);
  if (error) throw new Error(error.message);
  return { changed: ids.length };
}
