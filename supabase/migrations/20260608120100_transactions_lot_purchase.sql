-- Bulk-lot purchases hang off transactions.lot_id, exactly like
-- pack_purchase rows hang off pack_id. One lot_purchase row per lot,
-- amount = -cost_cents. Deleting the lot cascades the ledger row.

alter table public.transactions
  add column lot_id uuid references public.card_lots(id) on delete cascade;

alter table public.transactions
  drop constraint transactions_kind_check;

alter table public.transactions
  add constraint transactions_kind_check check (kind in (
    'pack_purchase','single_purchase','sale','psa_fee','lot_purchase'
  ));

create unique index transactions_lot_purchase_uniq
  on public.transactions (lot_id)
  where kind = 'lot_purchase';

notify pgrst, 'reload schema';
