-- owned_cards_apply_delta returned a table (card_id text, quantity int),
-- which made `card_id` and `quantity` OUT parameters that shadow the
-- column names inside the body. ON CONFLICT (user_id, card_id) then
-- triggered "column reference 'card_id' is ambiguous" at runtime.
--
-- The fix is the per-function `#variable_conflict use_column` directive,
-- which tells PL/pgSQL to resolve unqualified identifiers as columns
-- (not variables) on conflict. Body otherwise unchanged from
-- 20260522120000_owned_cards_quantity.sql.

create or replace function public.owned_cards_apply_delta(
  _user_id uuid,
  _card_ids text[],
  _delta int
)
returns table (card_id text, quantity int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if _user_id is null or _user_id <> auth.uid() then
    raise exception 'owned_cards_apply_delta: not authorized';
  end if;
  if _delta = 0 or array_length(_card_ids, 1) is null then
    return;
  end if;

  if _delta > 0 then
    insert into public.owned_cards (user_id, card_id, quantity)
    select _user_id, c, _delta
      from unnest(_card_ids) as c
    on conflict (user_id, card_id) do update
      set quantity = owned_cards.quantity + excluded.quantity;
  else
    update public.owned_cards
       set quantity = owned_cards.quantity + _delta
     where owned_cards.user_id = _user_id
       and owned_cards.card_id = any(_card_ids);
    delete from public.owned_cards
     where owned_cards.user_id = _user_id
       and owned_cards.card_id = any(_card_ids)
       and owned_cards.quantity <= 0;
  end if;

  return query
    select oc.card_id, oc.quantity
      from public.owned_cards oc
     where oc.user_id = _user_id
       and oc.card_id = any(_card_ids);
end
$$;

notify pgrst, 'reload schema';
