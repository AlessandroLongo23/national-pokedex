/**
 * Backfill rate_to_eur on transactions/packs_opened rows that pre-date
 * 20260528120000_multi_currency.sql.
 *
 * For each row missing rate_to_eur, looks up the FX rate from
 * Frankfurter for that row's transaction date and writes back
 * "EUR per 1 unit of <currency>" (the inverse of Frankfurter's
 * base=EUR convention).
 *
 * Idempotent: re-runs only touch rows where rate_to_eur IS NULL.
 *
 * Usage:
 *   npx tsx scripts/data/backfill-currency-rates.ts
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
 * .env / .env.local. Uses the service-role key to bypass RLS.
 */
import { readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function loadEnv(path: string) {
  try {
    const txt = readFileSync(path, "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (m) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // file missing — silently skip
  }
}

loadEnv(".env");
loadEnv(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local.",
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRole, {
  auth: { persistSession: false },
});

const FRANKFURTER = "https://api.frankfurter.dev/v1";

// (currency, YYYY-MM-DD) → EUR-per-unit. Memoised so we hit the API once
// per distinct (currency, date) pair across the whole backfill.
const rateCache = new Map<string, number | null>();

async function getRateToEur(currency: string, date: string): Promise<number | null> {
  if (currency === "EUR") return 1;
  const key = `${currency}@${date}`;
  if (rateCache.has(key)) return rateCache.get(key) ?? null;
  try {
    const res = await fetch(`${FRANKFURTER}/${date}?base=EUR`);
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rateFromEur = json.rates?.[currency];
    if (typeof rateFromEur !== "number" || rateFromEur <= 0) {
      rateCache.set(key, null);
      return null;
    }
    const rateToEur = 1 / rateFromEur;
    rateCache.set(key, rateToEur);
    return rateToEur;
  } catch (err) {
    console.warn(`  ! lookup failed for ${currency}@${date}: ${String(err)}`);
    rateCache.set(key, null);
    return null;
  }
}

function dateOnly(iso: string): string {
  // Frankfurter accepts YYYY-MM-DD; lop off the time portion.
  return iso.slice(0, 10);
}

async function backfillTransactions(client: SupabaseClient): Promise<void> {
  const { data, error } = await client
    .from("transactions")
    .select("id, currency, occurred_at")
    .is("rate_to_eur", null);
  if (error) throw new Error(`transactions select: ${error.message}`);
  if (!data || data.length === 0) {
    console.log("transactions: nothing to backfill");
    return;
  }
  console.log(`transactions: ${data.length} rows to backfill`);

  let updated = 0;
  let skipped = 0;
  for (const row of data) {
    const currency = row.currency as string;
    const date = dateOnly(row.occurred_at as string);
    const rate = await getRateToEur(currency, date);
    if (rate == null) {
      skipped++;
      continue;
    }
    const { error: updErr } = await client
      .from("transactions")
      .update({ rate_to_eur: rate })
      .eq("id", row.id as string);
    if (updErr) {
      console.warn(`  ! update failed for txn ${row.id}: ${updErr.message}`);
      skipped++;
      continue;
    }
    updated++;
  }
  console.log(`transactions: updated ${updated}, skipped ${skipped}`);
}

async function backfillPacks(client: SupabaseClient): Promise<void> {
  const { data, error } = await client
    .from("packs_opened")
    .select("id, currency, opened_at, cost_cents")
    .is("rate_to_eur", null);
  if (error) throw new Error(`packs_opened select: ${error.message}`);
  // We only want to set rate_to_eur on packs that actually have a cost +
  // currency; null-currency packs have no use for a rate snapshot.
  const candidates = (data ?? []).filter(
    (r) => r.currency != null && r.cost_cents != null,
  );
  if (candidates.length === 0) {
    console.log("packs_opened: nothing to backfill");
    return;
  }
  console.log(`packs_opened: ${candidates.length} rows to backfill`);

  let updated = 0;
  let skipped = 0;
  for (const row of candidates) {
    const currency = row.currency as string;
    const date = dateOnly(row.opened_at as string);
    const rate = await getRateToEur(currency, date);
    if (rate == null) {
      skipped++;
      continue;
    }
    const { error: updErr } = await client
      .from("packs_opened")
      .update({ rate_to_eur: rate })
      .eq("id", row.id as string);
    if (updErr) {
      console.warn(`  ! update failed for pack ${row.id}: ${updErr.message}`);
      skipped++;
      continue;
    }
    updated++;
  }
  console.log(`packs_opened: updated ${updated}, skipped ${skipped}`);
}

(async () => {
  await backfillTransactions(supabase);
  await backfillPacks(supabase);
  console.log("done");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
