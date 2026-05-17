import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "toggle-e2e@example.com";

async function signIn(page: Page) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (error) throw error;
  await page.goto(data.properties!.action_link);
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function resetOwned() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: users } = await admin.auth.admin.listUsers();
  const me = users.users.find((u) => u.email === TEST_EMAIL);
  if (me) await admin.from("owned_pokemon").delete().eq("user_id", me.id);
}

test("clicking a cell persists owned state across reload", async ({ page }) => {
  await resetOwned();
  await signIn(page);

  const bulbasaur = page.locator('[data-dex="1"]');
  await bulbasaur.click();
  await expect(bulbasaur).toHaveClass(/bg-owned/);

  await page.reload();
  await expect(page.locator('[data-dex="1"]')).toHaveClass(/bg-owned/);
});
