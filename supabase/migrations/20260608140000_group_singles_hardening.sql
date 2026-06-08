-- Hardening for the bulk-lot / grouping feature, from adversarial review.
--
-- 1. card_lots.currency was created with a USD/EUR-only check, but the app
--    supports the full SUPPORTED_CURRENCIES list (LedgerCurrency = Currency)
--    and packs_opened/transactions already use a permissive ISO-shape check
--    (20260528120000_multi_currency.sql). Bulk lots in e.g. GBP would fail
--    the table check. Relax it to match the rest of the app; the real
--    allow-list is enforced app-side (lib/pricing/currencies isCurrency).
--
-- 2. group_singles_into_lot trusted _single_ids without confirming they all
--    resolve to the caller's single_purchase rows. If a single was deleted
--    between page load and save (or a malformed/foreign id was passed), the
--    consumed CTE silently found fewer rows, so cards from the missing single
--    got a positive net delta — incorrectly inflating owned_cards while the
--    row was not actually consumed. Now we (a) require a non-empty grouping
--    set, (b) reject duplicate card ids before they hit the lot_contents PK,
--    and (c) raise if any requested single doesn't resolve, BEFORE any write,
--    so the whole operation rolls back and the user retries with fresh data.
--    Also relax the RPC's currency guard to the same ISO-shape check.

alter table public.card_lots
  drop constraint if exists card_lots_currency_check;
alter table public.card_lots
  add constraint card_lots_currency_shape_check
  check (currency is null or currency ~ '^[A-Z]{3}$');

create or replace function public.group_singles_into_lot(
  _card_ids      text[],
  _quantities    int[],
  _cost_cents    int,
  _currency      text,
  _purchased_at  timestamptz,
  _rate_to_eur   numeric,
  _single_ids    uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _user_id uuid := auth.uid();
  _lot_id  uuid;
  _n int := coalesce(array_length(_card_ids, 1), 0);
  _pa timestamptz := coalesce(_purchased_at, now());
  _delta_cards text[];
  _delta_vals  int[];
  _union_cards text[];
begin
  if _user_id is null then
    raise exception 'group_singles_into_lot: not authenticated';
  end if;
  if _n = 0 or _n <> coalesce(array_length(_quantities, 1), 0) then
    raise exception 'group_singles_into_lot: invalid contents';
  end if;
  if _n <> (select count(distinct x) from unnest(_card_ids) as x) then
    raise exception 'group_singles_into_lot: duplicate card ids';
  end if;
  if _cost_cents is not null and (_currency is null or _currency !~ '^[A-Z]{3}$') then
    raise exception 'group_singles_into_lot: invalid currency %', _currency;
  end if;
  if array_length(_single_ids, 1) is null then
    raise exception 'group_singles_into_lot: no singles to consume';
  end if;
  -- Every requested single must resolve to one of the caller's single_purchase
  -- rows. Raise (rolling back) if any is missing — closes the race where a
  -- single was deleted between page load and save (which would otherwise
  -- silently inflate owned_cards).
  if (select count(distinct t.id)
        from public.transactions t
       where t.user_id = _user_id
         and t.kind = 'single_purchase'
         and t.id = any(_single_ids))
     <> (select count(distinct x) from unnest(_single_ids) as x) then
    raise exception 'group_singles_into_lot: some selected purchases no longer exist';
  end if;

  insert into public.card_lots (user_id, purchased_at, cost_cents, currency, rate_to_eur)
  values (
    _user_id, _pa,
    _cost_cents,
    case when _cost_cents is null then null else _currency end,
    case when _cost_cents is null then null else _rate_to_eur end
  )
  returning id into _lot_id;

  insert into public.lot_contents (lot_id, card_id, quantity)
    select _lot_id, card_id, qty
      from unnest(_card_ids, _quantities) as f(card_id, qty);

  with consumed as (
    select t.card_id, sum(t.quantity)::int as qty
      from public.transactions t
     where t.user_id = _user_id
       and t.kind = 'single_purchase'
       and t.id = any(_single_ids)
     group by t.card_id
  ),
  final as (
    select card_id, qty from unnest(_card_ids, _quantities) as f(card_id, qty)
  ),
  deltas as (
    select coalesce(f.card_id, c.card_id) as card_id,
           coalesce(f.qty, 0) - coalesce(c.qty, 0) as delta
      from final f
      full outer join consumed c on c.card_id = f.card_id
  )
  select
    array_agg(card_id) filter (where delta <> 0),
    array_agg(delta)   filter (where delta <> 0),
    array_agg(distinct card_id)
  into _delta_cards, _delta_vals, _union_cards
  from deltas;

  if _delta_cards is not null and array_length(_delta_cards, 1) > 0 then
    perform public.owned_cards_apply_deltas(_user_id, _delta_cards, _delta_vals);
  end if;

  delete from public.transactions
   where user_id = _user_id
     and kind = 'single_purchase'
     and id = any(_single_ids);

  if _cost_cents is not null then
    insert into public.transactions
      (user_id, kind, occurred_at, amount_cents, currency, lot_id, rate_to_eur)
    values
      (_user_id, 'lot_purchase', _pa, -_cost_cents, _currency, _lot_id, _rate_to_eur);
  end if;

  if _union_cards is not null and array_length(_union_cards, 1) > 0 then
    perform public.owned_cards_resync_acquired_at(_user_id, _union_cards);
  end if;

  return _lot_id;
end
$$;

notify pgrst, 'reload schema';
