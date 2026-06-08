-- Per-user toggle for treating regional variants (Alolan, Galarian, Hisuian,
-- Paldean forms) as separate Pokémon instead of folding them into their base
-- Pokédex#. When ON, a placement sub-setting decides where variant slots
-- render: appended after #1025, inline next to the base form, or on a
-- dedicated /variants page. Independent of the Mega toggle — a user can enable
-- either, both, or neither.

alter table public.user_preferences
  add column treat_variants_as_separate boolean not null default false,
  add column variant_placement text not null default 'appended'
    check (variant_placement in ('appended', 'inline', 'separate'));

notify pgrst, 'reload schema';
