-- Class-scoped papers.
--
-- Students are admitted to classes 9, 10, 11 and 12, and a class 9 admit was
-- being drawn the same pool as a class 12 admit: probability, acids and bases,
-- electric power. The rule, stated once in src/lib/classes.ts and enforced
-- here: **an admit to class N is tested on content taught up to class N-1.**
--
-- Two facts and one rule. `leads.class_level` becomes the class being admitted
-- to (not the current class -- in April a student who has finished class 10 is
-- in nobody's class). `test_items.taught_in` is the class in which the item's
-- content is taught, a fact an author can state; whether that is fair for a
-- given admit is derived, never tagged. The floor, 6, is what an untagged item
-- carries, and it is drawable by every admit, so the bank behaves exactly as
-- before until somebody raises a tag.
--
-- Written against production holding four leads: two at class_level '11' and
-- two null. Anything that does not cast to an integer fails this migration on
-- purpose -- fix the row, do not guess.

-- ─────────────────────────────────────────────────────────────────────────────
-- leads.class_level: free text -> the four admitted classes
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.leads
  alter column class_level type smallint
  using nullif(trim(class_level), '')::smallint;

alter table public.leads
  add constraint leads_class_level_admitted
  check (class_level between 9 and 12);

-- ─────────────────────────────────────────────────────────────────────────────
-- test_items.taught_in
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.test_items
  add column taught_in smallint not null default 6
  constraint test_items_taught_in_range check (taught_in between 6 and 11);

comment on column public.test_items.taught_in is
  'Class in which this item''s content is taught. 6 = open to every admit. An admit to class N draws taught_in <= N-1.';

-- ─────────────────────────────────────────────────────────────────────────────
-- live_pool(p_class): the draw's door into the bank, now per class
--
-- Replaces the zero-argument version outright rather than overloading it. An
-- unfiltered pool left callable is a pool some caller will keep using, and the
-- only cost of dropping it is that code older than this migration cannot issue
-- until it is redeployed -- which fails closed, with a readable error.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.live_pool();

create or replace function public.live_pool(p_class smallint)
returns table (id uuid, subject text, difficulty text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.subject, t.difficulty
  from public.test_items t
  where t.status = 'live'
    and p_class between 9 and 12
    and t.taught_in <= p_class - 1
    and (public.is_staff() or auth.role() = 'service_role')
$$;

revoke all on function public.live_pool(smallint) from public;
grant execute on function public.live_pool(smallint) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- issue_assessment: the paper must fit the lead's class
--
-- The TypeScript draw filters through live_pool(); this is the rule. It checks
-- the paper against live_pool(v_class) rather than against test_items
-- directly, because the function runs as the caller and migration 0008 hides
-- unissued items from non-superadmin staff. A direct EXISTS would find nothing
-- for a counsellor and pass vacuously -- the same shape of failure 0009 fixed.
-- live_pool() is SECURITY DEFINER and sees the whole live bank.
--
-- Requiring all 15 to come back from the pool also enforces, for the first
-- time, that only LIVE items are ever issued.
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
  v_seq   int;
  v_class smallint;
  v_fit   int;
  v_row   public.assessments;
begin
  if array_length(p_item_ids, 1) is distinct from 15 then
    raise exception 'a paper must hold exactly 15 items, got %',
      coalesce(array_length(p_item_ids, 1), 0)
      using errcode = 'check_violation';
  end if;

  select class_level into v_class from leads where id = p_lead_id;
  if not found then
    raise exception 'lead % does not exist', p_lead_id
      using errcode = 'check_violation';
  end if;
  if v_class is null then
    raise exception 'lead % has no admitting class; set the class before issuing', p_lead_id
      using errcode = 'check_violation';
  end if;

  select count(*) into v_fit
    from public.live_pool(v_class) lp
   where lp.id = any(p_item_ids);
  if v_fit <> 15 then
    raise exception
      'paper for lead % holds an item that is not live or is above the class % content ceiling (% of 15 fit)',
      p_lead_id, v_class, v_fit
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
