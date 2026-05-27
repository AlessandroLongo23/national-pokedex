-- Per-user toggle for treating Mega Evolutions as separate Pokémon
-- (instead of folding them into their base Pokédex#). When ON, a placement
-- sub-setting decides where Mega slots render: appended after #1025, inline
-- next to the base form, or on a dedicated /megas page.

alter table public.user_preferences
  add column treat_megas_as_separate boolean not null default false,
  add column mega_placement text not null default 'appended'
    check (mega_placement in ('appended', 'inline', 'separate'));

notify pgrst, 'reload schema';
