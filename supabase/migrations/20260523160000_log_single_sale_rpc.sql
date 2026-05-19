-- Atomic stored procedure for logging a card sale. Mirrors
-- log_single_purchase from 20260523150000 — one function call writes
-- the transactions row and decrements owned_cards.quantity, so a
-- failure in either step rolls back both.
--
-- Unlike a purchase, a sale must verify the user owns enough copies
-- before decrementing. Otherwise selling more than is owned would
-- silently floor at zero (owned_cards_apply_delta behavior) and leave
-- a misleading ledger row. We raise instead so the client can show
-- the user a clear error.

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

  update public.owned_cards
     set quantity = owned_cards.quantity - _quantity
   where user_id = _user_id and card_id = _card_id;
  delete from public.owned_cards
   where user_id = _user_id and card_id = _card_id and quantity <= 0;

  return _txn_id;
end
$$;

revoke all on function public.log_single_sale(text, int, int, text, timestamptz, text) from public;
grant execute on function public.log_single_sale(text, int, int, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
