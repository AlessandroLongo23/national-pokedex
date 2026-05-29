import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Regression test for the "no page can scroll" bug: the ported app shell
// clips the content panel (`overflow-hidden`) on viewport-fit routes, so each
// page must establish its own bounded-height internal scroll region. Before the
// fix there was no scrollable element inside <main>, content below the fold was
// unreachable, and the document itself never scrolled. This test asserts, for
// every viewport-fit route, that the main content scrolls inside a container
// while the window stays pinned and the page heading does not move.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TEST_EMAIL = "binders-e2e@example.com";

// A short viewport guarantees the data-heavy routes overflow so there is
// something to scroll.
test.use({ viewport: { width: 1024, height: 560 } });

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE);
}

async function signIn(page: Page) {
  const { data, error } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: TEST_EMAIL,
  });
  if (error) throw error;
  await page.goto(data.properties!.action_link);
  // The link may resolve via the PKCE code flow (clean /dashboard URL) or the
  // implicit flow (/dashboard#access_token=...). Either way the browser
  // Supabase client persists the session to cookies; give it a beat.
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
  await page.waitForTimeout(1200);
}

// Viewport-fit routes whose content overflows for ANY signed-in user, so the
// scroll assertion is deterministic regardless of that user's data. They cover
// all three body mechanisms: the window→element virtualized grid (/cards), the
// large non-virtualized CSS grid (/pokedex), and a table (/sets). The remaining
// viewport-fit routes (transactions, binders, collection, wishlist, portfolio,
// packs) use the identical contract but only overflow once the user has data;
// they are verified visually instead of asserted here.
const ROUTES = ["/pokedex", "/cards", "/sets"];

// /megas is intentionally excluded: it redirects to /pokedex unless the user
// has opted Megas into a separate section.

// Find the largest scrollable element inside <main>, jump it to the bottom, and
// report whether it actually moved and whether the window scrolled with it.
async function probeScroll(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    if (!main) return { found: false } as const;
    let best: { el: Element; delta: number } | null = null;
    for (const el of main.querySelectorAll("*")) {
      const oy = getComputedStyle(el).overflowY;
      if (oy !== "auto" && oy !== "scroll") continue;
      const delta = el.scrollHeight - el.clientHeight;
      if (!best || delta > best.delta) best = { el, delta };
    }
    if (!best) return { found: false } as const;
    const el = best.el as HTMLElement;
    const from = el.scrollTop;
    el.scrollTop = el.scrollHeight; // attempt to reach the bottom
    return {
      found: true,
      delta: best.delta,
      scrolledFrom: from,
      scrolledTo: el.scrollTop,
      windowScrollY: window.scrollY,
    } as const;
  });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

for (const route of ROUTES) {
  test(`content scrolls inside the shell on ${route}`, async ({ page }) => {
    await page.goto(route);
    // PageHeader renders the route's <h1>; wait for it before measuring.
    const heading = page.locator("main h1").first();
    await expect(heading).toBeVisible();
    // Let layout settle (virtualized grids measure on the first frames).
    await page.waitForTimeout(900);

    const headingBoxBefore = await heading.boundingBox();
    const probe = await probeScroll(page);

    expect(probe.found, `no scroll container found inside <main> on ${route}`).toBe(true);
    if (!probe.found) return;

    // There is content beyond the fold...
    expect(probe.delta).toBeGreaterThan(20);
    // ...and the container actually scrolled to reveal it...
    expect(probe.scrolledTo).toBeGreaterThan(probe.scrolledFrom);
    // ...without the document itself scrolling (the shell stays fixed).
    expect(probe.windowScrollY).toBe(0);

    // The page heading stays pinned while the body scrolls.
    const headingBoxAfter = await heading.boundingBox();
    if (headingBoxBefore && headingBoxAfter) {
      expect(Math.abs(headingBoxAfter.y - headingBoxBefore.y)).toBeLessThan(2);
    }
  });
}
