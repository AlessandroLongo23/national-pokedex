-- Bulk buy ("card lots"). A lot is a pack without a set: an arbitrary
-- selection of cards from anywhere in the catalogue, bought together for
-- one combined price, with a per-card quantity. Mirrors packs_opened /
-- pack_contents (current card-level schema) minus set_id, plus quantity.

create table if not exists public.card_lots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null,
  purchased_at timestamptz not null default now(),
  cost_cents   integer     check (cost_cents is null or cost_cents >= 0),
  currency     text        check (currency is null or currency in ('USD','EUR')),
  rate_to_eur  numeric(20,10) check (rate_to_eur is null or rate_to_eur > 0),
  created_at   timestamptz not null default now()
);

create table if not exists public.lot_contents (
  lot_id   uuid not null references public.card_lots(id) on delete cascade,
  card_id  text not null,
  quantity integer not null check (quantity > 0),
  primary key (lot_id, card_id)
);

create index if not exists card_lots_user_purchased_at
  on public.card_lots (user_id, purchased_at desc);

alter table public.card_lots  enable row level security;
alter table public.lot_contents enable row level security;

create policy "owner_card_lots" on public.card_lots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_lot_contents" on public.lot_contents
  for all using (
    exists (
      select 1 from public.card_lots l
      where l.id = lot_contents.lot_id and l.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.card_lots l
      where l.id = lot_contents.lot_id and l.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
