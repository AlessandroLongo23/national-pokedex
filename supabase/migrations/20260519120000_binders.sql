-- Multi-binder system. A binder is a *target list* per user.
--
-- Auto-scoped binders store a predicate in scope_params and resolve their
-- target list live by filtering reference data (lib/data/cards/*.json), so
-- new card releases automatically appear. Custom binders store explicit
-- card_ids in binder_cards. scope_params is intentionally NOT validated at
-- the DB level; the Zod schema in app/(dashboard)/_lib/binder-actions.ts is
-- the source of truth.
--
-- Progress is computed live as |target ∩ owned_cards|. Ownership is
-- intentionally NOT joined to a binder — a card you own counts toward
-- every binder whose scope includes it. /pokedex remains the canonical
-- National Pokédex view; no default binder is auto-created.

create table public.binders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  scope_type   text not null check (scope_type in
                 ('master_set','pokemon','artist','type','position','custom')),
  scope_params jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.binder_cards (
  binder_id uuid not null references public.binders(id) on delete cascade,
  card_id   text not null,
  added_at  timestamptz not null default now(),
  primary key (binder_id, card_id)
);

create index binders_user_idx        on public.binders (user_id, created_at desc);
create index binder_cards_binder_idx on public.binder_cards (binder_id);

alter table public.binders      enable row level security;
alter table public.binder_cards enable row level security;

create policy "binders owner" on public.binders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "binder_cards via binder owner" on public.binder_cards
  for all using (
    exists (
      select 1 from public.binders b
      where b.id = binder_cards.binder_id and b.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.binders b
      where b.id = binder_cards.binder_id and b.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
