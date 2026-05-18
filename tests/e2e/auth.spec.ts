import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "e2e@example.com";

async function getMagicLink(): Promise<string> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (error) throw error;
  return data.properties!.action_link;
}

test.describe("auth", () => {
  test("unauthed visit to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("link", { name: /go to dashboard/i })).toBeVisible();
  });

  test("magic link signs the user in and lands on /dashboard", async ({ page }) => {
    const link = await getMagicLink();
    await page.goto(link);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("signed-in user visiting /login is redirected to /dashboard", async ({ page }) => {
    const link = await getMagicLink();
    await page.goto(link);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("sign-out clears the session and returns to /login", async ({ page }) => {
    const link = await getMagicLink();
    await page.goto(link);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole("button", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login$/);

    // Confirm the session was actually cleared — re-visiting /dashboard bounces back.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
