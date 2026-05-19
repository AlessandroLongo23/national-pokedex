-- Edit/delete RPCs for single_purchase and sale transactions.
-- Mirrors the create-side log_single_purchase / log_single_sale: every
-- inventory delta and ledger write happen inside one function call so a
-- partial failure can't leave the books out of sync with the cards.
--
-- For edits, the function computes the net owned_cards delta between
-- the old quantity and the new quantity, validates it (sales can only
-- reduce inventory the user actually holds), and applies it. Pack
-- purchases stay handled by the existing pack-actions flow.

-- ─── edit_single_purchase ────────────────────────────────────────────
-- A purchase that bought N at $X currently contributes +N to owned and
-- -N*X to the ledger. Editing to N' at $X' must:
--   1. shift owned by (N' - N)
--   2. update the transactions row's amount/quantity/etc.

create or replace function public.edit_single_purchase(
  _txn_id           uuid,
  _quantity         int,
  _total_cost_cents int,
  _currency         text,
  _occurred_at      timestamptz,
  _note             text default null
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
  if _currency not in ('USD','EUR') then
    raise exception 'edit_single_purchase: invalid currency %', _currency;
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

  update public.transactions
     set quantity     = _quantity,
         amount_cents = -_total_cost_cents,
         currency     = _currency,
         occurred_at  = _occurred_at,
         note         = _note
   where id = _txn_id;
end
$$;

revoke all on function public.edit_single_purchase(uuid, int, int, text, timestamptz, text) from public;
grant execute on function public.edit_single_purchase(uuid, int, int, text, timestamptz, text) to authenticated;

-- ─── delete_single_purchase ──────────────────────────────────────────
-- Undoes a purchase: take back N copies from owned and remove the row.

create or replace function public.delete_single_purchase(
  _txn_id uuid
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
  _qty     int;
begin
  if _user_id is null then
    raise exception 'delete_single_purchase: not authenticated';
  end if;

  select t.card_id, t.quantity
    into _card_id, _qty
    from public.transactions t
   where t.id = _txn_id and t.user_id = _user_id and t.kind = 'single_purchase'
   for update;
  if _card_id is null then
    raise exception 'delete_single_purchase: transaction not found';
  end if;

  update public.owned_cards
     set quantity = owned_cards.quantity - _qty
   where user_id = _user_id and card_id = _card_id;
  delete from public.owned_cards
   where user_id = _user_id and card_id = _card_id and quantity <= 0;

  delete from public.transactions where id = _txn_id;
end
$$;

revoke all on function public.delete_single_purchase(uuid) from public;
grant execute on function public.delete_single_purchase(uuid) to authenticated;

-- ─── edit_single_sale ────────────────────────────────────────────────
-- A sale of N at $X has already removed N copies from owned. Editing to
-- N' at $X' must shift owned by (N - N'): positive if we're un-selling,
-- negative if selling more (which must be backed by current inventory).

create or replace function public.edit_single_sale(
  _txn_id               uuid,
  _quantity             int,
  _total_proceeds_cents int,
  _currency             text,
  _occurred_at          timestamptz,
  _note                 text default null
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
  if _currency not in ('USD','EUR') then
    raise exception 'edit_single_sale: invalid currency %', _currency;
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
  -- positive _delta = un-sold copies coming back into owned
  -- negative _delta = selling more, must verify we still have enough
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
         note         = _note
   where id = _txn_id;
end
$$;

revoke all on function public.edit_single_sale(uuid, int, int, text, timestamptz, text) from public;
grant execute on function public.edit_single_sale(uuid, int, int, text, timestamptz, text) to authenticated;

-- ─── delete_single_sale ──────────────────────────────────────────────
-- Undoes a sale: copies come back into owned, ledger row is removed.

create or replace function public.delete_single_sale(
  _txn_id uuid
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
  _qty     int;
begin
  if _user_id is null then
    raise exception 'delete_single_sale: not authenticated';
  end if;

  select t.card_id, t.quantity
    into _card_id, _qty
    from public.transactions t
   where t.id = _txn_id and t.user_id = _user_id and t.kind = 'sale'
   for update;
  if _card_id is null then
    raise exception 'delete_single_sale: transaction not found';
  end if;

  insert into public.owned_cards (user_id, card_id, quantity)
  values (_user_id, _card_id, _qty)
  on conflict (user_id, card_id) do update
    set quantity = owned_cards.quantity + excluded.quantity;

  delete from public.transactions where id = _txn_id;
end
$$;

revoke all on function public.delete_single_sale(uuid) from public;
grant execute on function public.delete_single_sale(uuid) to authenticated;

notify pgrst, 'reload schema';
