-- The hiring question bank (2026-10-19).
--
-- The teacher screening test (HIRING_TEST_SPEC.md) is a second track beside the
-- admissions test, sharing none of its tables: those are built round a student
-- lead, the class rule and the parent. Its questions are real exam questions
-- taken from PYQ Vault's public bank by `npm run hiring:import`, reviewed, and
-- seeded on service role by `npm run hiring:seed`.
--
--   • A new role, teacher, uses hiring and nothing else. is_staff() does not
--     name it, so every admissions policy already refuses a teacher; can_hire()
--     is the hiring tables' own gate.
--   • The shape rules mirror test_items: an MCQ is four non-empty options and
--     a key, a typed answer is a whole number the box can hold, never both.
--   • English is MCQ only, and only English carries a direction (the printed
--     "Spot the error…" line); a maths or science question must stand alone.
--   • Signed-in users only read it. The answers are public past-year keys, so
--     a teacher seeing them costs nothing; writing is the seed's alone.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_hire() returns boolean
language sql stable
as $$ select public.auth_role() in ('teacher', 'superadmin') $$;

create table public.hiring_items (
  id             uuid primary key default gen_random_uuid(),
  -- The question's id in PYQ Vault, so a re-import updates instead of duplicating.
  source_ref     text not null unique check (length(btrim(source_ref)) > 0),
  source         text not null check (source in ('nda', 'mht-cet', 'jee-mains', 'cds')),
  -- The paper it was set in ("CDS (II) 2024 — English"), for staff.
  paper          text not null check (length(btrim(paper)) > 0),
  subject        text not null check (subject in ('maths', 'physics', 'chemistry', 'english')),
  chapter        text not null check (length(btrim(chapter)) > 0),
  format         text not null check (format in ('mcq', 'numeric')),
  direction      text check (direction is null or char_length(btrim(direction)) between 1 and 160),
  stem           text not null check (length(btrim(stem)) > 0),
  options        jsonb,
  answer_key     text check (answer_key in ('A', 'B', 'C', 'D')),
  numeric_answer numeric,
  status         text not null default 'review' check (status in ('review', 'live', 'retired')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- `is not null` before jsonb_typeof: a NULL inside a CHECK passes it
  -- (migration 0002's lesson), so every branch must be false, never NULL.
  constraint hiring_items_format_pairing check (
    (
      format = 'mcq'
      and options is not null
      and jsonb_typeof(options) = 'object'
      and options ?& array['A', 'B', 'C', 'D']
      and length(btrim(coalesce(options ->> 'A', ''))) > 0
      and length(btrim(coalesce(options ->> 'B', ''))) > 0
      and length(btrim(coalesce(options ->> 'C', ''))) > 0
      and length(btrim(coalesce(options ->> 'D', ''))) > 0
      and answer_key is not null
      and numeric_answer is null
    )
    or (
      format = 'numeric'
      and numeric_answer is not null
      and numeric_answer between 0 and 9999
      and numeric_answer = trunc(numeric_answer)
      and answer_key is null
      and options is null
    )
  ),
  constraint hiring_items_english_mcq check (subject <> 'english' or format = 'mcq'),
  constraint hiring_items_direction_english check (direction is null or subject = 'english')
);

-- The draw filters on exactly these.
create index hiring_items_draw_idx on public.hiring_items (status, subject, format);

create trigger hiring_items_touch
  before update on public.hiring_items
  for each row execute function public.touch_updated_at();

alter table public.hiring_items enable row level security;

create policy hiring_items_read on public.hiring_items
  for select to authenticated using (public.can_hire());

-- Supabase grants every table to anon and authenticated by default; take that
-- back. Reading is the only thing a signed-in user may do.
revoke all on public.hiring_items from anon, authenticated;
grant select on public.hiring_items to authenticated;
