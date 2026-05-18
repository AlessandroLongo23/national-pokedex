import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "binders-e2e@example.com";

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function getUserId(): Promise<string | null> {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === TEST_EMAIL)?.id ?? null;
}

async function signIn(page: Page) {
  const { data, error } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (error) throw error;
  await page.goto(data.properties!.action_link);
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function resetUserData() {
  const userId = await getUserId();
  if (!userId) return;
  const a = admin();
  await a.from("binders").delete().eq("user_id", userId);
  await a.from("owned_cards").delete().eq("user_id", userId);
}

test("create a master-set binder and own a card to advance progress", async ({ page }) => {
  await resetUserData();
  await signIn(page);

  await page.goto("/binders");
  await expect(page.getByRole("heading", { name: "Binders" })).toBeVisible();
  // Empty state CTA.
  await page.getByRole("link", { name: /create your first binder/i }).click();
  await expect(page).toHaveURL(/\/binders\/new$/);

  // master_set is the default selection. Pick a small SV set.
  await page.getByLabel("Set").selectOption("sv1");
  await expect(page.getByRole("button", { name: /create binder/i })).toBeEnabled();
  await page.getByRole("button", { name: /create binder/i }).click();

  await expect(page).toHaveURL(/\/binders\/[0-9a-f-]+$/);
  const tiles = page.locator("[data-card-id]");
  await expect.poll(async () => await tiles.count(), { timeout: 10_000 }).toBeGreaterThan(50);

  // Progress starts at 0 / N.
  await expect(page.getByText(/\b0\b\s*\/\s*\d+/).first()).toBeVisible();

  // Toggle ownership on the first tile.
  const firstOwnedBtn = tiles.first().getByRole("button", { name: /mark .* as owned/i });
  await firstOwnedBtn.click();

  // After the optimistic toggle, progress should read 1 / N.
  await expect(page.getByText(/\b1\b\s*\/\s*\d+/).first()).toBeVisible();
});

test.afterAll(async () => {
  await resetUserData();
});
