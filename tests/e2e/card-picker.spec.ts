import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "picker-e2e@example.com";

test.use({ viewport: { width: 1280, height: 900 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

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

// The single-purchase picker used to show at most 20 results for any
// query, drawn from a partial scan of the catalogue. It must now list
// every match and say how many there are.
test("the single-purchase picker lists every match", async ({ page, context }) => {
  test.setTimeout(120_000);
  await signIn(context);

  await page.goto("/transactions");
  await page.getByRole("button", { name: "Log a singles purchase" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const search = dialog.getByRole("searchbox", { name: "Search card" });
  await search.fill("charizard");

  // 107 matches exist in the catalogue; the old picker showed 20.
  const options = dialog.locator("ul > li");
  await expect.poll(() => options.count(), { timeout: 20_000 }).toBeGreaterThan(100);

  await expect(dialog.getByText(/^\d+ matches$/)).toBeVisible();

  // A late-catalogue print the old early-break could never surface.
  await expect(dialog.getByText("Mega Charizard Y ex").first()).toBeVisible();

  // Broad queries stay bounded, but say so instead of silently capping.
  await search.fill("ch");
  await expect(
    dialog.getByText(/Showing 500 of \d+ matches — keep typing to narrow\./),
  ).toBeVisible({ timeout: 20_000 });
});
