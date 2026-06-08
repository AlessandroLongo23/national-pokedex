import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "group-singles-e2e@example.com";

test.use({ viewport: { width: 1280, height: 900 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}
async function getUserId(): Promise<string | null> {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === TEST_EMAIL)?.id ?? null;
}
async function signIn(context: BrowserContext) {
  const { data: link, error: le } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (le) throw le;
  const otp = link.properties!.email_otp!;
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
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

const CARD_A = "sv1-1";
const CARD_B = "sv1-2";

async function reset(userId: string) {
  await admin().from("card_lots").delete().eq("user_id", userId);
  await admin().from("transactions").delete().eq("user_id", userId);
  await admin().from("owned_cards").delete().eq("user_id", userId);
}

// Seed two EUR single_purchase rows + matching owned_cards (qty 1 each).
async function seedSingles(userId: string) {
  await admin()
    .from("transactions")
    .insert([
      { user_id: userId, kind: "single_purchase", card_id: CARD_A, quantity: 1, amount_cents: -500, currency: "EUR", rate_to_eur: 1, occurred_at: "2026-06-01T10:00:00.000Z" },
      { user_id: userId, kind: "single_purchase", card_id: CARD_B, quantity: 1, amount_cents: -300, currency: "EUR", rate_to_eur: 1, occurred_at: "2026-06-02T10:00:00.000Z" },
    ]);
  await admin()
    .from("owned_cards")
    .insert([
      { user_id: userId, card_id: CARD_A, quantity: 1, acquired_at: "2026-06-01T10:00:00.000Z" },
      { user_id: userId, card_id: CARD_B, quantity: 1, acquired_at: "2026-06-02T10:00:00.000Z" },
    ]);
}

test("group two singles into a bulk lot", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context);
  const userId = await getUserId();
  expect(userId).not.toBeNull();
  await reset(userId!);
  await seedSingles(userId!);

  await page.goto("/transactions");
  // Select the two single rows, then group.
  const checkboxes = page.getByRole("checkbox", { name: "Select transaction" });
  await expect(checkboxes.first()).toBeVisible({ timeout: 20_000 });
  const count = await checkboxes.count();
  expect(count).toBe(2);
  for (let i = 0; i < count; i++) await checkboxes.nth(i).check();

  await page.getByRole("button", { name: "Group into bulk lot" }).click();
  await expect(page).toHaveURL(/\/transactions\/lots\/new\?fromSingles=/);

  // Editor pre-filled: grouping banner + suggested total 8.00 EUR.
  await expect(page.getByText(/Grouping 2 single purchases/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Paid €8.00")).toBeVisible();

  await page.getByRole("button", { name: /Save lot/ }).click();
  await expect(page).toHaveURL(/lotLogged=/);

  // Exactly one lot (cost 800), two content rows, the singles gone, ownership unchanged.
  const { data: lots } = await admin().from("card_lots").select("id, cost_cents").eq("user_id", userId!);
  expect(lots?.length).toBe(1);
  expect(lots?.[0]?.cost_cents).toBe(800);

  const { data: contents } = await admin().from("lot_contents").select("card_id, quantity").eq("lot_id", lots![0]!.id);
  expect(contents?.length).toBe(2);

  const { data: singlesAfter } = await admin().from("transactions").select("id").eq("user_id", userId!).eq("kind", "single_purchase");
  expect(singlesAfter?.length).toBe(0);

  const { data: lotTxn } = await admin().from("transactions").select("amount_cents").eq("user_id", userId!).eq("kind", "lot_purchase");
  expect(lotTxn?.length).toBe(1);
  expect(lotTxn?.[0]?.amount_cents).toBe(-800);

  const { data: owned } = await admin().from("owned_cards").select("card_id, quantity").eq("user_id", userId!);
  expect(owned?.length).toBe(2);
  for (const o of owned ?? []) expect(o.quantity).toBe(1);

  await reset(userId!);
});
