-- Bugfix: `log_single_sale` and `owned_cards_apply_delta` (negative
-- branch) both did UPDATE-then-DELETE when reducing quantity. The
-- `owned_cards_quantity_check (quantity > 0)` constraint fires on the
-- UPDATE before the DELETE can run, so selling the last copy of a card
-- (or any apply_delta that takes a row to zero) raised:
--
--   new row for relation "owned_cards" violates check constraint
--   "owned_cards_quantity_check"
--
-- Fix: DELETE the to-be-zeroed rows first, then UPDATE the survivors.
-- No row ever transiently holds quantity = 0, so the strict check
-- (which encodes "absence of row = zero") stays intact.

create or replace function public.log_single_sale(
  _card_id          text,
  _quantity         int,
  _total_proceeds_cents int,
  _currency         text,
  _occurred_at      timestamptz,
  _note             text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id uuid := auth.uid();
  _txn_id  uuid;
  _have    int;
begin
  if _user_id is null then
    raise exception 'log_single_sale: not authenticated';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'log_single_sale: quantity must be > 0';
  end if;
  if _total_proceeds_cents is null or _total_proceeds_cents < 0 then
    raise exception 'log_single_sale: total proceeds must be >= 0';
  end if;
  if _currency not in ('USD','EUR') then
    raise exception 'log_single_sale: invalid currency %', _currency;
  end if;

  select quantity into _have
    from public.owned_cards
   where user_id = _user_id and card_id = _card_id;

  if _have is null or _have < _quantity then
    raise exception 'log_single_sale: not enough copies (have %, want to sell %)',
      coalesce(_have, 0), _quantity;
  end if;

  insert into public.transactions
    (user_id, kind, occurred_at, amount_cents, currency, card_id, quantity, note)
  values
    (_user_id, 'sale', _occurred_at, _total_proceeds_cents,
     _currency, _card_id, _quantity, _note)
  returning id into _txn_id;

  if _have = _quantity then
    delete from public.owned_cards
     where user_id = _user_id and card_id = _card_id;
  else
    update public.owned_cards
       set quantity = owned_cards.quantity - _quantity
     where user_id = _user_id and card_id = _card_id;
  end if;

  return _txn_id;
end
$$;

revoke all on function public.log_single_sale(text, int, int, text, timestamptz, text) from public;
grant execute on function public.log_single_sale(text, int, int, text, timestamptz, text) to authenticated;

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
    delete from public.owned_cards
     where owned_cards.user_id = _user_id
       and owned_cards.card_id = any(_card_ids)
       and owned_cards.quantity + _delta <= 0;
    update public.owned_cards
       set quantity = owned_cards.quantity + _delta
     where owned_cards.user_id = _user_id
       and owned_cards.card_id = any(_card_ids)
       and owned_cards.quantity + _delta > 0;
  end if;

  return query
    select oc.card_id, oc.quantity
      from public.owned_cards oc
     where oc.user_id = _user_id
       and oc.card_id = any(_card_ids);
end
$$;

notify pgrst, 'reload schema';
