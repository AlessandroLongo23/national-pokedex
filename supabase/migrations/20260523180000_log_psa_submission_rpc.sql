-- Atomic stored procedure for creating a PSA submission. One call
-- writes:
--   - the psa_submissions header row
--   - one psa_submission_cards row per card_id (with optional
--     pre_grade_value_cents snapshot, supplied by the caller — usually
--     the server action that fetched current market prices)
--   - one transactions row of kind='psa_fee' (amount = -fee, linked
--     back to the submission via psa_submission_id) when the fee is > 0
--
-- card_ids and pre_grade_values are parallel arrays. The server action
-- is responsible for keeping them aligned. Pass NULL in pre_grade_values
-- for a card without a known price.

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

revoke all on function public.log_psa_submission(text[], int[], timestamptz, int, text, text) from public;
grant execute on function public.log_psa_submission(text[], int[], timestamptz, int, text, text) to authenticated;

notify pgrst, 'reload schema';
