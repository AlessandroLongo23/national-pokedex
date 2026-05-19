-- Adds purchase-cost capture to packs_opened. Nullable so existing pack
-- rows (logged before pricing existed) keep working — the ledger UI will
-- show null-cost packs as "not entered" and offer a backfill prompt.
--
-- Currency is constrained to the same two values surfaced by the price
-- source picker (lib/pricing/pokemontcg.ts: PRICE_SOURCE_CURRENCY) so the
-- ledger can aggregate without surprises. cost_cents stays integer-cents
-- to avoid floating-point money math; the UI converts.

alter table public.packs_opened
  add column cost_cents integer check (cost_cents is null or cost_cents >= 0),
  add column currency   text    check (currency is null or currency in ('USD','EUR'));

notify pgrst, 'reload schema';
