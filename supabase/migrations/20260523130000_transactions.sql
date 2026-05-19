-- The ledger that backs §9 of BACKLOG.md. One canonical table that records
-- every signed cash event affecting the user (negative=money out,
-- positive=money in). Specific flows hang off `pack_id` (for pack
-- purchases) and `psa_submission_id` (added by a later migration).
--
-- Kinds:
--   pack_purchase    — cash out at pack open, linked to packs_opened.id
--   single_purchase  — cash out for a singles buy, links via card_id+quantity
--   sale             — cash in for selling N copies of a card
--   psa_fee          — cash out for a PSA submission (per-submission fee)
--
-- amount_cents is the user's signed cash effect, so
--   sum(amount_cents) = net cash flow over a period (per currency).
--
-- pack_purchase rows are FK-cascaded by packs_opened: deleting a pack
-- removes its purchase record automatically. updatePack mirrors the cost
-- on packs_opened back into the matching row (see pack-actions.ts).

create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  kind          text not null check (kind in (
                  'pack_purchase','single_purchase','sale','psa_fee'
                )),
  occurred_at   timestamptz not null default now(),
  amount_cents  integer not null,
  currency      text not null check (currency in ('USD','EUR')),
  pack_id       uuid references public.packs_opened(id) on delete cascade,
  card_id       text,
  quantity      integer check (quantity is null or quantity > 0),
  note          text,
  created_at    timestamptz not null default now()
);

create index transactions_user_time_idx on public.transactions (user_id, occurred_at desc);
create index transactions_user_kind_idx on public.transactions (user_id, kind);
create unique index transactions_pack_purchase_uniq
  on public.transactions (pack_id)
  where kind = 'pack_purchase';

alter table public.transactions
  add constraint transactions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

alter table public.transactions enable row level security;

create policy "transactions owner" on public.transactions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Backfill: any pack already logged with a cost in phase 1 gets its
-- matching pack_purchase row. Skip nulls (cost not entered).
insert into public.transactions
  (user_id, kind, occurred_at, amount_cents, currency, pack_id)
select
  p.user_id,
  'pack_purchase',
  p.opened_at,
  -p.cost_cents,
  p.currency,
  p.id
from public.packs_opened p
where p.cost_cents is not null
  and p.currency   is not null;

notify pgrst, 'reload schema';
