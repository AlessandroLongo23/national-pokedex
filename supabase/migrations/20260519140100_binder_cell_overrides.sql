-- Per-cell display override for pokedex-scope binders.
--
-- A pokedex-scope binder has one slot per dex# in its range. When the user
-- owns multiple cards for the same Pokémon, they can pick which card's art
-- to display in that slot. This table stores that choice. card_id is a hint
-- only — if the user later un-owns that card, the cell falls back to the
-- default pick (highest-rarity owned, tiebroken by id) via application code.
-- Rows for non-pokedex binders are technically allowed by the schema but
-- have no UI to set them; the action layer enforces scope_type = 'pokedex'.

create table public.binder_cell_overrides (
  binder_id uuid not null references public.binders(id) on delete cascade,
  dex       int  not null check (dex between 1 and 1025),
  card_id   text not null,
  set_at    timestamptz not null default now(),
  primary key (binder_id, dex)
);

create index binder_cell_overrides_binder_idx
  on public.binder_cell_overrides (binder_id);

alter table public.binder_cell_overrides enable row level security;

create policy "binder_cell_overrides via binder owner" on public.binder_cell_overrides
  for all using (
    exists (
      select 1 from public.binders b
      where b.id = binder_cell_overrides.binder_id and b.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.binders b
      where b.id = binder_cell_overrides.binder_id and b.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
