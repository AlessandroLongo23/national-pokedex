-- Add the `pokedex` scope type to binders. Unlike the card-level scopes,
-- a pokedex binder tracks *species coverage* over a dex# range — progress is
-- 'have I owned any card whose dex includes this slot?'. scope_params shape:
-- { dexFrom: int, dexTo: int }. Region presets (Kanto = 1..151, etc.) are
-- UI affordances; the stored shape is always a range.

alter table public.binders drop constraint if exists binders_scope_type_check;

alter table public.binders
  add constraint binders_scope_type_check
  check (scope_type in
    ('master_set','pokemon','artist','type','position','custom','pokedex'));

notify pgrst, 'reload schema';
