-- Quantity tracking. Collectors often hold more than one copy of the
-- same card — duplicate pulls, traded-in commons, a chase card and a
-- spare. Until now owned_cards was binary (presence = owned, absence =
-- not). This migration adds a positive `quantity` column so the UI can
-- show a count, pack-logging can bump duplicates instead of no-oping,
-- and portfolio valuations can credit the second copy of a $40 card.
--
-- Every existing row already represents at least one copy, so the
-- backfill is the column default (1). The check constraint enforces the
-- invariant that "absence of row = quantity 0": qty > 0 means a row
-- exists, qty == 0 means the row was deleted.

alter table public.owned_cards
  add column quantity integer not null default 1
  check (quantity > 0);

-- Atomic upsert: bumps `quantity` by `_delta` for each card in
-- `_card_ids`. Positive deltas insert rows when none exist; negative
-- deltas reduce qty and delete rows that hit zero. Used by pack-log
-- (pull → +1), pack-edit (added → +1 / removed → −1), pack-delete
-- (pack contents → −1), and the per-tile stepper.
--
-- Runs as security definer so it bypasses RLS, but guards by checking
-- `_user_id = auth.uid()` so a caller can only mutate their own rows.
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
    update public.owned_cards
       set quantity = owned_cards.quantity + _delta
     where owned_cards.user_id = _user_id
       and owned_cards.card_id = any(_card_ids);
    delete from public.owned_cards
     where owned_cards.user_id = _user_id
       and owned_cards.card_id = any(_card_ids)
       and owned_cards.quantity <= 0;
  end if;

  return query
    select oc.card_id, oc.quantity
      from public.owned_cards oc
     where oc.user_id = _user_id
       and oc.card_id = any(_card_ids);
end
$$;

revoke all on function public.owned_cards_apply_delta(uuid, text[], int) from public;
grant execute on function public.owned_cards_apply_delta(uuid, text[], int) to authenticated;

-- Set the absolute quantity for a single card. `_qty = 0` deletes the
-- row (the stepper's "remove" path); positive values insert/update.
-- Same auth guard as owned_cards_apply_delta.
create or replace function public.owned_cards_set_quantity(
  _user_id uuid,
  _card_id text,
  _qty int
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  final_qty int;
begin
  if _user_id is null or _user_id <> auth.uid() then
    raise exception 'owned_cards_set_quantity: not authorized';
  end if;
  if _qty < 0 then
    raise exception 'owned_cards_set_quantity: quantity must be >= 0';
  end if;

  if _qty = 0 then
    delete from public.owned_cards
     where user_id = _user_id and card_id = _card_id;
    return 0;
  end if;

  insert into public.owned_cards (user_id, card_id, quantity)
  values (_user_id, _card_id, _qty)
  on conflict (user_id, card_id) do update
    set quantity = excluded.quantity
    returning quantity into final_qty;

  return final_qty;
end
$$;

revoke all on function public.owned_cards_set_quantity(uuid, text, int) from public;
grant execute on function public.owned_cards_set_quantity(uuid, text, int) to authenticated;

notify pgrst, 'reload schema';
