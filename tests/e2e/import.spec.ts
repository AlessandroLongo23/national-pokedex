import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "import-e2e@example.com";

async function signIn(page: Page) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (error) throw error;
  await page.goto(data.properties!.action_link);
}

async function resetOwned() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: users } = await admin.auth.admin.listUsers();
  const me = users.users.find((u) => u.email === TEST_EMAIL);
  if (me) await admin.from("owned_pokemon").delete().eq("user_id", me.id);
}

test("bulk import marks pasted dex numbers as owned", async ({ page }) => {
  await resetOwned();
  await signIn(page);

  await page.goto("/dashboard/import");
  await page.getByPlaceholder("[1, 4, 7, 25, ...]").fill("[1, 4, 7]");
  await page.getByRole("button", { name: /import/i }).click();

  await expect(page).toHaveURL(/\/dashboard\?imported=3/);

  for (const dex of [1, 4, 7]) {
    await expect(page.locator(`[data-dex="${dex}"]`)).toHaveClass(/bg-owned/);
  }
});
