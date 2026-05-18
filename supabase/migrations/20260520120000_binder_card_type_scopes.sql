-- Add the `subtype` and `named_card` scope types to binders. These extend the
-- multi-binder system to cover the non-Pokémon side of the catalog (BACKLOG §6).
--
-- subtype scope_params: { subtype: "trainers"|"items"|"supporters"|"stadiums"|"tools"|"energies" }
-- named_card scope_params: { name: string } — all printings of a card by exact name match.
--
-- scope_params shape is still NOT validated at the DB level; the Zod schema in
-- app/(dashboard)/_lib/binder-actions.ts is the source of truth.

alter table public.binders drop constraint if exists binders_scope_type_check;

alter table public.binders
  add constraint binders_scope_type_check
  check (scope_type in
    ('master_set','pokemon','artist','type','position','custom','pokedex','subtype','named_card'));

notify pgrst, 'reload schema';
