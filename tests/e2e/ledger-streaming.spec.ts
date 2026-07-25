import { test, expect, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "streaming-e2e@example.com";

// Mirrors the real collection's shape — cards spread across ~17 sets, so
// fetchPricesForCards fans out to one slow pokemontcg.io call per set.
//
// Deliberately legacy sets rather than the SV/ME ones the app browses:
// Next's fetch cache is keyed by URL and lives for 24h, so reusing the
// app's own sets would measure a warm cache and prove nothing. These are
// real pokemontcg.io set ids that this project never requests.
const SETS = [
  "swsh1", "swsh2", "swsh3", "swsh4", "swsh5", "swsh6", "swsh7", "swsh8",
  "swsh9", "swsh10", "swsh11", "swsh12", "sm1", "sm2", "sm3", "sm4", "sm5",
  "sm6", "sm7", "sm8", "sm9", "sm10",
];

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

// The ledger must not wait on pricing. Held value needs one pokemontcg.io
// round-trip per owned set (4-11s each, measured), so if the hero blocked
// the render the whole page would sit blank for tens of seconds.
test("the ledger renders before live pricing resolves", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await signIn(context);
  const userId = await getUserId();
  expect(userId).not.toBeNull();

  await admin().from("transactions").delete().eq("user_id", userId!);
  await admin().from("owned_cards").delete().eq("user_id", userId!);

  // A real transaction row, not just a pack: the ledger table only
  // renders when there is something in `transactions`, and seeding via
  // the admin client bypasses the server action that would create it.
  await admin().from("transactions").insert({
    user_id: userId!,
    kind: "single_purchase",
    occurred_at: "2026-07-20T10:00:00Z",
    amount_cents: -500,
    currency: "EUR",
    rate_to_eur: 1,
    card_id: "sv3-1",
    quantity: 1,
  });
  await admin().from("owned_cards").insert(
    SETS.map((s) => ({ user_id: userId!, card_id: `${s}-1`, quantity: 1 })),
  );

  const started = Date.now();
  // `commit`, not the default `load`: the load event only fires once the
  // streamed response finishes, which is exactly the tail we're trying to
  // measure separately. Waiting for it would collapse both timings.
  await page.goto("/transactions", { waitUntil: "commit" });

  // Time-to-ledger: the table is the page's actual content.
  await expect(page.getByRole("table")).toBeVisible({ timeout: 30_000 });
  const ledgerMs = Date.now() - started;

  // Time-to-priced-hero: the streamed-in figure.
  await expect(page.getByLabel(/^Net position [^l]/)).toBeVisible({
    timeout: 120_000,
  });
  const heroMs = Date.now() - started;

  console.log(
    `\n  ledger visible: ${ledgerMs} ms   priced hero: ${heroMs} ms   ` +
      `(pricing ran off the critical path for ${heroMs - ledgerMs} ms)\n`,
  );

  // The whole point: the ledger must not be gated on the pricing call.
  // Measured against this same seed, the pre-streaming page took ~37s to
  // show anything while the streaming one takes ~1s; 15s is a loose bound
  // that still catches pricing sliding back onto the critical path.
  expect(ledgerMs).toBeLessThan(15_000);
  expect(ledgerMs).toBeLessThan(heroMs);

  await admin().from("transactions").delete().eq("user_id", userId!);
  await admin().from("owned_cards").delete().eq("user_id", userId!);
});
