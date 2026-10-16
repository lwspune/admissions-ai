-- Paper tests (2026-10-16)
--
-- Some candidates sit the test at the institute, on paper. A paper test is the
-- same frozen paper as an online one — same draw, class rule, shape and
-- three-issue cap — printed with an OMR answer sheet that is scanned later.
--
--   • assessments.mode: 'online' (the default, a link) or 'paper'.
--   • assessments.paper_no: a six-digit number printed and pre-bubbled on the
--     sheet. The scanner reads it to find the paper, so it is unique, and it
--     always comes from paper_no_seq.
--   • Only a counsellor or superadmin makes a paper test: printing shows every
--     question, and telecallers never see question text. A trigger, not the
--     issue function, because staff may write `assessments` directly
--     (assessments_staff_all) and a check inside the function alone could be
--     walked round with a plain insert.
--   • Mode and paper number never change. Flipping a paper test to online
--     would make its unused token a working link.
--   • A paper test stays open three days, for the sheets to be scanned.
--   • At most 18 numeric questions, the OMR sheet's fixed boxes
--     (NUMERIC_SLOTS in src/lib/omr/layout.ts). live_pool() now returns each
--     item's format so this can be counted: the function runs as the caller,
--     and migration 0008 hides unissued items from non-superadmin staff, so a
--     count over test_items would see nothing and pass.
-- ─────────────────────────────────────────────────────────────────────────────

create sequence public.paper_no_seq as integer start with 100000 minvalue 100000 maxvalue 999999 no cycle;

alter table public.assessments
  add column mode text not null default 'online' check (mode in ('online', 'paper')),
  add column paper_no integer unique check (paper_no between 100000 and 999999),
  add constraint assessments_paper_no_is_paper check ((mode = 'paper') = (paper_no is not null));

-- SECURITY DEFINER so the number can be drawn without granting the sequence
-- to every staff role. The role checks read the request's JWT, which a definer
-- function sees just the same.
create or replace function public.assessments_paper_guard() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.mode = 'paper' then
      if public.auth_role() not in ('counsellor', 'superadmin')
         and coalesce(auth.role(), '') <> 'service_role' then
        raise exception 'only a counsellor or superadmin may issue a paper test'
          using errcode = 'insufficient_privilege';
      end if;
      -- Always from the sequence, whatever the client sent, as
      -- lead_comments_stamp does with authors: a chosen number could collide
      -- with one the sequence hands out later.
      new.paper_no := nextval('public.paper_no_seq');
    end if;
  elsif new.mode is distinct from old.mode or new.paper_no is distinct from old.paper_no then
    raise exception 'a test''s mode and paper number never change'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger assessments_paper_guard
  before insert or update on public.assessments
  for each row execute function public.assessments_paper_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- live_pool(p_class): now with each item's format
--
-- Format is no secret — a candidate sees it on every question. The return
-- type changes, so drop and recreate; otherwise as migration 0014.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.live_pool(smallint);

create function public.live_pool(p_class smallint)
returns table (id uuid, subject text, difficulty text, part text, format text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.subject, t.difficulty, t.part, t.format
  from public.test_items t
  where t.status = 'live'
    and p_class between 8 and 12
    and (
      (t.part = 'basics' and t.taught_in <= p_class - 1)
      or (t.part = 'syllabus' and t.taught_in = p_class - 1 and t.term = 1)
    )
    and (public.is_staff() or auth.role() = 'service_role')
$$;

revoke all on function public.live_pool(smallint) from public;
grant execute on function public.live_pool(smallint) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- issue_assessment: takes a mode
--
-- As migration 0014, plus p_mode. The old four-argument function is dropped:
-- code calling it by name still resolves to this one, since p_mode has a
-- default, and two overloads would make that call ambiguous.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.issue_assessment(uuid, uuid, text, uuid[]);

create function public.issue_assessment(
  p_lead_id   uuid,
  p_issued_by uuid,
  p_token     text,
  p_item_ids  uuid[],
  p_mode      text default 'online'
) returns public.assessments
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_seq     int;
  v_class   smallint;
  v_name    text;
  v_count   int;
  v_fit     int;
  v_numeric int;
  v_shape   text;
  v_expect  text;
  v_row     public.assessments;
begin
  if p_mode is null or p_mode not in ('online', 'paper') then
    raise exception 'a test is online or paper, got %', p_mode
      using errcode = 'check_violation';
  end if;

  v_count := coalesce(array_length(p_item_ids, 1), 0);
  if v_count not in (15, 30) then
    raise exception 'a paper must hold 15 or 30 items, got %', v_count
      using errcode = 'check_violation';
  end if;

  if (select count(distinct x) from unnest(p_item_ids) x) <> v_count then
    raise exception 'a paper must not repeat an item'
      using errcode = 'check_violation';
  end if;

  select class_level, name into v_class, v_name from leads where id = p_lead_id;
  if not found then
    raise exception 'lead % does not exist', p_lead_id
      using errcode = 'check_violation';
  end if;
  if v_name is null then
    raise exception 'lead % has no name; add the candidate''s name before issuing', p_lead_id
      using errcode = 'check_violation';
  end if;
  if v_class is null then
    raise exception 'lead % has no admitting class; set the class before issuing', p_lead_id
      using errcode = 'check_violation';
  end if;

  select count(*), count(*) filter (where lp.format = 'numeric')
    into v_fit, v_numeric
    from public.live_pool(v_class) lp
   where lp.id = any(p_item_ids);
  if v_fit <> v_count then
    raise exception
      'paper for lead % holds an item that is not live or not drawable for class % (% of % fit)',
      p_lead_id, v_class, v_fit, v_count
      using errcode = 'check_violation';
  end if;

  if p_mode = 'paper' and v_numeric > 18 then
    raise exception 'a paper test''s answer sheet holds 18 numeric questions, this paper has %', v_numeric
      using errcode = 'check_violation';
  end if;

  -- The paper's make-up by subject and part, as one comparable string.
  select string_agg(subject || '/' || part || '=' || n, ',' order by subject, part)
    into v_shape
    from (
      select lp.subject, lp.part, count(*) as n
        from public.live_pool(v_class) lp
       where lp.id = any(p_item_ids)
       group by lp.subject, lp.part
    ) s;

  v_expect := case v_count
    when 15 then 'english/basics=5,maths/basics=5,science/basics=5'
    else 'english/basics=10,maths/basics=5,maths/syllabus=5,science/basics=5,science/syllabus=5'
  end;
  if v_shape is distinct from v_expect then
    raise exception 'a %-question paper must be %, got %', v_count, v_expect, v_shape
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

  if v_seq > 3 then
    raise exception 'lead % has already been issued 3 tests', p_lead_id
      using errcode = 'check_violation';
  end if;

  update assessments
     set state = 'voided',
         voided_by = p_issued_by,
         voided_reason = 'superseded by reissue'
   where lead_id = p_lead_id
     and state in ('issued', 'opened', 'started');

  if p_mode = 'paper' then
    -- paper_no is drawn by assessments_paper_guard.
    insert into assessments (lead_id, token, issue_seq, issued_by, question_count, limit_minutes, class_level,
                             mode, expires_at)
    values (p_lead_id, p_token, v_seq, p_issued_by, v_count, v_count, v_class,
            'paper', now() + interval '3 days')
    returning * into v_row;
  else
    insert into assessments (lead_id, token, issue_seq, issued_by, question_count, limit_minutes, class_level)
    values (p_lead_id, p_token, v_seq, p_issued_by, v_count, v_count, v_class)
    returning * into v_row;
  end if;

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
