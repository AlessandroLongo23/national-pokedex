-- acquired_at is "earliest known event that delivered a copy of this
-- card to this user." Bulk lots are now a third source alongside packs
-- and single purchases. Extends the least(...) with MIN(card_lots.purchased_at).

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
             and t.kind = 'single_purchase'),
         (select min(cl.purchased_at)
            from public.card_lots cl
            join public.lot_contents lc on lc.lot_id = cl.id
           where cl.user_id = oc.user_id and lc.card_id = oc.card_id)
       ),
       oc.acquired_at
     )
   where oc.user_id = _user_id
     and oc.card_id = any(_card_ids);
end
$$;

notify pgrst, 'reload schema';
