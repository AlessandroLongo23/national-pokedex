-- Extends the four singles RPCs with a trailing `_variant` parameter so
-- the client can record which printing was bought/sold. The parameter
-- is optional (default NULL) — callers that don't know the variant
-- (or that we'd rather not annotate) get the same NULL fallback as
-- pre-migration rows.
--
-- Variant is added at the END of the signature so existing named-arg
-- call sites in transaction-actions.ts keep working unchanged until
-- updated. The PSA RPC is intentionally NOT touched: PSA submissions
-- are per-fee, not per-card-printing.

drop function if exists public.log_single_purchase(text, int, int, text, timestamptz, text, numeric);
drop function if exists public.log_single_sale(text, int, int, text, timestamptz, text, numeric);
drop function if exists public.edit_single_purchase(uuid, int, int, text, timestamptz, text, numeric);
drop function if exists public.edit_single_sale(uuid, int, int, text, timestamptz, text, numeric);

-- ─── log_single_purchase ────────────────────────────────────────────
create function public.log_single_purchase(
  _card_id          text,
  _quantity         int,
  _total_cost_cents int,
  _currency         text,
  _occurred_at      timestamptz,
  _note             text default null,
  _rate_to_eur      numeric default null,
  _variant          text default null
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
  if _variant is not null and _variant not in ('normal','holofoil','reverseHolofoil') then
    raise exception 'log_single_purchase: invalid variant %', _variant using errcode = '22023';
  end if;

  insert into public.transactions
    (user_id, kind, occurred_at, amount_cents, currency, card_id, quantity, note, rate_to_eur, variant)
  values
    (_user_id, 'single_purchase', _occurred_at, -_total_cost_cents,
     _currency, _card_id, _quantity, _note, _rate_to_eur, _variant)
  returning id into _txn_id;

  insert into public.owned_cards (user_id, card_id, quantity)
  values (_user_id, _card_id, _quantity)
  on conflict (user_id, card_id) do update
    set quantity = owned_cards.quantity + excluded.quantity;

  return _txn_id;
end
$$;

revoke all on function public.log_single_purchase(text, int, int, text, timestamptz, text, numeric, text) from public;
grant execute on function public.log_single_purchase(text, int, int, text, timestamptz, text, numeric, text) to authenticated;

-- ─── log_single_sale ────────────────────────────────────────────────
create function public.log_single_sale(
  _card_id              text,
  _quantity             int,
  _total_proceeds_cents int,
  _currency             text,
  _occurred_at          timestamptz,
  _note                 text default null,
  _rate_to_eur          numeric default null,
  _variant              text default null
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

  update public.owned_cards
     set quantity = owned_cards.quantity - _quantity
   where user_id = _user_id and card_id = _card_id;
  delete from public.owned_cards
   where user_id = _user_id and card_id = _card_id and quantity <= 0;

  return _txn_id;
end
$$;

revoke all on function public.log_single_sale(text, int, int, text, timestamptz, text, numeric, text) from public;
grant execute on function public.log_single_sale(text, int, int, text, timestamptz, text, numeric, text) to authenticated;

-- ─── edit_single_purchase ───────────────────────────────────────────
create function public.edit_single_purchase(
  _txn_id           uuid,
  _quantity         int,
  _total_cost_cents int,
  _currency         text,
  _occurred_at      timestamptz,
  _note             text default null,
  _rate_to_eur      numeric default null,
  _variant          text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id   uuid := auth.uid();
  _card_id   text;
  _old_qty   int;
  _delta     int;
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
    update public.owned_cards
       set quantity = owned_cards.quantity + _delta
     where user_id = _user_id and card_id = _card_id;
    delete from public.owned_cards
     where user_id = _user_id and card_id = _card_id and quantity <= 0;
  end if;

  -- Snapshot rule on rate_to_eur is preserved from 20260528120100.
  -- Variant is overwritten unconditionally — it represents the user's
  -- declared truth about the printing, not derived state.
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

revoke all on function public.edit_single_purchase(uuid, int, int, text, timestamptz, text, numeric, text) from public;
grant execute on function public.edit_single_purchase(uuid, int, int, text, timestamptz, text, numeric, text) to authenticated;

-- ─── edit_single_sale ───────────────────────────────────────────────
create function public.edit_single_sale(
  _txn_id               uuid,
  _quantity             int,
  _total_proceeds_cents int,
  _currency             text,
  _occurred_at          timestamptz,
  _note                 text default null,
  _rate_to_eur          numeric default null,
  _variant              text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id  uuid := auth.uid();
  _card_id  text;
  _old_qty  int;
  _delta    int;
  _have     int;
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
    update public.owned_cards
       set quantity = owned_cards.quantity + _delta
     where user_id = _user_id and card_id = _card_id;
    delete from public.owned_cards
     where user_id = _user_id and card_id = _card_id and quantity <= 0;
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

revoke all on function public.edit_single_sale(uuid, int, int, text, timestamptz, text, numeric, text) from public;
grant execute on function public.edit_single_sale(uuid, int, int, text, timestamptz, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';
