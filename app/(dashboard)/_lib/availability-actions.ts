"use server";

import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "./current-user";

const schema = z.object({
  setId: z.string().min(1).max(32),
  available: z.boolean().nullable(),
});

// `available = null` resets to the release-date heuristic by deleting the
// explicit override row.
export async function setSetAvailability(
  setId: string,
  available: boolean | null,
): Promise<void> {
  const parsed = schema.parse({ setId, available });
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  if (parsed.available === null) {
    const { error } = await supabase
      .from("set_availability")
      .delete()
      .eq("user_id", userId)
      .eq("set_id", parsed.setId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from("set_availability")
    .upsert(
      { user_id: userId, set_id: parsed.setId, available: parsed.available },
      { onConflict: "user_id,set_id" },
    );
  if (error) throw new Error(error.message);
}
