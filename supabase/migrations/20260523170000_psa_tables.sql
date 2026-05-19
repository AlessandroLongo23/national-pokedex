-- PSA grading flow:
--   psa_submissions       — one row per shipment to PSA
--   psa_submission_cards  — which cards were in that shipment, with the
--                           pre-grade value snapshot (so we can compare
--                           against the post-grade value later) and the
--                           returned grade
--   transactions.psa_submission_id — back-link from the psa_fee ledger
--                                    row to the submission it paid for
--
-- The fee transaction is the only money flow PSA emits. The grade
-- coming back is metadata, not a cash event — current ownership stays
-- unchanged in owned_cards; only the per-card row's grade and
-- post_grade_value_cents get updated.

create table public.psa_submissions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  submitted_at timestamptz not null,
  returned_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now()
);

create table public.psa_submission_cards (
  submission_id          uuid not null references public.psa_submissions(id) on delete cascade,
  card_id                text not null,
  pre_grade_value_cents  integer,
  grade                  integer check (grade is null or (grade between 1 and 10)),
  post_grade_value_cents integer,
  primary key (submission_id, card_id)
);

alter table public.psa_submissions
  add constraint psa_submissions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade not valid;

create index psa_submissions_user_submitted_idx
  on public.psa_submissions (user_id, submitted_at desc);

alter table public.transactions
  add column psa_submission_id uuid references public.psa_submissions(id) on delete cascade;

create index transactions_psa_submission_idx
  on public.transactions (psa_submission_id)
  where psa_submission_id is not null;

alter table public.psa_submissions      enable row level security;
alter table public.psa_submission_cards enable row level security;

create policy "psa_submissions owner" on public.psa_submissions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "psa_submission_cards via owner" on public.psa_submission_cards
  for all using (
    exists (
      select 1 from public.psa_submissions s
      where s.id = psa_submission_cards.submission_id
        and s.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.psa_submissions s
      where s.id = psa_submission_cards.submission_id
        and s.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
