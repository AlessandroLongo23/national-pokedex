import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "lots-e2e@example.com";

test.use({ viewport: { width: 1280, height: 900 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function getUserId(): Promise<string | null> {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === TEST_EMAIL)?.id ?? null;
}

// Mirror of the working auth helper in binder-modal.spec.ts: admin magic
// links use the implicit grant (tokens in the URL hash) which this app
// never persists to cookies outside the real login UI. Mint a real
// session via the email OTP and inject the @supabase/ssr-encoded cookies.
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
  // card_lots cascade lot_contents and the lot_purchase transaction rows.
  await admin().from("card_lots").delete().eq("user_id", userId);
  await admin().from("owned_cards").delete().eq("user_id", userId);
}

test("log a bulk lot with a quantity and a price, then delete it", async ({
  page,
  context,
}) => {
  await signIn(context);
  const userId = await getUserId();
  expect(userId).not.toBeNull();
  await resetUser(userId!);

  // Start a bulk lot from Transactions.
  await page.goto("/transactions");
  await page.getByRole("link", { name: "Log a bulk lot" }).click();
  await expect(page).toHaveURL(/\/transactions\/lots\/new/);

  // Search and add a card via the grid.
  await page.getByPlaceholder("Search by card name").fill("Charizard");
  const firstTile = page.locator("[data-card-id]").first();
  await expect(firstTile).toBeVisible();
  const cardId = await firstTile.getAttribute("data-card-id");
  expect(cardId).toBeTruthy();
  // Click the tile image (the "Toggle …" button) to add quantity 1.
  await firstTile.getByRole("button", { name: /^Toggle / }).click();
  // Bump to quantity 2 via the in-tile stepper.
  await firstTile.getByRole("button", { name: /Increase .* quantity/ }).click();

  // Add a price.
  await page.getByRole("button", { name: "Add price" }).click();
  await page.getByLabel("Price paid").fill("40.00");
  await page.getByRole("button", { name: "Done" }).click();

  // Save.
  await page.getByRole("button", { name: /Save lot/ }).click();
  await expect(page).toHaveURL(/\/transactions/);

  // The ledger shows a "Bulk lot" row.
  await expect(page.getByText(/Bulk lot/).first()).toBeVisible();

  // Verify in the database: one lot, one content row with quantity 2, the
  // card owned with quantity 2, and a lot_purchase transaction of -4000.
  const { data: lots } = await admin()
    .from("card_lots")
    .select("id, cost_cents")
    .eq("user_id", userId!);
  expect(lots?.length).toBe(1);
  expect(lots?.[0]?.cost_cents).toBe(4000);

  const { data: contents } = await admin()
    .from("lot_contents")
    .select("card_id, quantity")
    .eq("lot_id", lots![0]!.id);
  expect(contents?.length).toBe(1);
  expect(contents?.[0]?.quantity).toBe(2);
  expect(contents?.[0]?.card_id).toBe(cardId);

  const { data: owned } = await admin()
    .from("owned_cards")
    .select("quantity")
    .eq("user_id", userId!)
    .eq("card_id", cardId!)
    .maybeSingle();
  expect(owned?.quantity).toBe(2);

  const { data: txns } = await admin()
    .from("transactions")
    .select("amount_cents, kind")
    .eq("user_id", userId!)
    .eq("kind", "lot_purchase");
  expect(txns?.length).toBe(1);
  expect(txns?.[0]?.amount_cents).toBe(-4000);

  // Open the editor via the row link, clear the lot, and delete it.
  await page.getByRole("link", { name: /Bulk lot/ }).first().click();
  await expect(page).toHaveURL(/\/transactions\/lots\/.*\/edit/);
  for (const btn of await page.getByRole("button", { name: /^Remove / }).all()) {
    await btn.click();
  }
  await page.getByRole("button", { name: "Delete this lot" }).click();
  await page.getByRole("button", { name: "Yes, delete lot" }).click();
  await expect(page).toHaveURL(/\/transactions/);

  // The lot and its owned copies are gone.
  const { data: lotsAfter } = await admin()
    .from("card_lots")
    .select("id")
    .eq("user_id", userId!);
  expect(lotsAfter?.length).toBe(0);
  const { data: ownedAfter } = await admin()
    .from("owned_cards")
    .select("quantity")
    .eq("user_id", userId!)
    .eq("card_id", cardId!)
    .maybeSingle();
  expect(ownedAfter).toBeNull();

  await resetUser(userId!);
});
