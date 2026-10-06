-- The 30-question paper (decided 2026-10-06).
--
-- A paper is now one of two shapes. The 15-question paper is unchanged: five
-- per subject, all from the reasoning bank ("basics"). The 30-question paper is
-- ten per subject: English all basics; maths and science five basics and five
-- "syllabus" questions from exactly class N−1's first-term NCERT chapters. A
-- class gets 30 questions once its syllabus batch is live, and 15 until then.
--
-- Safe ahead of the code: older code still sends 15 basics items, which this
-- still accepts; it ignores the new columns; and the extra column live_pool()
-- returns is one it does not read.

-- ─────────────────────────────────────────────────────────────────────────────
-- test_items: which part an item belongs to, and the term of a syllabus item
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.test_items
  add column part text not null default 'basics'
    check (part in ('basics', 'syllabus')),
  add column term smallint
    check (term in (1, 2));

-- A term means something only for syllabus content, and syllabus content
-- always has one: a syllabus item without a term could never be drawn, and a
-- basics item with one would read as if it were class-specific.
alter table public.test_items
  add constraint test_items_term_iff_syllabus
  check ((part = 'syllabus') = (term is not null));

-- Syllabus content is class N−1 for an admit to N (8–12), so classes 7–11.
alter table public.test_items
  add constraint test_items_syllabus_class
  check (part = 'basics' or taught_in between 7 and 11);

-- English has no syllabus part: its ten are all basics.
alter table public.test_items
  add constraint test_items_syllabus_subject
  check (part = 'basics' or subject in ('maths', 'science'));

-- ─────────────────────────────────────────────────────────────────────────────
-- assessments: each paper records its own size, time and class
--
-- The report and the timer used one 15-minute constant for every paper. With
-- two shapes, an old 15-question attempt read against a 30-minute limit would
-- report half its time unused. The class is the one the paper was drawn for;
-- leads.class_level can change after issue.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.assessments
  add column question_count smallint not null default 15
    check (question_count in (15, 30)),
  add column limit_minutes smallint not null default 15
    check (limit_minutes between 1 and 60),
  add column class_level smallint
    check (class_level between 8 and 12);

-- Existing papers: 15 questions in 15 minutes (the defaults). Their class is
-- the lead's class today, the best record there is; a paper issued before
-- classes existed stays null.
update public.assessments a
   set class_level = l.class_level
  from public.leads l
 where l.id = a.lead_id
   and a.class_level is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- positions run to 30
--
-- The column checks were created unnamed in 0001; find them by definition so
-- the drop cannot miss and leave the 1–15 limit in force.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid in ('public.assessment_items'::regclass, 'public.attempt_answers'::regclass)
       and pg_get_constraintdef(c.oid) like '%position%15%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end
$$;

alter table public.assessment_items
  add constraint assessment_items_position_range check (position between 1 and 30);
alter table public.attempt_answers
  add constraint attempt_answers_position_range check (position between 1 and 30);

-- An answer must be to a question on the paper. Position 23 on a 15-question
-- paper is a forged or corrupt save, and grading would silently ignore it.
create or replace function public.attempt_answers_on_paper() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
      from attempts a
      join assessment_items ai on ai.assessment_id = a.assessment_id
     where a.id = new.attempt_id
       and ai.position = new.position
  ) then
    raise exception 'position % is not on this paper', new.position
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger attempt_answers_on_paper
  before insert or update of position on public.attempt_answers
  for each row execute function public.attempt_answers_on_paper();

-- ─────────────────────────────────────────────────────────────────────────────
-- live_pool(p_class): now with each item's part
--
-- Basics: taught up to class N−1, as before. Syllabus: taught in exactly
-- class N−1, first term. Mirrors isDrawableFor and isSyllabusFor in
-- src/lib/classes.ts. The return type changes, so drop and recreate.
-- ─────────────────────────────────────────────────────────────────────────────

drop function if exists public.live_pool(smallint);

create function public.live_pool(p_class smallint)
returns table (id uuid, subject text, difficulty text, part text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.subject, t.difficulty, t.part
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
-- issue_assessment: either shape, checked by subject and part
--
-- As 0012, but a paper may hold 15 or 30 items. Every item must come back from
-- live_pool(v_class), which now also means a syllabus item is this class's
-- first-term content. The per-subject, per-part counts are checked here so a
-- client cannot issue, say, 30 basics items or a 15-question paper with
-- syllabus content. The difficulty mix is the draw's job and is not rechecked.
-- The paper records its size, its time (one minute a question) and its class.
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
  v_seq    int;
  v_class  smallint;
  v_name   text;
  v_count  int;
  v_fit    int;
  v_shape  text;
  v_expect text;
  v_row    public.assessments;
begin
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

  select count(*) into v_fit
    from public.live_pool(v_class) lp
   where lp.id = any(p_item_ids);
  if v_fit <> v_count then
    raise exception
      'paper for lead % holds an item that is not live or not drawable for class % (% of % fit)',
      p_lead_id, v_class, v_fit, v_count
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

  insert into assessments (lead_id, token, issue_seq, issued_by, question_count, limit_minutes, class_level)
  values (p_lead_id, p_token, v_seq, p_issued_by, v_count, v_count, v_class)
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
