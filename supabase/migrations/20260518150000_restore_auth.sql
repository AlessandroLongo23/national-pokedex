-- Restores real Supabase authentication after the dev-only bypass
-- (20260517130000_dev_open_access.sql and 20260518130100_dev_card_access.sql).
--
-- This migration:
--   1. Drops the legacy single-table prototype (owned_pokemon) — replaced by
--      owned_cards and no longer referenced by application code.
--   2. Re-enables RLS on every user-scoped table. Per-table owner policies
--      defined in 20260518130000_card_level.sql remain in pg_policies and
--      re-activate automatically when RLS is enabled.
--   3. Adds FKs from user_id columns to auth.users(id) so deleted accounts
--      cascade-delete their data.
--
-- The FK adds use NOT VALID because rows owned by the dev-bypass UUID
-- ('00000000-0000-0000-0000-000000000001') still exist and would otherwise
-- block the migration. Those rows must be reassigned to a real auth.users
-- row in a separate one-shot SQL after the maintainer's first sign-in,
-- after which the constraints can be validated:
--
--   alter table public.owned_cards      validate constraint owned_cards_user_id_fkey;
--   alter table public.wishlist_cards   validate constraint wishlist_cards_user_id_fkey;
--   alter table public.set_availability validate constraint set_availability_user_id_fkey;
--   alter table public.packs_opened     validate constraint packs_opened_user_id_fkey;

drop table if exists public.owned_pokemon;

alter table public.owned_cards      enable row level security;
alter table public.wishlist_cards   enable row level security;
alter table public.set_availability enable row level security;
alter table public.packs_opened     enable row level security;
alter table public.pack_contents    enable row level security;

alter table public.owned_cards
  add constraint owned_cards_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

alter table public.wishlist_cards
  add constraint wishlist_cards_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

alter table public.set_availability
  add constraint set_availability_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

alter table public.packs_opened
  add constraint packs_opened_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

notify pgrst, 'reload schema';
