-- Dev-mode: disable RLS on the card-level tables, mirroring the existing
-- dev_pack_access migration. To restore production-grade isolation, re-enable
-- RLS and rely on the owner policies created in 20260518130000_card_level.sql.

alter table public.owned_cards      disable row level security;
alter table public.wishlist_cards   disable row level security;
alter table public.set_availability disable row level security;
alter table public.packs_opened     disable row level security;
alter table public.pack_contents    disable row level security;
