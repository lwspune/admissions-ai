-- Aptitude Screening Test — initial schema
-- Spec: APTITUDE_TEST_SPEC.md §3
--
-- Principle throughout: constraints enforce the rules, not application `if`s.
-- The candidate-facing API runs as service role and bypasses RLS; staff access
-- is governed by the policies at the bottom of this file.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- Role helper. Reads app_metadata, NEVER user_metadata — the latter is
-- self-editable by the signed-in user and would let anyone grant themselves
-- superadmin. (Hardening lesson carried over from nda-tracker.)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.auth_role() returns text
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb
      -> 'app_metadata' ->> 'role',
    ''
  )
$$;

create or replace function public.is_staff() returns boolean
language sql stable
as $$ select public.auth_role() in ('telecaller', 'counsellor', 'superadmin') $$;

create or replace function public.is_superadmin() returns boolean
language sql stable
as $$ select public.auth_role() = 'superadmin' $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- leads
--
-- No UNIQUE on contact_mobile: the link goes to the parent, so siblings share a
-- number and a hard constraint would make the second child unenterable. The
-- create form surfaces existing leads on the number and forces an explicit
-- "open existing / add sibling" choice instead.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(trim(name)) > 0),
  contact_mobile  text not null check (contact_mobile ~ '^[6-9][0-9]{9}$'),
  student_mobile  text check (student_mobile ~ '^[6-9][0-9]{9}$'),
  city            text,
  school          text,
  board           text,
  class_level     text,
  consented_at    timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index leads_contact_mobile_idx on public.leads (contact_mobile);

-- ─────────────────────────────────────────────────────────────────────────────
-- test_items — the bank
--
-- `rationale` is NOT NULL on purpose: a wrong answer key is the failure that
-- hides for six months, and making the author state why the key is right is
-- what surfaces it at review.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.test_items (
  id                uuid primary key default gen_random_uuid(),
  subject           text not null check (subject in ('maths', 'english', 'science')),
  skill             text not null,
  difficulty        text not null check (difficulty in ('easy', 'moderate', 'difficult')),
  format            text not null check (format in ('mcq', 'numeric')),
  stem              text not null check (length(trim(stem)) > 0),
  options           jsonb,
  answer_key        text check (answer_key in ('A', 'B', 'C', 'D')),
  numeric_answer    numeric,
  numeric_tolerance numeric not null default 0 check (numeric_tolerance >= 0),
  rationale         text not null check (length(trim(rationale)) > 0),
  status            text not null default 'review'
                      check (status in ('review', 'live', 'retired')),
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- An MCQ has exactly options A-D plus a key and no numeric answer;
  -- a numeric item is the exact inverse. Neither shape can be half-built.
  constraint test_items_format_pairing check (
    (
      format = 'mcq'
      and jsonb_typeof(options) = 'object'
      and options ?& array['A', 'B', 'C', 'D']
      and answer_key is not null
      and numeric_answer is null
    )
    or (
      format = 'numeric'
      and numeric_answer is not null
      and answer_key is null
      and options is null
    )
  )
);

-- The draw filters on exactly these three columns (spec §6).
create index test_items_draw_idx
  on public.test_items (status, subject, difficulty);

-- ─────────────────────────────────────────────────────────────────────────────
-- assessments — one issued test
-- ─────────────────────────────────────────────────────────────────────────────
create table public.assessments (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  token         text not null unique check (length(token) >= 22),
  issue_seq     int  not null check (issue_seq between 1 and 3),
  issued_by     uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '2 hours'),
  state         text not null default 'issued'
                  check (state in ('issued', 'opened', 'started',
                                   'submitted', 'expired', 'voided')),
  voided_by     uuid references auth.users(id),
  voided_reason text,

  -- Caps reissues at 3 per lead in the database, not in the UI.
  constraint assessments_one_per_seq unique (lead_id, issue_seq),
  constraint assessments_window_positive check (expires_at > created_at),
  constraint assessments_void_has_reason check (
    (state <> 'voided') or (voided_reason is not null)
  )
);

