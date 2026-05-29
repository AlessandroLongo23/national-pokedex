-- Multi-currency support across the price-handling surfaces.
--
-- Replaces the hardcoded USD/EUR allow-list on transactions.currency and
-- packs_opened.currency with a permissive ISO-4217-shape check
-- (3 uppercase letters); the actual allow-list is enforced app-side
-- against lib/pricing/currencies.ts SUPPORTED_CURRENCIES so we can add
-- a new code without a migration.
--
-- Adds rate_to_eur (numeric, EUR per 1 unit of the row's currency on
-- the transaction date) so historical rows always convert back to a
-- display currency at the rate that was true when the user actually
-- paid — "ledger truth". Nullable for back-compat with rows logged
-- before this migration; scripts/data/backfill-currency-rates.ts
-- populates them by calling Frankfurter's historical endpoint.
--
-- Adds user_preferences.display_currency for the user's chosen display
-- currency. Defaults to USD to match the current behaviour for the
-- single existing user.

-- ─── transactions ────────────────────────────────────────────────────
alter table public.transactions
  drop constraint if exists transactions_currency_check;
alter table public.transactions
  add constraint transactions_currency_shape_check
  check (currency ~ '^[A-Z]{3}$');
alter table public.transactions
  add column rate_to_eur numeric(20,10)
  check (rate_to_eur is null or rate_to_eur > 0);

-- ─── packs_opened ────────────────────────────────────────────────────
alter table public.packs_opened
  drop constraint if exists packs_opened_currency_check;
alter table public.packs_opened
  add constraint packs_opened_currency_shape_check
  check (currency is null or currency ~ '^[A-Z]{3}$');
alter table public.packs_opened
  add column rate_to_eur numeric(20,10)
  check (rate_to_eur is null or rate_to_eur > 0);

-- ─── user_preferences.display_currency ───────────────────────────────
alter table public.user_preferences
  add column display_currency text not null default 'USD'
  check (display_currency ~ '^[A-Z]{3}$');

notify pgrst, 'reload schema';
