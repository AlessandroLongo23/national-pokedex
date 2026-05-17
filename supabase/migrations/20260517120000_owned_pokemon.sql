create table public.owned_pokemon (
  user_id     uuid        not null references auth.users(id) on delete cascade,
  dex_number  int         not null check (dex_number between 1 and 1025),
  acquired_at timestamptz not null default now(),
  primary key (user_id, dex_number)
);

alter table public.owned_pokemon enable row level security;

create policy "owner_full_access"
  on public.owned_pokemon
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
