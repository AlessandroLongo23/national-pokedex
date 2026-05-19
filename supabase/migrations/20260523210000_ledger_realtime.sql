-- Add the ledger tables to the realtime publication so client pages can
-- re-fetch live when rows change. Mirrors what 20260518140000 did for
-- owned_cards / wishlist_cards / set_availability. Without this, RLS
-- still works but realtime subscriptions deliver no payloads (the
-- publication doesn't include the table).
--
-- We subscribe to changes on these from /transactions to keep the
-- ledger view in sync after edits/deletes anywhere, including from
-- another tab or a cascading FK from packs_opened.

alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.psa_submissions;
alter publication supabase_realtime add table public.psa_submission_cards;
