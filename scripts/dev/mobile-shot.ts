/**
 * Mobile-audit screenshot harness (dev-only, not part of the app).
 *
 * Authenticates as a real Supabase user via the OTP→cookie pattern (admin
 * magic links use the implicit grant which this app never persists to cookies;
 * see tests/e2e/bulk-lot.spec.ts), caches the session as a Playwright
 * storageState, then screenshots a list of routes at a given viewport.
 *
 * Usage:
 *   npx tsx scripts/dev/mobile-shot.ts \
 *     --routes /pokedex,/sets,/cards \
 *     --w 390 --h 844 --theme dark --tag mobile [--full] [--reauth]
 *
 * Output: .mobile-audit/<tag>-<safe-route>.png
 */
import { chromium, type BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { mkdirSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";

try {
  // Node 22 native .env loader.
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(".env");
} catch {
  /* env may already be present */
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.MOBILE_SHOT_EMAIL ?? "longoa02@gmail.com";

const OUT_DIR = ".mobile-audit";
const STATE_PATH = join(OUT_DIR, "storage-state.json");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function mintCookies(): Promise<{ name: string; value: string }[]> {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: link, error: le } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: EMAIL,
  });
  if (le) throw le;
  const otp = link.properties!.email_otp!;

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: verified, error: ve } = await anon.auth.verifyOtp({
    email: EMAIL,
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
  return captured;
}

async function buildStorageState(): Promise<string> {
  const captured = await mintCookies();
  const state = {
    cookies: captured.map((c) => ({
      name: c.name,
      value: c.value,
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [] as unknown[],
  };
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return STATE_PATH;
}

function safeName(route: string): string {
  const r = route.replace(/^\//, "").replace(/[/?#&=]+/g, "_") || "home";
  return r;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const routes = (arg("routes") ?? "/pokedex")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  const width = parseInt(arg("w", "390")!, 10);
  const height = parseInt(arg("h", "844")!, 10);
  const theme = (arg("theme", "dark") as "dark" | "light")!;
  const tag = arg("tag", `${width}`)!;
  const fullPage = flag("full");
  const waitMs = parseInt(arg("wait", "0")!, 10);

  if (flag("reauth") || !existsSync(STATE_PATH)) {
    console.log("Authenticating…");
    await buildStorageState();
  }

  const noAuth = flag("noauth");
  const browser = await chromium.launch();
  const newCtx = async (): Promise<BrowserContext> =>
    browser.newContext({
      ...(noAuth ? {} : { storageState: STATE_PATH }),
      viewport: { width, height },
      deviceScaleFactor: 2,
      colorScheme: theme,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });

  let ctx = await newCtx();

  async function ensureAuth() {
    if (noAuth) return;
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("pokedex-theme", t as string);
      } catch {}
    }, theme);
    await page.goto(`${BASE_URL}/pokedex`, { waitUntil: "domcontentloaded" });
    if (page.url().includes("/login")) {
      console.log("Session expired, re-authenticating…");
      await page.close();
      await ctx.close();
      await buildStorageState();
      ctx = await newCtx();
    } else {
      await page.close();
    }
  }
  await ensureAuth();

  const results: string[] = [];
  for (const route of routes) {
    const page = await ctx.newPage();
    await page.addInitScript((t) => {
      try {
        localStorage.setItem("pokedex-theme", t as string);
      } catch {}
    }, theme);
    try {
      await page.goto(`${BASE_URL}${route}`, {
        waitUntil: "networkidle",
        timeout: 45_000,
      });
    } catch {
      // networkidle can hang on pages with realtime sockets / pricing fetches.
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
    if (waitMs) await page.waitForTimeout(waitMs);
    const file = join(OUT_DIR, `${tag}-${safeName(route)}.png`);
    await page.screenshot({ path: file, fullPage });
    results.push(`${route} -> ${file}`);
    console.log(`  shot ${route}`);
    await page.close();
  }

  await ctx.close();
  await browser.close();
  console.log("\nDone:\n" + results.join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
