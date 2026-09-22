-- Atomic issue, and assessment state driven by the attempt row.
--
-- PostgREST cannot run a multi-statement transaction, so issuing an assessment
-- over the REST API would insert the assessment, then its 15 items, as two
-- separate writes. A failure between them leaves an assessment with a partial
-- paper — and a candidate sitting a 9-question test scored out of 15.
--
-- The item DRAW stays in TypeScript, where it is unit tested. Only the write
-- moves here, because only the write needs a transaction.

-- ─────────────────────────────────────────────────────────────────────────────
-- issue_assessment
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.issue_assessment(
  p_lead_id   uuid,
  p_issued_by uuid,
  p_token     text,
  p_item_ids  uuid[]
) returns public.assessments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_seq int;
  v_row public.assessments;
begin
  if array_length(p_item_ids, 1) is distinct from 15 then
    raise exception 'a paper must hold exactly 15 items, got %',
      coalesce(array_length(p_item_ids, 1), 0)
      using errcode = 'check_violation';
  end if;

  -- A submitted attempt is final. Reissuing past it would let a candidate who
  -- scored badly quietly acquire a second score.
  if exists (
    select 1 from assessments
     where lead_id = p_lead_id and state = 'submitted'
  ) then
    raise exception 'lead % already has a submitted attempt', p_lead_id
      using errcode = 'check_violation';
  end if;

  select coalesce(max(issue_seq), 0) + 1 into v_seq
    from assessments where lead_id = p_lead_id;

  -- Belt and braces: the unique key plus the CHECK on issue_seq already cap
  -- this at 3, but failing here gives a readable message instead of a
  -- constraint violation.
  if v_seq > 3 then
    raise exception 'lead % has already been issued 3 tests', p_lead_id
      using errcode = 'check_violation';
  end if;

  -- Kill the previous link. Reissuing must not leave two live tokens.
  update assessments
     set state = 'voided',
         voided_by = p_issued_by,
         voided_reason = 'superseded by reissue'
   where lead_id = p_lead_id
     and state in ('issued', 'opened', 'started');

  insert into assessments (lead_id, token, issue_seq, issued_by)
  values (p_lead_id, p_token, v_seq, p_issued_by)
  returning * into v_row;

  update assessments
     set superseded_by = v_row.id
   where lead_id = p_lead_id
     and id <> v_row.id
     and state = 'voided'
     and superseded_by is null;

  insert into assessment_items (assessment_id, position, item_id)
  select v_row.id, ord, item_id
    from unnest(p_item_ids) with ordinality as t(item_id, ord);

  return v_row;
end
$$;

-- `superseded_by` was in the original design note but never made it into the
-- table. Adding it here so the reissue chain is followable on the report.
alter table public.assessments
  add column if not exists superseded_by uuid references public.assessments(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Assessment state follows the attempt
--
-- Keeping these in step from application code means two writes that can
-- disagree. A trigger makes the transition part of the same transaction as the
-- write that caused it.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.sync_assessment_state() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update assessments set state = 'started'
     where id = new.assessment_id and state in ('issued', 'opened');

  elsif tg_op = 'UPDATE'
        and new.submitted_at is not null
        and old.submitted_at is null then
    update assessments set state = 'submitted'
     where id = new.assessment_id;
  end if;

  return new;
end
$$;

drop trigger if exists attempts_sync_state_insert on public.attempts;
create trigger attempts_sync_state_insert
  after insert on public.attempts
  for each row execute function public.sync_assessment_state();

drop trigger if exists attempts_sync_state_update on public.attempts;
create trigger attempts_sync_state_update
  after update on public.attempts
  for each row execute function public.sync_assessment_state();
