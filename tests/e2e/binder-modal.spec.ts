import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

// Regression test for the "modal won't open" bug on pokedex-scope binders.
// The ported app shell wraps every page's `{children}` in `.shell-page-enter`,
// which carried `will-change: transform` + an `animation: ... both` fill that
// left `transform: translateY(0)` applied forever. A non-`none` transform (or
// `will-change: transform`) makes that wrapper the containing block for
// `position: fixed` descendants. The BinderCellPicker modal is `fixed inset-0`,
// so on the (non-viewport-fit, document-tall) binder detail route it:
//   - sized its backdrop to the content column instead of the viewport
//     (overlay never covered the sidebar), and
//   - centered the dialog in the middle of the full-height grid wrapper,
//     parking it far below the fold (the dialog was effectively invisible).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "binders-e2e@example.com";

// Wide enough that the md: breakpoint is active (sidebar visible, modal uses
// md:items-center); short enough that the binder grid overflows far past the
// fold so the "centered in the tall wrapper" failure parks the modal off-screen.
test.use({ viewport: { width: 1280, height: 600 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function getUserId(): Promise<string | null> {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === TEST_EMAIL)?.id ?? null;
}

// Admin magic links use the implicit grant (tokens in the URL hash), which this
// app never persists to cookies outside the real login UI. Instead, mint a real
// session via the email OTP and inject the @supabase/ssr-encoded cookies
// directly, so the server-rendered (dashboard) routes see an authenticated user.
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

async function resetBinders(userId: string) {
  await admin().from("binders").delete().eq("user_id", userId);
}

test("clicking a cell in a pokedex binder opens the picker modal in view", async ({
  page,
  context,
}) => {
  await signIn(context);
  const userId = await getUserId();
  expect(userId, "test user must exist").toBeTruthy();
  if (!userId) return;

  await resetBinders(userId);
  const { data: inserted, error } = await admin()
    .from("binders")
    .insert({
      user_id: userId,
      name: "Pokédex · National",
      scope_type: "pokedex",
      scope_params: { dexFrom: 1, dexTo: 1025 },
    })
    .select("id")
    .single();
  if (error) throw error;

  await page.goto(`/binders/${inserted!.id}`);

  // Wait for the grid to render its cells.
  const firstCell = page.locator("button[data-dex]").first();
  await expect(firstCell).toBeVisible({ timeout: 15_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  // The picker's Close button uniquely identifies the open modal. Retry the
  // click until it opens: the cell is server-rendered, so an early click can
  // land before React attaches the handler (a lost event, not a bug).
  const close = page.getByRole("button", { name: "Close" });
  await expect(async () => {
    await firstCell.click();
    await expect(close).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });

  // Symptom 1: the dialog must actually be on-screen, not parked below the fold.
  await expect(close).toBeInViewport();

  // Symptom 2: the backdrop must cover the whole viewport (incl. the sidebar),
  // i.e. its fixed-positioned overlay spans the full window width from x=0.
  const overlay = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="Close"]');
    let el = btn as HTMLElement | null;
    while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, width: r.width, innerW: window.innerWidth };
  });
  expect(overlay, "fixed overlay ancestor not found").not.toBeNull();
  expect(overlay!.left).toBeLessThanOrEqual(1);
  expect(Math.abs(overlay!.width - overlay!.innerW)).toBeLessThanOrEqual(1);
});

test.afterAll(async () => {
  const userId = await getUserId();
  if (userId) await resetBinders(userId);
});
