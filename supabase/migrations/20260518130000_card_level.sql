-- Card-level refactor: ownership and pack contents move from species-level
-- (dex number) to card-level (TCG card ID, e.g. "sv1-1"). Adds a wishlist
-- table and a per-user availability-override table for local-store filtering.

drop table if exists public.pack_contents cascade;
drop table if exists public.packs_opened  cascade;
drop table if exists public.owned_pokemon cascade;

create table public.owned_cards (
  user_id     uuid not null,
  card_id     text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table public.wishlist_cards (
  user_id    uuid not null,
  card_id    text not null,
  added_at   timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- Absence of a row = use release-date heuristic; explicit row overrides it.
create table public.set_availability (
  user_id    uuid not null,
  set_id     text not null,
  available  boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, set_id)
);

create table public.packs_opened (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null,
  set_id    text not null,
  opened_at timestamptz not null default now()
);

create table public.pack_contents (
  pack_id  uuid not null references public.packs_opened(id) on delete cascade,
  card_id  text not null,
  primary key (pack_id, card_id)
);

create index owned_cards_user_idx       on public.owned_cards (user_id);
create index wishlist_cards_user_idx    on public.wishlist_cards (user_id);
create index packs_opened_user_time_idx on public.packs_opened (user_id, opened_at desc);

alter table public.owned_cards      enable row level security;
alter table public.wishlist_cards   enable row level security;
alter table public.set_availability enable row level security;
alter table public.packs_opened     enable row level security;
alter table public.pack_contents    enable row level security;

create policy "owned_cards owner" on public.owned_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "wishlist_cards owner" on public.wishlist_cards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "set_availability owner" on public.set_availability
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "packs_opened owner" on public.packs_opened
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "pack_contents via pack owner" on public.pack_contents
  for all using (
    exists (
      select 1 from public.packs_opened p
      where p.id = pack_contents.pack_id and p.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.packs_opened p
      where p.id = pack_contents.pack_id and p.user_id = auth.uid()
    )
  );
