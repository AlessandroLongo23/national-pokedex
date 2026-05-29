-- Rewrites the singles-purchase/sale/PSA RPCs to (a) accept any
-- ISO-4217 currency the app layer permits (lib/pricing/currencies.ts)
-- instead of just USD/EUR, and (b) snapshot rate_to_eur on the row so
-- historical conversions stay anchored to the rate that was true on
-- the transaction date. See 20260528120000_multi_currency.sql for the
-- column additions.
--
-- The new `_rate_to_eur` parameter is optional (defaults to NULL); the
-- app passes a Frankfurter-derived snapshot whenever it can fetch one,
-- and falls back to NULL if the FX API is unreachable. NULL is
-- harmless — the display layer falls back to today's rate, marking the
-- row as approximate.

drop function if exists public.log_single_purchase(text, int, int, text, timestamptz, text);
drop function if exists public.log_single_sale(text, int, int, text, timestamptz, text);
drop function if exists public.log_psa_submission(text[], int[], timestamptz, int, text, text);
drop function if exists public.edit_single_purchase(uuid, int, int, text, timestamptz, text);
drop function if exists public.edit_single_sale(uuid, int, int, text, timestamptz, text);

-- ─── log_single_purchase ────────────────────────────────────────────
create function public.log_single_purchase(
  _card_id          text,
  _quantity         int,
  _total_cost_cents int,
  _currency         text,
  _occurred_at      timestamptz,
  _note             text default null,
  _rate_to_eur      numeric default null
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

  insert into public.transactions
    (user_id, kind, occurred_at, amount_cents, currency, card_id, quantity, note, rate_to_eur)
  values
    (_user_id, 'single_purchase', _occurred_at, -_total_cost_cents,
     _currency, _card_id, _quantity, _note, _rate_to_eur)
  returning id into _txn_id;

  insert into public.owned_cards (user_id, card_id, quantity)
  values (_user_id, _card_id, _quantity)
  on conflict (user_id, card_id) do update
    set quantity = owned_cards.quantity + excluded.quantity;

  return _txn_id;
end
$$;

revoke all on function public.log_single_purchase(text, int, int, text, timestamptz, text, numeric) from public;
grant execute on function public.log_single_purchase(text, int, int, text, timestamptz, text, numeric) to authenticated;

-- ─── log_single_sale ────────────────────────────────────────────────
create function public.log_single_sale(
  _card_id              text,
  _quantity             int,
  _total_proceeds_cents int,
  _currency             text,
  _occurred_at          timestamptz,
  _note                 text default null,
  _rate_to_eur          numeric default null
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

  select quantity into _have
    from public.owned_cards
   where user_id = _user_id and card_id = _card_id;

  if _have is null or _have < _quantity then
    raise exception 'log_single_sale: not enough copies (have %, want to sell %)',
      coalesce(_have, 0), _quantity;
  end if;

  insert into public.transactions
    (user_id, kind, occurred_at, amount_cents, currency, card_id, quantity, note, rate_to_eur)
  values
    (_user_id, 'sale', _occurred_at, _total_proceeds_cents,
     _currency, _card_id, _quantity, _note, _rate_to_eur)
  returning id into _txn_id;

  update public.owned_cards
     set quantity = owned_cards.quantity - _quantity
   where user_id = _user_id and card_id = _card_id;
  delete from public.owned_cards
   where user_id = _user_id and card_id = _card_id and quantity <= 0;

  return _txn_id;
end
$$;

revoke all on function public.log_single_sale(text, int, int, text, timestamptz, text, numeric) from public;
grant execute on function public.log_single_sale(text, int, int, text, timestamptz, text, numeric) to authenticated;

-- ─── log_psa_submission ─────────────────────────────────────────────
create function public.log_psa_submission(
  _card_ids         text[],
  _pre_grade_values int[],
  _submitted_at     timestamptz,
  _fee_cents        int,
  _currency         text,
  _note             text default null,
  _rate_to_eur      numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id        uuid := auth.uid();
  _submission_id  uuid;
  _n              int;
begin
  if _user_id is null then
    raise exception 'log_psa_submission: not authenticated';
  end if;
  _n := coalesce(array_length(_card_ids, 1), 0);
  if _n = 0 then
    raise exception 'log_psa_submission: at least one card required';
  end if;
  if _pre_grade_values is not null
     and coalesce(array_length(_pre_grade_values, 1), 0) <> _n then
    raise exception 'log_psa_submission: pre_grade_values length must match card_ids length';
  end if;
  if _fee_cents is null or _fee_cents < 0 then
    raise exception 'log_psa_submission: fee must be >= 0';
  end if;

  insert into public.psa_submissions (user_id, submitted_at, note)
  values (_user_id, _submitted_at, _note)
  returning id into _submission_id;

  insert into public.psa_submission_cards (submission_id, card_id, pre_grade_value_cents)
  select _submission_id, c.card_id, c.pre_grade
    from unnest(
      _card_ids,
      coalesce(_pre_grade_values, array_fill(null::int, array[_n]))
    ) as c(card_id, pre_grade);

  if _fee_cents > 0 then
    insert into public.transactions
      (user_id, kind, occurred_at, amount_cents, currency, psa_submission_id, note, rate_to_eur)
    values
      (_user_id, 'psa_fee', _submitted_at, -_fee_cents, _currency, _submission_id, _note, _rate_to_eur);
  end if;

  return _submission_id;
end
$$;

revoke all on function public.log_psa_submission(text[], int[], timestamptz, int, text, text, numeric) from public;
grant execute on function public.log_psa_submission(text[], int[], timestamptz, int, text, text, numeric) to authenticated;

-- ─── edit_single_purchase ───────────────────────────────────────────
create function public.edit_single_purchase(
  _txn_id           uuid,
  _quantity         int,
  _total_cost_cents int,
  _currency         text,
  _occurred_at      timestamptz,
  _note             text default null,
  _rate_to_eur      numeric default null
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

  -- Snapshot rule: keep the existing rate_to_eur when the currency
  -- didn't change (preserve ledger truth from the original date). Only
  -- overwrite when the caller actually passes a new rate AND the
  -- currency changed — same date with a different currency means we
  -- need a fresh today's-rate snapshot.
  update public.transactions
     set quantity     = _quantity,
         amount_cents = -_total_cost_cents,
         currency     = _currency,
         occurred_at  = _occurred_at,
         note         = _note,
         rate_to_eur  = case
                          when _rate_to_eur is not null
                            and currency is distinct from _currency
                          then _rate_to_eur
                          else rate_to_eur
                        end
   where id = _txn_id;
end
$$;

revoke all on function public.edit_single_purchase(uuid, int, int, text, timestamptz, text, numeric) from public;
grant execute on function public.edit_single_purchase(uuid, int, int, text, timestamptz, text, numeric) to authenticated;

-- ─── edit_single_sale ───────────────────────────────────────────────
create function public.edit_single_sale(
  _txn_id               uuid,
  _quantity             int,
  _total_proceeds_cents int,
  _currency             text,
  _occurred_at          timestamptz,
  _note                 text default null,
  _rate_to_eur          numeric default null
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
         rate_to_eur  = case
                          when _rate_to_eur is not null
                            and currency is distinct from _currency
                          then _rate_to_eur
                          else rate_to_eur
                        end
   where id = _txn_id;
end
$$;

revoke all on function public.edit_single_sale(uuid, int, int, text, timestamptz, text, numeric) from public;
grant execute on function public.edit_single_sale(uuid, int, int, text, timestamptz, text, numeric) to authenticated;

notify pgrst, 'reload schema';
