-- Trends-chart fix. `owned_cards.acquired_at` was being stamped with
-- `now()` at row creation, even when the underlying event (a pack open
-- or a singles purchase) was dated months earlier via the LogPackFlow
-- date picker. The portfolio Cards-owned / Held-value sparklines query
-- that column directly, so they could never extend further back than
-- the row's INSERT timestamp — collapsing to a couple of days of
-- history when every backdated pack was logged in one sitting.
--
-- This migration redefines `acquired_at` as "earliest known event that
-- delivered a copy of this card to this user", derived from:
--   * MIN(packs_opened.opened_at) across packs whose pack_contents
--     include the card
--   * MIN(transactions.occurred_at) across single_purchase rows for the
--     card
--
-- For manually-marked-owned rows that have no matching event source we
-- preserve whatever date was already on the row (typically `now()` from
-- when the user toggled it).
--
-- Two pieces:
--   1. `owned_cards_resync_acquired_at(user_id, card_ids)` helper RPC,
--      called by server actions after any write that could shift the
--      derived date (pack add/remove/edit/delete). Inlined into
--      `log_single_purchase` so the singles-buy path stays atomic.
--   2. One-shot backfill that re-derives `acquired_at` for every
--      existing owned row using the same logic.

create or replace function public.owned_cards_resync_acquired_at(
  _user_id uuid,
  _card_ids text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if _user_id is null or _user_id <> auth.uid() then
    raise exception 'owned_cards_resync_acquired_at: not authorized';
  end if;
  if array_length(_card_ids, 1) is null then
    return;
  end if;

  update public.owned_cards oc
     set acquired_at = coalesce(
       least(
         (select min(po.opened_at)
            from public.packs_opened po
            join public.pack_contents pc on pc.pack_id = po.id
           where po.user_id = oc.user_id and pc.card_id = oc.card_id),
         (select min(t.occurred_at)
            from public.transactions t
           where t.user_id = oc.user_id
             and t.card_id = oc.card_id
             and t.kind = 'single_purchase')
       ),
       oc.acquired_at
     )
   where oc.user_id = _user_id
     and oc.card_id = any(_card_ids);
end
$$;

revoke all on function public.owned_cards_resync_acquired_at(uuid, text[]) from public;
grant execute on function public.owned_cards_resync_acquired_at(uuid, text[]) to authenticated;

-- Same logic inlined into the singles-purchase RPC so the ledger insert,
-- the ownership bump, and the acquired_at derivation all stay in one
-- transaction.
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

  insert into public.owned_cards (user_id, card_id, quantity, acquired_at)
  values (_user_id, _card_id, _quantity, _occurred_at)
  on conflict (user_id, card_id) do update
    set quantity = owned_cards.quantity + excluded.quantity,
        acquired_at = least(owned_cards.acquired_at, excluded.acquired_at);

  return _txn_id;
end
$$;

-- One-shot backfill. Pack sources first, then singles purchases; each
-- step only writes when it would move the date earlier so manual rows
-- with no event source are untouched.
update public.owned_cards oc
   set acquired_at = src.first_at
  from (
    select po.user_id, pc.card_id, min(po.opened_at) as first_at
      from public.packs_opened po
      join public.pack_contents pc on pc.pack_id = po.id
     group by po.user_id, pc.card_id
  ) src
 where src.user_id = oc.user_id
   and src.card_id = oc.card_id
   and src.first_at < oc.acquired_at;

update public.owned_cards oc
   set acquired_at = src.first_at
  from (
    select t.user_id, t.card_id, min(t.occurred_at) as first_at
      from public.transactions t
     where t.kind = 'single_purchase' and t.card_id is not null
     group by t.user_id, t.card_id
  ) src
 where src.user_id = oc.user_id
   and src.card_id = oc.card_id
   and src.first_at < oc.acquired_at;

notify pgrst, 'reload schema';
