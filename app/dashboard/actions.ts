"use server";

import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function toggleOwned(dexNumber: number): Promise<{ owned: boolean }> {
  if (!Number.isInteger(dexNumber) || dexNumber < 1 || dexNumber > 1025) {
    throw new Error(`Invalid dex number: ${dexNumber}`);
  }
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: existing } = await supabase
    .from("owned_pokemon")
    .select("dex_number")
    .eq("user_id", user.id)
    .eq("dex_number", dexNumber)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("owned_pokemon")
      .delete()
      .eq("user_id", user.id)
      .eq("dex_number", dexNumber);
    if (error) throw new Error(error.message);
    return { owned: false };
  }

  const { error } = await supabase
    .from("owned_pokemon")
    .insert({ user_id: user.id, dex_number: dexNumber });
  if (error) throw new Error(error.message);
  return { owned: true };
}

const bulkSchema = z.array(z.number().int().min(1).max(1025));

export async function bulkImportOwned(dexNumbers: number[]): Promise<{ imported: number }> {
  const parsed = bulkSchema.parse(dexNumbers);
  const deduped = [...new Set(parsed)];
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  if (deduped.length === 0) return { imported: 0 };

  const rows = deduped.map((dex_number) => ({ user_id: user.id, dex_number }));
  const { error } = await supabase
    .from("owned_pokemon")
    .upsert(rows, { onConflict: "user_id,dex_number" });
  if (error) throw new Error(error.message);
  return { imported: deduped.length };
}
