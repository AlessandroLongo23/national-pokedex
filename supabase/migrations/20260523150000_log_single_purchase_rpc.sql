-- Atomic stored procedure for logging a singles purchase. Replaces the
-- two-call pattern (insert into transactions, then rpc apply_delta) the
-- server action was using — a failure between the two left orphan
-- ledger rows with no matching owned_cards increment.
--
-- All work happens inside one function call, so if the owned_cards
-- update fails the inserted transactions row is rolled back too.
--
-- Phase 4 will add a parallel `log_single_sale` for the inverse flow.

create or replace function public.log_single_purchase(
  _card_id          text,
  _quantity         int,
  _total_cost_cents int,
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
begin
  if _user_id is null then
    raise exception 'log_single_purchase: not authenticated';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'log_single_purchase: quantity must be > 0';
  end if;
  if _total_cost_cents is null or _total_cost_cents < 0 then
    raise exception 'log_single_purchase: total cost must be >= 0';
  end if;
  if _currency not in ('USD','EUR') then
    raise exception 'log_single_purchase: invalid currency %', _currency;
  end if;

  insert into public.transactions
    (user_id, kind, occurred_at, amount_cents, currency, card_id, quantity, note)
  values
    (_user_id, 'single_purchase', _occurred_at, -_total_cost_cents,
     _currency, _card_id, _quantity, _note)
  returning id into _txn_id;

  insert into public.owned_cards (user_id, card_id, quantity)
  values (_user_id, _card_id, _quantity)
  on conflict (user_id, card_id) do update
    set quantity = owned_cards.quantity + excluded.quantity;

  return _txn_id;
end
$$;

revoke all on function public.log_single_purchase(text, int, int, text, timestamptz, text) from public;
grant execute on function public.log_single_purchase(text, int, int, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
