-- Admissions to class 8.
--
-- The rule is unchanged — an admit to class N draws content taught up to N-1
-- (src/lib/classes.ts) — so a class 8 admit draws taught_in <= 7. Measured
-- before shipping: 71 of 105 items, every stratum fillable; the thin cells are
-- maths/difficult (4) and science/difficult (3).
--
-- Widening only. Code older than this cannot offer class 8 and is otherwise
-- unaffected, so this can be applied ahead of the deploy.

alter table public.leads drop constraint leads_class_level_admitted;
alter table public.leads
  add constraint leads_class_level_admitted
  check (class_level between 8 and 12);

-- Same body as 0011 but for the lower bound. issue_assessment needs no change:
-- it checks the finished paper against this function.
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
    and p_class between 8 and 12
    and t.taught_in <= p_class - 1
    and (public.is_staff() or auth.role() = 'service_role')
$$;
