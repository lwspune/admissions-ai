-- Admissions to classes 5, 6 and 7 (decided 2026-11-15).
--
-- The rule is unchanged: an admit to class N draws basics taught up to N−1 and
-- syllabus content of exactly class N−1, first term (src/lib/classes.ts). So a
-- class 5 admit needs content tagged class 4, and the floor moves from 6 to 4.
-- The default for an untagged item stays 6; every item file carries a tag.
--
-- Widening only. The app offers a class only once its questions are live
-- (CLASSES in src/lib/classes.ts), so this can be applied ahead of the code;
-- older code never sends a class below 8. Probe: `npm run db:probe -- 0032`.

alter table public.leads drop constraint leads_class_level_admitted;
alter table public.leads
  add constraint leads_class_level_admitted
  check (class_level between 5 and 12);

-- assessments.class_level's check was created unnamed in 0014; find it by
-- definition so the drop cannot miss and leave 8–12 in force.
do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.assessments'::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%class_level%'
  loop
    execute format('alter table public.assessments drop constraint %I', r.conname);
  end loop;
end
$$;
alter table public.assessments
  add constraint assessments_class_level_admitted
  check (class_level between 5 and 12);

alter table public.test_items drop constraint test_items_taught_in_range;
alter table public.test_items
  add constraint test_items_taught_in_range
  check (taught_in between 4 and 11);

alter table public.test_items drop constraint test_items_syllabus_class;
alter table public.test_items
  add constraint test_items_syllabus_class
  check (part = 'basics' or taught_in between 4 and 11);

-- As migration 0018 but for the lower bound. issue_assessment needs no change:
-- it checks the finished paper against this function.
create or replace function public.live_pool(p_class smallint)
returns table (id uuid, subject text, difficulty text, part text, format text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.subject, t.difficulty, t.part, t.format
  from public.test_items t
  where t.status = 'live'
    and p_class between 5 and 12
    and (
      (t.part = 'basics' and t.taught_in <= p_class - 1)
      or (t.part = 'syllabus' and t.taught_in = p_class - 1 and t.term = 1)
    )
    and (public.is_staff() or auth.role() = 'service_role')
$$;
