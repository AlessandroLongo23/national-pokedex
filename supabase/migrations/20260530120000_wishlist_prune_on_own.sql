-- Owned and wishlisted are mutually exclusive states: once you've found or
-- bought a card, it no longer belongs on the "want" list. Until now nothing
-- enforced that — a card could sit in both tables at once, so the wishlist
-- page showed cards the user already owned.
--
-- An AFTER INSERT trigger on owned_cards prunes the matching wishlist row the
-- moment a card becomes owned. This covers every path that creates ownership
-- (per-tile toggle, bulk upsert, pack-logging via owned_cards_apply_delta, the
-- set-quantity RPC) without each call site needing to remember to clean up.
-- INSERT-only is sufficient: a quantity bump on an already-owned card fires
-- AFTER UPDATE, and that card was already pruned when it was first owned.
--
-- The delete propagates to clients through the existing wishlist_cards realtime
-- publication, so the WishlistContext drops the card without a refetch.

create or replace function public.prune_wishlist_on_own()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.wishlist_cards
   where user_id = new.user_id
     and card_id = new.card_id;
  return new;
end;
$$;

drop trigger if exists owned_cards_prune_wishlist on public.owned_cards;
create trigger owned_cards_prune_wishlist
  after insert on public.owned_cards
  for each row
  execute function public.prune_wishlist_on_own();

-- Backfill: drop any wishlist rows for cards the user already owns.
delete from public.wishlist_cards w
 using public.owned_cards o
 where w.user_id = o.user_id
   and w.card_id = o.card_id;
