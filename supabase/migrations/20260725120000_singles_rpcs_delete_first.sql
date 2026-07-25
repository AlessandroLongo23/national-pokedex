-- Same bug class as 20260524120000 (owned_cards_apply_delta) and
-- 20260608120400 (owned_cards_apply_deltas), never propagated to the four
-- singles RPCs that decrement owned_cards inline.
--
-- owned_cards_quantity_check is `quantity > 0`, so an UPDATE that lands on
-- zero raises before the follow-up "delete where quantity <= 0" can run:
--
--   new row for relation "owned_cards" violates check constraint
--   "owned_cards_quantity_check"
--
-- The cleanup DELETE was therefore dead code in every one of these, and
-- the failure hits the most ordinary cases, not edge cases:
--
--   delete_single_purchase  deleting the purchase of a card you own
--                           exactly that many copies of (own 1, buy-row 1)
--   edit_single_purchase    editing a purchase down so the net is zero
--   edit_single_sale        growing a sale to cover every remaining copy
--   log_single_sale         selling your last copy
--
-- Fix is the established one: DELETE the rows that would hit <= 0 first,
-- then UPDATE the survivors, so no row ever transiently holds quantity 0.

-- ── delete_single_purchase ───────────────────────────────────────────
create or replace function public.delete_single_purchase(_txn_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id uuid := auth.uid();
  _card_id text;
  _qty     int;
begin
  if _user_id is null then
    raise exception 'delete_single_purchase: not authenticated';
  end if;

  select t.card_id, coalesce(t.quantity, 0)
    into _card_id, _qty
    from public.transactions t
   where t.id = _txn_id and t.user_id = _user_id and t.kind = 'single_purchase'
   for update;
  if _card_id is null then
    raise exception 'delete_single_purchase: transaction not found';
  end if;

  delete from public.owned_cards
   where user_id = _user_id
     and card_id = _card_id
     and owned_cards.quantity - _qty <= 0;

  update public.owned_cards
     set quantity = owned_cards.quantity - _qty
   where user_id = _user_id
     and card_id = _card_id
     and owned_cards.quantity - _qty > 0;

  delete from public.transactions where id = _txn_id;
end
$$;

-- ── edit_single_purchase ─────────────────────────────────────────────
create or replace function public.edit_single_purchase(
  _txn_id            uuid,
  _quantity          integer,
  _total_cost_cents  integer,
  _currency          text,
  _occurred_at       timestamp with time zone,
  _note              text default null,
  _rate_to_eur       numeric default null,
  _variant           text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id uuid := auth.uid();
  _card_id text;
  _old_qty int;
  _delta   int;
begin
  if _user_id is null then
    raise exception 'edit_single_purchase: not authenticated';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'edit_single_purchase: quantity must be > 0';
  end if;
  if _total_cost_cents is null or _total_cost_cents < 0 then
    raise exception 'edit_single_purchase: total cost must be >= 0';
  end if;
  if _variant is not null and _variant not in ('normal','holofoil','reverseHolofoil') then
    raise exception 'edit_single_purchase: invalid variant %', _variant using errcode = '22023';
  end if;

  select t.card_id, t.quantity
    into _card_id, _old_qty
    from public.transactions t
   where t.id = _txn_id and t.user_id = _user_id and t.kind = 'single_purchase'
   for update;
  if _card_id is null then
    raise exception 'edit_single_purchase: transaction not found';
  end if;

  _delta := _quantity - _old_qty;
  if _delta > 0 then
    insert into public.owned_cards (user_id, card_id, quantity)
    values (_user_id, _card_id, _delta)
    on conflict (user_id, card_id) do update
      set quantity = owned_cards.quantity + excluded.quantity;
  elsif _delta < 0 then
    delete from public.owned_cards
     where user_id = _user_id
       and card_id = _card_id
       and owned_cards.quantity + _delta <= 0;

    update public.owned_cards
       set quantity = owned_cards.quantity + _delta
     where user_id = _user_id
       and card_id = _card_id
       and owned_cards.quantity + _delta > 0;
  end if;

  update public.transactions
     set quantity     = _quantity,
         amount_cents = -_total_cost_cents,
         currency     = _currency,
         occurred_at  = _occurred_at,
         note         = _note,
         variant      = _variant,
         rate_to_eur  = case
                          when _rate_to_eur is not null
                            and currency is distinct from _currency
                          then _rate_to_eur
                          else rate_to_eur
                        end
   where id = _txn_id;
end
$$;

-- ── edit_single_sale ─────────────────────────────────────────────────
create or replace function public.edit_single_sale(
  _txn_id                uuid,
  _quantity              integer,
  _total_proceeds_cents  integer,
  _currency              text,
  _occurred_at           timestamp with time zone,
  _note                  text default null,
  _rate_to_eur           numeric default null,
  _variant               text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id uuid := auth.uid();
  _card_id text;
  _old_qty int;
  _delta   int;
  _have    int;
begin
  if _user_id is null then
    raise exception 'edit_single_sale: not authenticated';
  end if;
  if _quantity is null or _quantity <= 0 then
    raise exception 'edit_single_sale: quantity must be > 0';
  end if;
  if _total_proceeds_cents is null or _total_proceeds_cents < 0 then
    raise exception 'edit_single_sale: total proceeds must be >= 0';
  end if;
  if _variant is not null and _variant not in ('normal','holofoil','reverseHolofoil') then
    raise exception 'edit_single_sale: invalid variant %', _variant using errcode = '22023';
  end if;

  select t.card_id, t.quantity
    into _card_id, _old_qty
    from public.transactions t
   where t.id = _txn_id and t.user_id = _user_id and t.kind = 'sale'
   for update;
  if _card_id is null then
    raise exception 'edit_single_sale: transaction not found';
  end if;

  _delta := _old_qty - _quantity;
  if _delta < 0 then
    select coalesce(quantity, 0) into _have
      from public.owned_cards
     where user_id = _user_id and card_id = _card_id;
    -- Selling exactly every remaining copy is legal; only asking for more
    -- than exists is not. The zero landing is handled by the delete below.
    if coalesce(_have, 0) < -_delta then
      raise exception
        'edit_single_sale: not enough copies to sell more (have %, need % more)',
        coalesce(_have, 0), -_delta;
    end if;
  end if;

  if _delta > 0 then
    insert into public.owned_cards (user_id, card_id, quantity)
    values (_user_id, _card_id, _delta)
    on conflict (user_id, card_id) do update
      set quantity = owned_cards.quantity + excluded.quantity;
  elsif _delta < 0 then
    delete from public.owned_cards
     where user_id = _user_id
       and card_id = _card_id
       and owned_cards.quantity + _delta <= 0;

    update public.owned_cards
       set quantity = owned_cards.quantity + _delta
     where user_id = _user_id
       and card_id = _card_id
       and owned_cards.quantity + _delta > 0;
  end if;

  update public.transactions
     set quantity     = _quantity,
         amount_cents = _total_proceeds_cents,
         currency     = _currency,
         occurred_at  = _occurred_at,
         note         = _note,
         variant      = _variant,
         rate_to_eur  = case
                          when _rate_to_eur is not null
                            and currency is distinct from _currency
                          then _rate_to_eur
                          else rate_to_eur
                        end
   where id = _txn_id;
end
$$;

-- ── log_single_sale ──────────────────────────────────────────────────
create or replace function public.log_single_sale(
  _card_id               text,
  _quantity              integer,
  _total_proceeds_cents  integer,
  _currency              text,
  _occurred_at           timestamp with time zone,
  _note                  text default null,
  _rate_to_eur           numeric default null,
  _variant               text default null
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
  if _variant is not null and _variant not in ('normal','holofoil','reverseHolofoil') then
    raise exception 'log_single_sale: invalid variant %', _variant using errcode = '22023';
  end if;

  select quantity into _have
    from public.owned_cards
   where user_id = _user_id and card_id = _card_id;

  if _have is null or _have < _quantity then
    raise exception 'log_single_sale: not enough copies (have %, want to sell %)',
      coalesce(_have, 0), _quantity;
  end if;

  insert into public.transactions
    (user_id, kind, occurred_at, amount_cents, currency, card_id, quantity, note, rate_to_eur, variant)
  values
    (_user_id, 'sale', _occurred_at, _total_proceeds_cents,
     _currency, _card_id, _quantity, _note, _rate_to_eur, _variant)
  returning id into _txn_id;

  delete from public.owned_cards
   where user_id = _user_id
     and card_id = _card_id
     and owned_cards.quantity - _quantity <= 0;

  update public.owned_cards
     set quantity = owned_cards.quantity - _quantity
   where user_id = _user_id
     and card_id = _card_id
     and owned_cards.quantity - _quantity > 0;

  return _txn_id;
end
$$;

notify pgrst, 'reload schema';
