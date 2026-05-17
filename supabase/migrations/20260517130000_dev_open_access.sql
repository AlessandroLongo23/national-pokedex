-- DEV-ONLY: idempotent setup that creates owned_pokemon if missing and
-- ensures it is open (no RLS, no FK to auth.users) so the app can read/write
-- without authentication. Safe to re-run.
--
-- To re-add authentication later:
--   alter table public.owned_pokemon enable row level security;
--   alter table public.owned_pokemon add constraint owned_pokemon_user_id_fkey
--     foreign key (user_id) references auth.users(id) on delete cascade;
--   create policy "owner_full_access" on public.owned_pokemon
--     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.owned_pokemon (
  user_id     uuid        not null,
  dex_number  int         not null check (dex_number between 1 and 1025),
  acquired_at timestamptz not null default now(),
  primary key (user_id, dex_number)
);

alter table public.owned_pokemon disable row level security;
alter table public.owned_pokemon drop constraint if exists owned_pokemon_user_id_fkey;

notify pgrst, 'reload schema';
