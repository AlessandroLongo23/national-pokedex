import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "unpriced-e2e@example.com";

test.use({ viewport: { width: 1280, height: 900 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function getUserId(): Promise<string | null> {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === TEST_EMAIL)?.id ?? null;
}

// Same auth helper as bulk-lot.spec.ts: mint a real session via the email
// OTP and inject the @supabase/ssr-encoded cookies.
async function signIn(context: BrowserContext) {
  const { data: link, error: le } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (le) throw le;
  const otp = link.properties!.email_otp!;

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: verified, error: ve } = await anon.auth.verifyOtp({
    email: TEST_EMAIL,
    token: otp,
    type: "email",
  });
  if (ve) throw ve;
  const session = verified.session!;

  const captured: { name: string; value: string }[] = [];
  const ssr = createServerClient(SUPABASE_URL, ANON_KEY, {
    cookies: {
      getAll: () => [],
      setAll: (items) => {
        for (const it of items) captured.push({ name: it.name, value: it.value });
      },
    },
  });
  await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  await context.addCookies(
    captured.map((c) => ({
      name: c.name,
      value: c.value,
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
  );
}

async function resetUser(userId: string) {
  await admin().from("packs_opened").delete().eq("user_id", userId);
  await admin().from("card_lots").delete().eq("user_id", userId);
  await admin().from("owned_cards").delete().eq("user_id", userId);
}

// A pack opened without a cost writes no pack_purchase transaction, so
// before the unpriced-row work it was invisible on /transactions. It must
// now render inline with an "Add price" link to the pack editor.
test("a pack logged without a price still shows on the ledger", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await signIn(context);
  const userId = await getUserId();
  expect(userId).not.toBeNull();
  await resetUser(userId!);

  const { data: pack, error } = await admin()
    .from("packs_opened")
    .insert({
      user_id: userId!,
      set_id: "sv3",
      opened_at: "2026-07-20T10:00:00Z",
      cost_cents: null,
      currency: null,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  const packId = pack!.id as string;

  // Sanity-check the premise: no transaction row backs this pack.
  const { data: txns } = await admin()
    .from("transactions")
    .select("id")
    .eq("pack_id", packId);
  expect(txns?.length ?? 0).toBe(0);

  await page.goto("/transactions");

  const addPrice = page.getByRole("button", { name: "Add price" }).first();
  await expect(addPrice).toBeVisible({ timeout: 60_000 });

  // The badge opens an inline modal; it must not navigate away.
  await addPrice.click();
  const dialog = page.getByRole("dialog", { name: "Add price" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/transactions$/);

  await dialog.getByRole("textbox", { name: "Price paid" }).fill("42.50");
  await dialog.getByRole("button", { name: "Save price" }).click();

  // Modal closes and the row becomes a real, priced ledger entry.
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/transactions$/);

  await expect
    .poll(
      async () => {
        const { data } = await admin()
          .from("transactions")
          .select("amount_cents, currency, kind")
          .eq("pack_id", packId);
        return data?.[0] ?? null;
      },
      { timeout: 20_000 },
    )
    .toMatchObject({ kind: "pack_purchase", amount_cents: -4250 });

  // The pack itself carries the cost and an FX snapshot for its own date.
  const { data: priced } = await admin()
    .from("packs_opened")
    .select("cost_cents, currency, rate_to_eur")
    .eq("id", packId)
    .single();
  expect(priced?.cost_cents).toBe(4250);
  expect(priced?.rate_to_eur).not.toBeNull();

  // And the synthetic "Add price" affordance is gone from the ledger.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Add price" }),
  ).toHaveCount(0, { timeout: 60_000 });

  await resetUser(userId!);
});
