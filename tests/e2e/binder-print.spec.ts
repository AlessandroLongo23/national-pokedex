import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "binder-print-e2e@example.com";

test.use({ viewport: { width: 1280, height: 900 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function getUserId(): Promise<string | null> {
  const { data } = await admin().auth.admin.listUsers();
  return data.users.find((u) => u.email === TEST_EMAIL)?.id ?? null;
}

// Admin magic links never persist SSR cookies; mint a real session via the
// email OTP and inject the @supabase/ssr-encoded cookies (the working pattern
// from group-singles.spec.ts / bulk-lot.spec.ts).
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

async function ensureUser(): Promise<string> {
  let userId = await getUserId();
  if (!userId) {
    const { data, error } = await admin().auth.admin.createUser({
      email: TEST_EMAIL,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;
  }
  return userId;
}

async function reset(userId: string) {
  const a = admin();
  await a.from("binders").delete().eq("user_id", userId);
  await a.from("owned_cards").delete().eq("user_id", userId);
}

async function seed(userId: string) {
  const a = admin();
  // Own one Pokémon card from sv1 so "missing" excludes it and dex #1 is owned.
  await a.from("owned_cards").insert({ user_id: userId, card_id: "sv1-1", quantity: 1 });
  const { data: master } = await a
    .from("binders")
    .insert({
      user_id: userId,
      name: "SV1 Master Set",
      scope_type: "master_set",
      scope_params: { setId: "sv1" },
    })
    .select("id")
    .single();
  const { data: dex } = await a
    .from("binders")
    .insert({
      user_id: userId,
      name: "Kanto Starters Dex",
      scope_type: "pokedex",
      scope_params: { dexFrom: 1, dexTo: 9 },
    })
    .select("id")
    .single();
  return { masterId: master!.id as string, dexId: dex!.id as string };
}

let masterId = "";
let dexId = "";

test.beforeAll(async () => {
  const userId = await ensureUser();
  await reset(userId);
  ({ masterId, dexId } = await seed(userId));
});

test.afterAll(async () => {
  const userId = await getUserId();
  if (userId) await reset(userId);
});

test("master-set binder: card-scan placeholders, print isolation, grayscale toggle", async ({
  context,
  page,
}: {
  context: BrowserContext;
  page: Page;
}) => {
  await signIn(context);

  // Enter via the binder page link so we exercise the button too.
  await page.goto(`/binders/${masterId}`);
  await page.getByRole("link", { name: /print placeholders/i }).click();
  await expect(page).toHaveURL(new RegExp(`/binders/${masterId}/print$`));

  // Card-scan is the default style; B&W default → grayscale filter on the image.
  await expect(page.getByRole("button", { name: "Card scan" })).toBeVisible();
  const sheets = page.locator(".print-sheet");
  await expect(sheets.first()).toBeVisible();
  const firstScan = page.locator("#print-root img").first();
  await expect(firstScan).toHaveCSS("filter", /grayscale/);

  // Toggle to Color removes the filter.
  await page.getByRole("button", { name: "Color" }).click();
  await expect(firstScan).toHaveCSS("filter", "none");

  // "All" includes at least as many cards as "Missing" (which dropped the owned one).
  const missingCount = await sheets.count();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect.poll(async () => await sheets.count()).toBeGreaterThanOrEqual(missingCount);

  // Print isolation: under print media the toolbar disappears, sheets remain.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: /print \/ save as pdf/i })).toBeHidden();
  await expect(sheets.first()).toBeVisible();
  await page.emulateMedia({ media: "screen" });
});

test("pokedex binder: artwork placeholders render with names + dex numbers", async ({
  context,
  page,
}: {
  context: BrowserContext;
  page: Page;
}) => {
  await signIn(context);
  await page.goto(`/binders/${dexId}/print`);

  // Artwork is the default for pokedex; sheets render with species names.
  await expect(page.getByRole("button", { name: "Artwork" })).toBeVisible();
  await expect(page.locator(".print-sheet").first()).toBeVisible();
  await expect(page.getByText("Bulbasaur").first()).toBeVisible();
  await expect(page.getByText("#0001").first()).toBeVisible();
  // Official artwork comes from the PokeAPI sprites host.
  await expect(
    page.locator('#print-root img[src*="official-artwork/1.png"]').first(),
  ).toBeVisible();
});