create index assessments_lead_idx on public.assessments (lead_id);
create index assessments_state_idx on public.assessments (state, expires_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- assessment_items — the frozen paper
--
-- Drawn at issue time and never touched again. A paper must not change under a
-- candidate mid-attempt.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.assessment_items (
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  position      int  not null check (position between 1 and 15),
  item_id       uuid not null references public.test_items(id),

  primary key (assessment_id, position),
  constraint assessment_items_no_repeat unique (assessment_id, item_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- attempts
-- ─────────────────────────────────────────────────────────────────────────────
create table public.attempts (
  id             uuid primary key default gen_random_uuid(),
  assessment_id  uuid not null unique
                   references public.assessments(id) on delete cascade,
  started_at     timestamptz not null default now(),
  active_ms      int not null default 0 check (active_ms >= 0),
  deadline_at    timestamptz not null,
  submitted_at   timestamptz,
  submit_reason  text check (submit_reason in ('manual', 'timer', 'window')),

  score          numeric,
  correct        int check (correct >= 0),
  incorrect      int check (incorrect >= 0),
  skipped        int check (skipped >= 0),
  maths_score    numeric,
  english_score  numeric,
  science_score  numeric,

  user_agent     text,
  ip             inet,
  screen         text,

  -- Submitted and graded are the same moment; neither half exists alone.
  constraint attempts_submit_consistent check (
    (submitted_at is null) = (submit_reason is null)
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- attempt_answers — per-question save
--
-- The composite PK is the upsert target, which is what makes saving each answer
-- idempotent under a flaky mobile connection.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.attempt_answers (
  attempt_id          uuid not null references public.attempts(id) on delete cascade,
  position            int  not null check (position between 1 and 15),
  choice              text check (choice in ('A', 'B', 'C', 'D')),
  numeric_value       numeric,
  active_ms           int not null default 0 check (active_ms >= 0),
  change_count        int not null default 0 check (change_count >= 0),
  changed_after_pause boolean not null default false,
  last_answered_at    timestamptz,

  primary key (attempt_id, position),
  -- An answer is one shape or the other, never both.
  constraint attempt_answers_one_shape check (
    choice is null or numeric_value is null
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- attempt_events — raw telemetry, append-only
--
-- Captured and displayed as plain facts. Deliberately NOT scored or weighted
-- (spec §7, §12): there is no data yet to calibrate weights against.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.attempt_events (
  id         bigserial primary key,
  attempt_id uuid not null references public.attempts(id) on delete cascade,
  at         timestamptz not null default now(),
  kind       text not null check (kind in (
               'pause', 'resume', 'paste', 'copy',
               'blur', 'focus', 'answer_set', 'nav', 'context')),
  position   int,
  payload    jsonb not null default '{}'
);

create index attempt_events_attempt_idx on public.attempt_events (attempt_id, at);

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql
as $$ begin new.updated_at = now(); return new; end $$;

create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();
create trigger test_items_touch before update on public.test_items
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row level security
--
-- Every table is RLS-enabled with no anon policy. The public candidate route
-- reaches these tables only through a service-role client with an explicit
-- field allow-list, so the anon key can never see test_items.answer_key.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.leads             enable row level security;
alter table public.test_items        enable row level security;
alter table public.assessments       enable row level security;
alter table public.assessment_items  enable row level security;
alter table public.attempts          enable row level security;
alter table public.attempt_answers   enable row level security;
alter table public.attempt_events    enable row level security;

-- Staff manage leads and issue assessments.
create policy leads_staff_all on public.leads
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy assessments_staff_all on public.assessments
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- The bank is readable by staff (the report joins it) but writable only by
-- superadmin: promoting an item to 'live' is the answer-key sign-off.
create policy test_items_staff_read on public.test_items
  for select to authenticated using (public.is_staff());
create policy test_items_superadmin_write on public.test_items
  for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- Attempt data is written by the service-role candidate API only.
-- Staff read it for the report; nobody writes it through this path.
create policy assessment_items_staff_read on public.assessment_items
  for select to authenticated using (public.is_staff());
create policy attempts_staff_read on public.attempts
  for select to authenticated using (public.is_staff());
create policy attempt_answers_staff_read on public.attempt_answers
  for select to authenticated using (public.is_staff());
create policy attempt_events_staff_read on public.attempt_events
  for select to authenticated using (public.is_staff());
