"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "./current-user";

const nameSchema = z.string().trim().min(1).max(80);
const binderIdSchema = z.string().uuid();
const cardIdSchema = z.string().min(1).max(64);
const bulkCardIdsSchema = z.array(cardIdSchema).max(2048);

const scopeInputSchema = z
  .discriminatedUnion("scopeType", [
    z.object({ scopeType: z.literal("master_set"), setId: z.string().min(1).max(32) }),
    z.object({ scopeType: z.literal("pokemon"), dex: z.number().int().min(1).max(1025) }),
    z.object({ scopeType: z.literal("artist"), artist: z.string().min(1).max(120) }),
    z.object({ scopeType: z.literal("type"), type: z.string().min(1).max(20) }),
    z.object({ scopeType: z.literal("position"), number: z.string().min(1).max(16) }),
    z.object({ scopeType: z.literal("custom") }),
    z.object({
      scopeType: z.literal("pokedex"),
      dexFrom: z.number().int().min(1).max(1025),
      dexTo: z.number().int().min(1).max(1025),
    }),
  ])
  .superRefine((val, ctx) => {
    if (val.scopeType === "pokedex" && val.dexFrom > val.dexTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dexFrom must be ≤ dexTo",
      });
    }
  });

export type CreateBinderInput = z.infer<typeof scopeInputSchema> & { name: string };

export async function createBinder(input: CreateBinderInput): Promise<{ id: string }> {
  const name = nameSchema.parse(input.name);
  const parsed = scopeInputSchema.parse(input);
  const { scopeType, ...params } = parsed;

  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("binders")
    .insert({
      user_id: userId,
      name,
      scope_type: scopeType,
      scope_params: params,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create binder: ${error.message}`);

  revalidatePath("/binders");
  return { id: data.id as string };
}

export async function renameBinder(binderId: string, name: string): Promise<void> {
  const id = binderIdSchema.parse(binderId);
  const newName = nameSchema.parse(name);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("binders")
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to rename binder: ${error.message}`);
  revalidatePath("/binders");
  revalidatePath(`/binders/${id}`);
}

export async function deleteBinder(binderId: string): Promise<void> {
  const id = binderIdSchema.parse(binderId);
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("binders")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to delete binder: ${error.message}`);
  revalidatePath("/binders");
}

async function assertCustomBinderOwner(binderId: string): Promise<void> {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("binders")
    .select("scope_type")
    .eq("id", binderId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Binder not found");
  if (data.scope_type !== "custom") {
    throw new Error("Only custom binders accept manual cards");
  }
}

export async function addCardToCustomBinder(
  binderId: string,
  cardId: string,
): Promise<void> {
  const id = binderIdSchema.parse(binderId);
  const cid = cardIdSchema.parse(cardId);
  await assertCustomBinderOwner(id);

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("binder_cards")
    .upsert(
      { binder_id: id, card_id: cid },
      { onConflict: "binder_id,card_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
  revalidatePath(`/binders/${id}`);
}

export async function removeCardFromCustomBinder(
  binderId: string,
  cardId: string,
): Promise<void> {
  const id = binderIdSchema.parse(binderId);
  const cid = cardIdSchema.parse(cardId);
  await assertCustomBinderOwner(id);

  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("binder_cards")
    .delete()
    .eq("binder_id", id)
    .eq("card_id", cid);
  if (error) throw new Error(error.message);
  revalidatePath(`/binders/${id}`);
}

export async function bulkSetCustomBinderCards(
  binderId: string,
  cardIds: string[],
  present: boolean,
): Promise<{ changed: number }> {
  const id = binderIdSchema.parse(binderId);
  const ids = [...new Set(bulkCardIdsSchema.parse(cardIds))];
  if (ids.length === 0) return { changed: 0 };
  await assertCustomBinderOwner(id);

  const supabase = await getSupabaseServer();
  if (present) {
    const rows = ids.map((card_id) => ({ binder_id: id, card_id }));
    const { error } = await supabase
      .from("binder_cards")
      .upsert(rows, { onConflict: "binder_id,card_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("binder_cards")
      .delete()
      .eq("binder_id", id)
      .in("card_id", ids);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/binders/${id}`);
  return { changed: ids.length };
}
