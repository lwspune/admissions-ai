-- Hindi versions of maths and science questions (decided 2026-10-11).
--
-- A candidate can switch a maths or science question to Hindi. English
-- questions stay English: they test English, and translated they would be
-- different questions. The Hindi is a second rendering of the same item, so
-- the answer key, the numeric answer and the option order stay shared, which
-- is why it lives on test_items rather than in an item of its own.
--
-- Safe ahead of the code: older code selects test_items(*) for the paper and
-- builds the candidate payload from an allow-list, so the new columns never
-- reach a candidate; and it sends no 'lang' events.

-- ─────────────────────────────────────────────────────────────────────────────
-- test_items: the Hindi stem and options
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.test_items
  add column stem_hi text,
  add column options_hi jsonb;

-- Either no Hindi, or a whole Hindi version: a stem, and on an MCQ exactly
-- options A-D, none blank. Never on English. Each `is not null` comes before
-- the expression it guards, so no branch can evaluate to NULL and pass (the
-- hole migration 0002 closed in the English shape).
alter table public.test_items
  add constraint test_items_hindi_shape check (
    (stem_hi is null and options_hi is null)
    or (
      stem_hi is not null
      and length(trim(stem_hi)) > 0
      and subject in ('maths', 'science')
      and (
        (format = 'numeric' and options_hi is null)
        or (
          format = 'mcq'
          and options_hi is not null
          and jsonb_typeof(options_hi) = 'object'
          and options_hi ?& array['A', 'B', 'C', 'D']
          and (options_hi - array['A', 'B', 'C', 'D']) = '{}'::jsonb
          and length(trim(coalesce(options_hi ->> 'A', ''))) > 0
          and length(trim(coalesce(options_hi ->> 'B', ''))) > 0
          and length(trim(coalesce(options_hi ->> 'C', ''))) > 0
          and length(trim(coalesce(options_hi ->> 'D', ''))) > 0
        )
      )
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- The Hindi of a question on a test in progress does not change
--
-- A frozen paper fixes which items it holds, not their text: the candidate's
-- screen reads test_items when the test starts and again on every resume. So
-- a Hindi correction is refused while any candidate is mid-test on a paper
-- holding the item. The window bounds it: an abandoned test stops blocking
-- when its link expires. A correction that changes the meaning is not made
-- here at all; the item is retired and replaced.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.test_items_hindi_frozen() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
      from assessment_items ai
      join assessments s on s.id = ai.assessment_id
     where ai.item_id = new.id
       and s.state = 'started'
       and s.expires_at > now()
  ) then
    raise exception 'item % is on a test in progress; change its Hindi once that test ends',
      coalesce(new.ref, new.id::text)
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger test_items_hindi_frozen
  before update of stem_hi, options_hi on public.test_items
  for each row
  when (old.stem_hi is distinct from new.stem_hi or old.options_hi is distinct from new.options_hi)
  execute function public.test_items_hindi_frozen();

-- ─────────────────────────────────────────────────────────────────────────────
-- set_hindi(rows): load one reviewed batch of translations, all or nothing
--
-- `npm run items:hindi -- --file <batch>` is the sign-off for a batch, as
-- `items:seed -- --live --file` is for answer keys. A partial upsert cannot do
-- it (Postgres checks NOT NULL on the row it would insert before it finds the
-- conflict), and row-by-row PATCHes would leave half a batch loaded when one
-- row fails. Security invoker: it writes only where the caller may already
-- write test_items, which is service role and superadmin.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_hindi(p_rows jsonb) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  r jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'set_hindi takes a JSON array of {ref, stem_hi, options_hi}'
      using errcode = 'check_violation';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    update test_items
       set stem_hi = r ->> 'stem_hi',
           options_hi = nullif(r -> 'options_hi', 'null'::jsonb)
     where ref = r ->> 'ref';
    if not found then
      raise exception 'no item with ref %', r ->> 'ref'
        using errcode = 'check_violation';
    end if;
    n := n + 1;
  end loop;

  return n;
end
$$;

revoke all on function public.set_hindi(jsonb) from public, anon, authenticated;
grant execute on function public.set_hindi(jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- attempt_events: a 'lang' event when the candidate switches language
--
-- The kind check was created unnamed in 0001; find it by definition so the
-- drop cannot miss and leave the old list in force.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r record;
begin
  for r in
    select c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid = 'public.attempt_events'::regclass
       and pg_get_constraintdef(c.oid) like '%answer_set%'
  loop
    execute format('alter table public.attempt_events drop constraint %I', r.conname);
  end loop;
end
$$;

alter table public.attempt_events
  add constraint attempt_events_kind check (kind in (
    'pause', 'resume', 'paste', 'copy',
    'blur', 'focus', 'answer_set', 'nav', 'context', 'lang'));
