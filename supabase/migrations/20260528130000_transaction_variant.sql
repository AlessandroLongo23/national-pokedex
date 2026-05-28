-- Records which printing of a card was bought/sold on each singles
-- transaction. The TCG sells most cards in two or three printings
-- (normal, holofoil, reverse holofoil) at quite different prices, so
-- the ledger needs to distinguish them or "I bought a Charizard for
-- €120" loses the fact that it was the holo version, not the
-- common-rarity reverse.
--
-- Scope is the ledger only — owned_cards stays a flat per-card count.
-- For binder/coverage purposes the user just needs "do I own this
-- pokémon?", not "do I own the holo print?". The variant lives on
-- transactions for spend analytics and ledger truth.
--
-- NULL is valid and meaningful: pack_purchase and psa_fee rows don't
-- have a single variant (a pack contains many cards; the PSA fee is
-- per-submission), and any pre-existing single_purchase/sale rows
-- predate the column. The check constraint allows the column to be
-- NULL OR one of the three known values.

alter table public.transactions
  add column variant text
  check (variant in ('normal','holofoil','reverseHolofoil'));

comment on column public.transactions.variant is
  'Printing variant for single_purchase/sale rows. NULL for pack_purchase, psa_fee, and legacy rows.';

notify pgrst, 'reload schema';
