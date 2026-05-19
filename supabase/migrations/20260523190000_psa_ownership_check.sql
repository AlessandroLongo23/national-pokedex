-- Tighten log_psa_submission to reject card_ids the caller doesn't own.
-- The NewPsaModal already filters its search results to owned cards
-- client-side, but the RPC has to be the source of truth — without
-- this check, anyone hitting the RPC directly could submit arbitrary
-- card_ids that aren't in their collection.
--
-- "Own" means at least one copy in owned_cards. Quantity stays unchanged
-- by submission (the cards are physically at PSA but still the user's).
-- Submitting more cards than owned of the same id is allowed: if the
-- user has 3 copies, they can send all 3 to PSA in one submission.

create or replace function public.log_psa_submission(
  _card_ids         text[],
  _pre_grade_values int[],
  _submitted_at     timestamptz,
  _fee_cents        int,
  _currency         text,
  _note             text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  _user_id        uuid := auth.uid();
  _submission_id  uuid;
  _n              int;
  _unowned        text;
begin
  if _user_id is null then
    raise exception 'log_psa_submission: not authenticated';
  end if;
  _n := coalesce(array_length(_card_ids, 1), 0);
  if _n = 0 then
    raise exception 'log_psa_submission: at least one card required';
  end if;
  if _pre_grade_values is not null
     and coalesce(array_length(_pre_grade_values, 1), 0) <> _n then
    raise exception 'log_psa_submission: pre_grade_values length must match card_ids length';
  end if;
  if _fee_cents is null or _fee_cents < 0 then
    raise exception 'log_psa_submission: fee must be >= 0';
  end if;
  if _currency not in ('USD','EUR') then
    raise exception 'log_psa_submission: invalid currency %', _currency;
  end if;

  -- Reject any card_id the user doesn't currently own. Picks the first
  -- offender for the error message so the client can point to it.
  select c into _unowned
    from unnest(_card_ids) as c
    left join public.owned_cards oc
      on oc.user_id = _user_id and oc.card_id = c
   where oc.card_id is null
   limit 1;
  if _unowned is not null then
    raise exception 'log_psa_submission: card % is not in your collection', _unowned;
  end if;

  insert into public.psa_submissions (user_id, submitted_at, note)
  values (_user_id, _submitted_at, _note)
  returning id into _submission_id;

  insert into public.psa_submission_cards (submission_id, card_id, pre_grade_value_cents)
  select _submission_id, c.card_id, c.pre_grade
    from unnest(
      _card_ids,
      coalesce(_pre_grade_values, array_fill(null::int, array[_n]))
    ) as c(card_id, pre_grade);

  if _fee_cents > 0 then
    insert into public.transactions
      (user_id, kind, occurred_at, amount_cents, currency, psa_submission_id, note)
    values
      (_user_id, 'psa_fee', _submitted_at, -_fee_cents, _currency, _submission_id, _note);
  end if;

  return _submission_id;
end
$$;

notify pgrst, 'reload schema';
