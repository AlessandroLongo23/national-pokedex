-- Consolidate N single_purchase transactions into one bulk lot, atomically.
-- Creates the lot + contents + lot_purchase row, deletes the consumed
-- singles, and adjusts owned_cards by the NET delta per card
-- (final_lot_qty - sum(consumed_single_qty)). For a pure group the net is
-- zero, so ownership and spend are unchanged — only the representation.
-- Reuses owned_cards_apply_deltas (delete-to-zero-first) and
-- owned_cards_resync_acquired_at, both security-definer with their own
-- auth.uid() guard which passes because _user_id = auth.uid() here too.

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
  if _cost_cents is not null and (_currency is null or _currency not in ('USD','EUR')) then
    raise exception 'group_singles_into_lot: invalid currency %', _currency;
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

  -- Net owned delta per card over the union of final-lot and consumed-single cards.
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

revoke all on function public.group_singles_into_lot(text[], int[], int, text, timestamptz, numeric, uuid[]) from public;
grant execute on function public.group_singles_into_lot(text[], int[], int, text, timestamptz, numeric, uuid[]) to authenticated;

notify pgrst, 'reload schema';
