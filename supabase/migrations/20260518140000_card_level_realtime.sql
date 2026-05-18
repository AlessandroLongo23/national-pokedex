-- Restore realtime publication membership lost when the card-level refactor
-- dropped owned_pokemon. Without these entries the supabase-js postgres_changes
-- subscriptions in OwnedCardsContext, WishlistContext and SetAvailabilityContext
-- never fire, so optimistic toggles silently revert when the transition ends.
alter publication supabase_realtime add table public.owned_cards;
alter publication supabase_realtime add table public.wishlist_cards;
alter publication supabase_realtime add table public.set_availability;
