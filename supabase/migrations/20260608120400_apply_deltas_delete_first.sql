-- Bugfix for owned_cards_apply_deltas (added in 20260608120200): the
-- negative branch did UPDATE-then-DELETE, but owned_cards_quantity_check
-- (quantity > 0) fires on the UPDATE before the DELETE can run, so
-- decrementing a card to zero (e.g. deleting a bulk lot that held the
-- last copy) raised:
--
--   new row for relation "owned_cards" violates check constraint
--   "owned_cards_quantity_check"
--
-- Same class of bug — and same fix — as 20260524120000 did for the
-- single-delta owned_cards_apply_delta: DELETE the to-be-zeroed rows
-- first, then UPDATE the survivors. No row ever transiently holds
-- quantity = 0.

create or replace function public.owned_cards_apply_deltas(
  _user_id  uuid,
  _card_ids text[],
  _deltas   int[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _n int := coalesce(array_length(_card_ids, 1), 0);
begin
  if _user_id is null or _user_id <> auth.uid() then
    raise exception 'owned_cards_apply_deltas: not authorized';
  end if;
  if _n = 0 then
    return;
  end if;
  if _n <> coalesce(array_length(_deltas, 1), 0) then
    raise exception 'owned_cards_apply_deltas: card/delta length mismatch';
  end if;

  -- Positive deltas: upsert and add.
  insert into public.owned_cards (user_id, card_id, quantity)
  select _user_id, d.card_id, d.delta
    from unnest(_card_ids, _deltas) as d(card_id, delta)
   where d.delta > 0
  on conflict (user_id, card_id) do update
    set quantity = owned_cards.quantity + excluded.quantity;

  -- Negative deltas: DELETE rows that would hit <= 0 FIRST (the check
  -- constraint fires on an UPDATE-to-zero before a later DELETE could
  -- run), then UPDATE the survivors.
  delete from public.owned_cards oc
   using unnest(_card_ids, _deltas) as d(card_id, delta)
   where d.delta < 0
     and oc.user_id = _user_id
     and oc.card_id = d.card_id
     and oc.quantity + d.delta <= 0;

  update public.owned_cards oc
     set quantity = oc.quantity + d.delta
    from unnest(_card_ids, _deltas) as d(card_id, delta)
   where d.delta < 0
     and oc.user_id = _user_id
     and oc.card_id = d.card_id
     and oc.quantity + d.delta > 0;
end
$$;

notify pgrst, 'reload schema';
