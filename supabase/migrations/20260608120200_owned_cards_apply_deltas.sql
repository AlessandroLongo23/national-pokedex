-- Parallel-array sibling of owned_cards_apply_delta. Lots carry a
-- per-card quantity, so logging/editing/deleting a lot needs a *different*
-- delta per card (qty 2->3 = +1, removed = -old, added = +new). The
-- single-delta RPC can't express that. _card_ids[i] gets _deltas[i].
-- Positive deltas upsert (insert or add); negative deltas subtract and
-- delete rows that hit zero. Same security-definer + auth.uid() guard.

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

  -- Negative deltas: subtract on existing rows.
  update public.owned_cards oc
     set quantity = oc.quantity + d.delta
    from unnest(_card_ids, _deltas) as d(card_id, delta)
   where d.delta < 0
     and oc.user_id = _user_id
     and oc.card_id = d.card_id;

  -- Floor at zero: absence of row = quantity 0.
  delete from public.owned_cards
   where user_id = _user_id
     and card_id = any(_card_ids)
     and quantity <= 0;
end
$$;

revoke all on function public.owned_cards_apply_deltas(uuid, text[], int[]) from public;
grant execute on function public.owned_cards_apply_deltas(uuid, text[], int[]) to authenticated;

notify pgrst, 'reload schema';
