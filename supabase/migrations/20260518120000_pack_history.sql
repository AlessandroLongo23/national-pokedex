-- Pack-opening history: one row in packs_opened per pack logged, N rows in
-- pack_contents per Pokémon that came out of that pack. We deliberately store
-- species-level granularity (dex_number) rather than per-card detail.

create table if not exists public.packs_opened (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null,
  set_id      text        not null,
  opened_at   timestamptz not null default now()
);

create table if not exists public.pack_contents (
  pack_id     uuid not null references public.packs_opened(id) on delete cascade,
  dex_number  int  not null check (dex_number between 1 and 1025),
  primary key (pack_id, dex_number)
);

create index if not exists packs_opened_user_opened_at
  on public.packs_opened (user_id, opened_at desc);

-- Enable RLS with owner-only policy. The dev-mode override migration that
-- follows disables RLS + drops the auth.users FK to match the existing pattern
-- for owned_pokemon during the auth-bypass phase.
alter table public.packs_opened   enable row level security;
alter table public.pack_contents  enable row level security;

create policy "owner_packs_opened" on public.packs_opened
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owner_pack_contents" on public.pack_contents
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
