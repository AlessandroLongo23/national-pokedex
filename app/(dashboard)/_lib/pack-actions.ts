"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { DEV_USER_ID } from "./dev";

const logPackSchema = z.object({
  setId: z.string().min(1).max(32),
  cardIds: z.array(z.string().min(1).max(64)).max(64),
});

export async function logPack(
  setId: string,
  cardIds: string[],
): Promise<{ packId: string; newCards: number }> {
  const { setId: sid, cardIds: ids } = logPackSchema.parse({ setId, cardIds });
  const deduped = [...new Set(ids)];
  const supabase = await getSupabaseServer();

  // Snapshot ownership before any writes so we can report new acquisitions.
  let newCards = 0;
  if (deduped.length > 0) {
    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", DEV_USER_ID)
      .in("card_id", deduped);
    const alreadyOwned = new Set((existingOwned ?? []).map((r) => r.card_id as string));
    newCards = deduped.filter((c) => !alreadyOwned.has(c)).length;
  }

  const { data: pack, error: packErr } = await supabase
    .from("packs_opened")
    .insert({ user_id: DEV_USER_ID, set_id: sid })
    .select("id")
    .single();
  if (packErr) throw new Error(`Failed to log pack: ${packErr.message}`);

  if (deduped.length > 0) {
    const contents = deduped.map((card_id) => ({ pack_id: pack.id, card_id }));
    const { error: contentsErr } = await supabase.from("pack_contents").insert(contents);
    if (contentsErr) throw new Error(`Failed to write pack contents: ${contentsErr.message}`);

    const ownedRows = deduped.map((card_id) => ({ user_id: DEV_USER_ID, card_id }));
    const { error: ownedErr } = await supabase
      .from("owned_cards")
      .upsert(ownedRows, { onConflict: "user_id,card_id", ignoreDuplicates: true });
    if (ownedErr) throw new Error(`Failed to mark owned: ${ownedErr.message}`);
  }

  revalidatePath("/packs");
  return { packId: pack.id as string, newCards };
}

const updatePackSchema = z.object({
  packId: z.string().uuid(),
  cardIds: z.array(z.string().min(1).max(64)).max(64),
  openedAt: z.string().datetime().optional(),
});

export async function updatePack(
  packId: string,
  cardIds: string[],
  openedAt?: string,
): Promise<{ newCards: number }> {
  const {
    packId: pid,
    cardIds: ids,
    openedAt: when,
  } = updatePackSchema.parse({ packId, cardIds, openedAt });
  const deduped = [...new Set(ids)];
  const supabase = await getSupabaseServer();

  const { data: pack, error: lookupErr } = await supabase
    .from("packs_opened")
    .select("id")
    .eq("id", pid)
    .eq("user_id", DEV_USER_ID)
    .maybeSingle();
  if (lookupErr) throw new Error(lookupErr.message);
  if (!pack) throw new Error("Pack not found");

  if (when) {
    const { error: dateErr } = await supabase
      .from("packs_opened")
      .update({ opened_at: when })
      .eq("id", pid)
      .eq("user_id", DEV_USER_ID);
    if (dateErr) throw new Error(dateErr.message);
  }

  // Replace pack_contents wholesale: delete the old set, insert the new set.
  // Owned-cards rows are NOT removed for cards dropped from the pack — the
  // user may have acquired them elsewhere; un-owning is a separate action.
  const { error: delErr } = await supabase.from("pack_contents").delete().eq("pack_id", pid);
  if (delErr) throw new Error(delErr.message);

  let newCards = 0;
  if (deduped.length > 0) {
    const rows = deduped.map((card_id) => ({ pack_id: pid, card_id }));
    const { error: insErr } = await supabase.from("pack_contents").insert(rows);
    if (insErr) throw new Error(insErr.message);

    const { data: existingOwned } = await supabase
      .from("owned_cards")
      .select("card_id")
      .eq("user_id", DEV_USER_ID)
      .in("card_id", deduped);
    const alreadyOwned = new Set((existingOwned ?? []).map((r) => r.card_id as string));
    newCards = deduped.filter((c) => !alreadyOwned.has(c)).length;

    const ownedRows = deduped.map((card_id) => ({ user_id: DEV_USER_ID, card_id }));
    const { error: ownedErr } = await supabase
      .from("owned_cards")
      .upsert(ownedRows, { onConflict: "user_id,card_id", ignoreDuplicates: true });
    if (ownedErr) throw new Error(ownedErr.message);
  }

  revalidatePath("/packs");
  return { newCards };
}

export async function deletePack(packId: string): Promise<void> {
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("packs_opened")
    .delete()
    .eq("user_id", DEV_USER_ID)
    .eq("id", packId);
  if (error) throw new Error(`Failed to delete pack: ${error.message}`);
  revalidatePath("/packs");
}
