-- User-tagged favorite cards. Distinct from wishlist: favorites are cards the
-- user has chosen to highlight (regardless of ownership), used to seed the
-- "by favorites" rail on the /collection page.

create table public.user_favorites (
  user_id      uuid not null,
  card_id      text not null,
  favorited_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index user_favorites_user_idx on public.user_favorites (user_id);

alter table public.user_favorites enable row level security;

create policy "user_favorites owner" on public.user_favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.user_favorites
  add constraint user_favorites_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

alter publication supabase_realtime add table public.user_favorites;

notify pgrst, 'reload schema';
