import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "zeroqty-e2e@example.com";
const CARD = "swsh9tg-TG07";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

// These RPCs read auth.uid(), so they have to be called over an actual
// user session rather than the service role.
async function userClient(): Promise<{ db: SupabaseClient; userId: string }> {
  const { data: link, error } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (error) throw error;
  const db = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: v, error: ve } = await db.auth.verifyOtp({
    email: TEST_EMAIL,
    token: link.properties!.email_otp!,
    type: "email",
  });
  if (ve) throw ve;
  return { db, userId: v.user!.id };
}

async function reset(userId: string) {
  await admin().from("transactions").delete().eq("user_id", userId);
  await admin().from("owned_cards").delete().eq("user_id", userId);
}

async function ownedQty(userId: string): Promise<number | null> {
  const { data } = await admin()
    .from("owned_cards")
    .select("quantity")
    .eq("user_id", userId)
    .eq("card_id", CARD)
    .maybeSingle();
  return (data?.quantity as number | undefined) ?? null;
}

// owned_cards_quantity_check is `quantity > 0`. Every one of these paths
// drives the owned quantity to exactly zero, which used to raise
// "violates check constraint owned_cards_quantity_check" because the RPC
// did UPDATE-then-DELETE. The row should simply disappear instead.
test.describe("singles RPCs can drive owned quantity to zero", () => {
  test("deleting the purchase of your only copy", async () => {
    const { db, userId } = await userClient();
    await reset(userId);

    const { data: txnId, error: logErr } = await db.rpc("log_single_purchase", {
      _card_id: CARD,
      _quantity: 1,
      _total_cost_cents: 5000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });
    expect(logErr).toBeNull();
    expect(await ownedQty(userId)).toBe(1);

    const { error } = await db.rpc("delete_single_purchase", { _txn_id: txnId });
    expect(error).toBeNull();
    expect(await ownedQty(userId)).toBeNull();

    await reset(userId);
  });

  test("editing a purchase down to a net of zero", async () => {
    const { db, userId } = await userClient();
    await reset(userId);

    const { data: txnId } = await db.rpc("log_single_purchase", {
      _card_id: CARD,
      _quantity: 3,
      _total_cost_cents: 9000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });
    expect(await ownedQty(userId)).toBe(3);

    // Drop 3 -> 1 (owned 3 -> 1), then 1 -> ... the second edit is the
    // one that would zero it, so do it in one step from a state where
    // owned equals the purchase quantity.
    const { error } = await db.rpc("edit_single_purchase", {
      _txn_id: txnId,
      _quantity: 1,
      _total_cost_cents: 3000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });
    expect(error).toBeNull();
    expect(await ownedQty(userId)).toBe(1);

    const { error: delErr } = await db.rpc("delete_single_purchase", {
      _txn_id: txnId,
    });
    expect(delErr).toBeNull();
    expect(await ownedQty(userId)).toBeNull();

    await reset(userId);
  });

  test("selling your last copy", async () => {
    const { db, userId } = await userClient();
    await reset(userId);

    await db.rpc("log_single_purchase", {
      _card_id: CARD,
      _quantity: 1,
      _total_cost_cents: 5000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });
    expect(await ownedQty(userId)).toBe(1);

    const { error } = await db.rpc("log_single_sale", {
      _card_id: CARD,
      _quantity: 1,
      _total_proceeds_cents: 7000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T17:00:00Z",
    });
    expect(error).toBeNull();
    expect(await ownedQty(userId)).toBeNull();

    await reset(userId);
  });

  test("growing a sale to cover every remaining copy", async () => {
    const { db, userId } = await userClient();
    await reset(userId);

    await db.rpc("log_single_purchase", {
      _card_id: CARD,
      _quantity: 2,
      _total_cost_cents: 10000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });
    const { data: saleId } = await db.rpc("log_single_sale", {
      _card_id: CARD,
      _quantity: 1,
      _total_proceeds_cents: 7000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T17:00:00Z",
    });
    expect(await ownedQty(userId)).toBe(1);

    // Sale 1 -> 2 consumes the last owned copy exactly.
    const { error } = await db.rpc("edit_single_sale", {
      _txn_id: saleId,
      _quantity: 2,
      _total_proceeds_cents: 14000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T17:00:00Z",
    });
    expect(error).toBeNull();
    expect(await ownedQty(userId)).toBeNull();

    await reset(userId);
  });

  test("still refuses to oversell", async () => {
    const { db, userId } = await userClient();
    await reset(userId);

    await db.rpc("log_single_purchase", {
      _card_id: CARD,
      _quantity: 1,
      _total_cost_cents: 5000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });

    const { error } = await db.rpc("log_single_sale", {
      _card_id: CARD,
      _quantity: 2,
      _total_proceeds_cents: 14000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T17:00:00Z",
    });
    expect(error?.message ?? "").toContain("not enough copies");
    expect(await ownedQty(userId)).toBe(1);

    await reset(userId);
  });

  test("a partial decrement still just decrements", async () => {
    const { db, userId } = await userClient();
    await reset(userId);

    const { data: txnId } = await db.rpc("log_single_purchase", {
      _card_id: CARD,
      _quantity: 3,
      _total_cost_cents: 9000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });
    const { error } = await db.rpc("edit_single_purchase", {
      _txn_id: txnId,
      _quantity: 2,
      _total_cost_cents: 6000,
      _currency: "DKK",
      _occurred_at: "2026-07-24T16:03:00Z",
    });
    expect(error).toBeNull();
    expect(await ownedQty(userId)).toBe(2);

    await reset(userId);
  });
});
