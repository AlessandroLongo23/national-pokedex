/**
 * Mobile interaction verification (dev-only). Reuses the storage state minted
 * by mobile-shot.ts. Drives a few touch interactions that static screenshots
 * can't show: filters expand, drawer open, ledger scroll, variant-picker sheet.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const OUT = ".mobile-audit";
const STATE = join(OUT, "storage-state.json");

async function main() {
  if (!existsSync(STATE)) {
    console.error("No storage state. Run mobile-shot.ts first.");
    process.exit(1);
  }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: STATE,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  ctx.addInitScript(() => {
    try {
      localStorage.setItem("pokedex-theme", "dark");
    } catch {}
  });

  const shot = async (name: string, fn: (page: import("@playwright/test").Page) => Promise<void>, route: string, opts?: { full?: boolean }) => {
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle", timeout: 45000 });
    } catch {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
    }
    await page.waitForTimeout(800);
    try {
      await fn(page);
    } catch (e) {
      console.log(`  [${name}] interaction note: ${(e as Error).message.split("\n")[0]}`);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(OUT, `verify-${name}.png`), fullPage: opts?.full ?? false });
    console.log(`  shot ${name}`);
    await page.close();
  };

  // 1. /cards — expand the Filters disclosure.
  await shot("cards-filters-open", async (page) => {
    await page.getByRole("button", { name: /^Filters/ }).first().click();
    await page.waitForTimeout(300);
  }, "/cards");

  // 2. /transactions — scroll the inner ledger to reveal the mobile cards.
  await shot("transactions-ledger", async (page) => {
    // viewport-fit route: scroll the nearest scrollable ancestor of the ledger.
    await page.evaluate(() => {
      const sc = Array.from(document.querySelectorAll<HTMLElement>("*")).find(
        (el) => el.scrollHeight > el.clientHeight + 40 && getComputedStyle(el).overflowY !== "visible",
      );
      if (sc) sc.scrollTop = sc.scrollHeight;
      else window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(400);
  }, "/transactions");

  // 3. Mobile nav drawer open (from /pokedex).
  await shot("drawer-open", async (page) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.waitForTimeout(400);
  }, "/pokedex");

  // 4. Variant picker sheet — tap the first pokedex cell.
  await shot("variant-picker", async (page) => {
    await page.locator("[data-dex]").first().click();
    await page.waitForTimeout(500);
  }, "/pokedex");

  // 5. Card detail actions bar (touch targets).
  await shot("card-detail", async () => {}, "/cards/sv9-28");

  // 6. Log-a-single modal (max-height, top-anchored, close button on mobile).
  await shot("modal-single", async (page) => {
    await page.getByRole("link", { name: /Log a singles purchase/i }).first().click()
      .catch(async () => {
        await page.getByRole("button", { name: /Log a singles purchase/i }).first().click();
      });
    await page.waitForTimeout(600);
  }, "/transactions");

  // 7. New PSA submission modal.
  await shot("modal-psa", async (page) => {
    await page.getByRole("link", { name: /New PSA submission/i }).first().click()
      .catch(async () => {
        await page.getByRole("button", { name: /New PSA submission/i }).first().click();
      });
    await page.waitForTimeout(600);
  }, "/transactions");

  await ctx.close();
  await browser.close();
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
