-- Per-user preferences. First field: which pricing source to surface in
-- the UI (TCGplayer USD vs Cardmarket EUR). Future fields (theme, default
-- binder, currency display, etc.) live here too.

create table public.user_preferences (
  user_id      uuid primary key,
  price_source text not null default 'tcgplayer',
  updated_at   timestamptz not null default now(),
  constraint user_preferences_price_source_check
    check (price_source in ('tcgplayer', 'cardmarket'))
);

alter table public.user_preferences enable row level security;

create policy "user_preferences owner" on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.user_preferences
  add constraint user_preferences_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

notify pgrst, 'reload schema';
