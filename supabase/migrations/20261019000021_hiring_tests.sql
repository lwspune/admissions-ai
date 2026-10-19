-- Issuing and taking a teacher screening test (2026-10-19). HIRING_TEST_SPEC.md.
--
--   • An applicant belongs to whoever added them. A teacher sees only their
--     own applicants and everything under them; superadmin sees all. The
--     creator is stamped from the session, never taken from the client.
--   • issue_hiring_test() is the only way a test is made: it draws the paper
--     itself (per subject: MCQ then typed answers, at most two questions a
--     chapter, nothing this applicant has seen), voids the applicant's earlier
--     link, and stops at three issues. No two papers in a subject may hold the
--     same set: hiring_tests_one_set, retried on a collision.
--   • The applicant's side runs on service role (the API), as the admissions
--     candidate's does. A started attempt's deadline is set here — start plus
--     the paper's minutes — and the clock does not pause: copying is accepted
--     for this screen, so the student test's pause machinery buys nothing.
--     The 24-hour window is the time to start, not a cap on a started paper.
--   • Answers are refused once submitted or past the deadline (30 s grace for
--     a save in flight), and must fit the question: a letter for an MCQ, a
--     whole number 0–9999 for a typed answer.
--   • Grading is SQL (submit_hiring_attempt), with the admissions marks:
--     +1, −0.25 for a wrong MCQ, 0 for a wrong typed answer or a skip.
--     close_expired_hiring_attempts() grades any attempt whose time ran out
--     unsubmitted (the applicant closed the page).
--   • Candidate data: kept 12 months like a lead's (purge, step 3).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.can_see_applicant(p_created_by uuid) returns boolean
language sql stable
as $$ select public.can_hire() and (public.auth_role() = 'superadmin' or p_created_by = auth.uid()) $$;

-- ── applicants ──────────────────────────────────────────────────────────────

create table public.hiring_applicants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  -- Ten digits, normalised by the app (src/lib/mobile.ts), as on leads.
  mobile     text not null check (mobile ~ '^[6-9][0-9]{9}$'),
  subject    text not null check (subject in ('maths', 'physics', 'chemistry', 'english')),
  -- Set null if the login is deleted: superadmin still sees the applicant.
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index hiring_applicants_creator_idx on public.hiring_applicants (created_by, created_at desc);

create or replace function public.hiring_applicants_stamp() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'an applicant is added by a signed-in teacher or superadmin' using errcode = 'insufficient_privilege';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end
$$;

create trigger hiring_applicants_stamp
  before insert on public.hiring_applicants
  for each row execute function public.hiring_applicants_stamp();

-- ── tests ───────────────────────────────────────────────────────────────────

create table public.hiring_tests (
  id             uuid primary key default gen_random_uuid(),
  applicant_id   uuid not null references public.hiring_applicants(id) on delete cascade,
  token          text not null unique check (token ~ '^[0-9A-Za-z]{22}$'),
  issue_seq      int  not null check (issue_seq between 1 and 3),
  subject        text not null check (subject in ('maths', 'physics', 'chemistry', 'english')),
  question_count int  not null check (question_count = 15),
  limit_minutes  int  not null check (limit_minutes between 1 and 60),
  -- md5 of the sorted question ids: what "the same set" means.
  item_set       text not null,
  state          text not null default 'issued'
                   check (state in ('issued', 'opened', 'started', 'submitted', 'voided')),
  issued_by      uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '24 hours',
  unique (applicant_id, issue_seq),
  constraint hiring_tests_window_positive check (expires_at > created_at)
);

create unique index hiring_tests_one_set on public.hiring_tests (subject, item_set);

create table public.hiring_test_items (
  test_id  uuid not null references public.hiring_tests(id) on delete cascade,
  position int  not null check (position between 1 and 15),
  item_id  uuid not null references public.hiring_items(id),
  primary key (test_id, position),
  unique (test_id, item_id)
);

-- A paper never changes under an applicant. Deleting goes only by cascade.
create or replace function public.hiring_test_items_frozen() returns trigger
language plpgsql
as $$
begin
  raise exception 'a hiring paper is frozen once issued' using errcode = 'check_violation';
end
$$;

create trigger hiring_test_items_frozen
  before update on public.hiring_test_items
  for each row execute function public.hiring_test_items_frozen();

-- ── attempts and answers ────────────────────────────────────────────────────

create table public.hiring_attempts (
  id            uuid primary key default gen_random_uuid(),
  test_id       uuid not null unique references public.hiring_tests(id) on delete cascade,
  started_at    timestamptz not null default now(),
  deadline_at   timestamptz not null,
  submitted_at  timestamptz,
  submit_reason text check (submit_reason in ('manual', 'timer')),
  score         numeric(6, 2),
  correct       int check (correct >= 0),
  incorrect     int check (incorrect >= 0),
  skipped       int check (skipped >= 0),
  user_agent    text check (char_length(user_agent) <= 500),
  ip            inet,
  constraint hiring_attempts_submit_consistent check (
    (submitted_at is null and submit_reason is null and score is null
       and correct is null and incorrect is null and skipped is null)
    or (submitted_at is not null and submit_reason is not null and score is not null
       and correct is not null and incorrect is not null and skipped is not null)
  )
);

-- The start: only on a live link, and the deadline is the server's.
create or replace function public.hiring_attempts_start() returns trigger
language plpgsql
as $$
declare
  v_t public.hiring_tests;
begin
  select * into v_t from public.hiring_tests where id = new.test_id for update;
  if not found or v_t.state not in ('issued', 'opened') then
    raise exception 'this test cannot be started' using errcode = 'check_violation';
  end if;
  if now() >= v_t.expires_at then
    raise exception 'this link has expired' using errcode = 'check_violation';
  end if;
  new.started_at := now();
  new.deadline_at := now() + make_interval(mins => v_t.limit_minutes);
  new.submitted_at := null;
  new.submit_reason := null;
  new.score := null;
  new.correct := null;
  new.incorrect := null;
  new.skipped := null;
  return new;
end
$$;

create trigger hiring_attempts_start
  before insert on public.hiring_attempts
  for each row execute function public.hiring_attempts_start();

-- Nothing about a start changes afterwards; only submitting writes.
create or replace function public.hiring_attempts_fixed() returns trigger
language plpgsql
as $$
begin
  if new.test_id <> old.test_id or new.started_at <> old.started_at or new.deadline_at <> old.deadline_at then
    raise exception 'an attempt''s start and deadline never change' using errcode = 'check_violation';
  end if;
  if old.submitted_at is not null then
    raise exception 'this attempt is already submitted' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger hiring_attempts_fixed
  before update on public.hiring_attempts
  for each row execute function public.hiring_attempts_fixed();

-- The test's state follows its attempt.
create or replace function public.hiring_attempts_sync_state() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.hiring_tests set state = 'started' where id = new.test_id;
  elsif new.submitted_at is not null and old.submitted_at is null then
    update public.hiring_tests set state = 'submitted' where id = new.test_id;
  end if;
  return null;
end
$$;

create trigger hiring_attempts_sync_state
  after insert or update on public.hiring_attempts
  for each row execute function public.hiring_attempts_sync_state();

create table public.hiring_answers (
  attempt_id    uuid not null references public.hiring_attempts(id) on delete cascade,
  position      int  not null check (position between 1 and 15),
  choice        text check (choice in ('A', 'B', 'C', 'D')),
  numeric_value int  check (numeric_value between 0 and 9999),
  answered_at   timestamptz not null default now(),
  change_count  int  not null default 0 check (change_count >= 0),
  primary key (attempt_id, position),
  constraint hiring_answers_one_shape check (choice is null or numeric_value is null)
);

create or replace function public.hiring_answers_guard() returns trigger
language plpgsql
as $$
declare
  v_a      public.hiring_attempts;
  v_format text;
begin
  select * into v_a from public.hiring_attempts where id = new.attempt_id;
  if not found or v_a.submitted_at is not null or now() > v_a.deadline_at + interval '30 seconds' then
    raise exception 'this attempt is closed' using errcode = 'check_violation';
  end if;

  select i.format into v_format
    from public.hiring_test_items ti join public.hiring_items i on i.id = ti.item_id
   where ti.test_id = v_a.test_id and ti.position = new.position;
  if v_format is null then
    raise exception 'position % is not on this paper', new.position using errcode = 'check_violation';
  end if;
  if (v_format = 'mcq' and new.numeric_value is not null) or (v_format = 'numeric' and new.choice is not null) then
    raise exception 'the answer to position % has the wrong shape', new.position using errcode = 'check_violation';
  end if;

  new.answered_at := now();
  if tg_op = 'UPDATE' then
    new.change_count := old.change_count
      + case when new.choice is distinct from old.choice or new.numeric_value is distinct from old.numeric_value then 1 else 0 end;
  else
    new.change_count := 0;
  end if;
  return new;
end
$$;

create trigger hiring_answers_guard
  before insert or update on public.hiring_answers
  for each row execute function public.hiring_answers_guard();

-- ── issue ───────────────────────────────────────────────────────────────────

-- SECURITY DEFINER: it draws from the whole live bank and writes tables no
-- signed-in user may write. The checks below read the caller's JWT, which a
-- definer function sees just the same.
create or replace function public.issue_hiring_test(p_applicant uuid, p_token text)
returns public.hiring_tests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app     public.hiring_applicants;
  v_seq     int;
  v_mcq     int;
  v_num     int;
  v_minutes int;
  v_ids     uuid[];
  v_set     text;
  v_test    public.hiring_tests;
  v_con     text;
begin
  if not public.can_hire() then
    raise exception 'only a teacher or superadmin issues a hiring test' using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from hiring_applicants where id = p_applicant for update;
  -- The same refusal for "no such applicant" and "not yours".
  if not found or not public.can_see_applicant(v_app.created_by) then
    raise exception 'no such applicant' using errcode = 'insufficient_privilege';
  end if;

  if exists (select 1 from hiring_tests where applicant_id = v_app.id and state = 'submitted') then
    raise exception 'this applicant has already submitted a test' using errcode = 'check_violation';
  end if;
  select coalesce(max(issue_seq), 0) + 1 into v_seq from hiring_tests where applicant_id = v_app.id;
  if v_seq > 3 then
    raise exception 'this applicant has already been issued 3 tests' using errcode = 'check_violation';
  end if;

  -- The paper's shape: HIRING_SHAPE in src/lib/hiring.ts.
  v_mcq     := case v_app.subject when 'english' then 15 else 12 end;
  v_num     := case v_app.subject when 'english' then 0 else 3 end;
  v_minutes := case v_app.subject when 'english' then 20 else 25 end;

  update hiring_tests set state = 'voided'
   where applicant_id = v_app.id and state in ('issued', 'opened', 'started');

  for attempt in 1 .. 20 loop
    with seen as (
      select ti.item_id from hiring_test_items ti join hiring_tests t on t.id = ti.test_id
       where t.applicant_id = v_app.id
    ), pool as (
      select id, format, row_number() over (partition by format, chapter order by random()) as in_chapter
        from hiring_items
       where status = 'live' and subject = v_app.subject and id not in (select item_id from seen)
    ), ranked as (
      select id, format, row_number() over (partition by format order by random()) as k
        from pool where in_chapter <= 2
    )
    select array_agg(id order by format, k) into v_ids
      from ranked
     where (format = 'mcq' and k <= v_mcq) or (format = 'numeric' and k <= v_num);

    if coalesce(array_length(v_ids, 1), 0) <> v_mcq + v_num then
      raise exception 'not enough live % questions to draw a fresh paper', v_app.subject using errcode = 'check_violation';
    end if;

    v_set := md5(array_to_string(array(select unnest(v_ids)::text order by 1), ','));
    begin
      insert into hiring_tests (applicant_id, token, issue_seq, subject, question_count, limit_minutes, item_set, issued_by)
      values (v_app.id, p_token, v_seq, v_app.subject, v_mcq + v_num, v_minutes, v_set, auth.uid())
      returning * into v_test;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con <> 'hiring_tests_one_set' then raise; end if;
      -- Someone already has this set: draw again.
    end;
  end loop;

  if v_test.id is null then
    raise exception 'could not draw a set no one else has; add live % questions', v_app.subject using errcode = 'check_violation';
  end if;

  insert into hiring_test_items (test_id, position, item_id)
  select v_test.id, o, id from unnest(v_ids) with ordinality as u(id, o);

  return v_test;
end
$$;

-- ── grading ─────────────────────────────────────────────────────────────────

-- Grades and closes an attempt; returns it. A second call returns it as it
-- stands, never regrades. Service role only (the applicant API, and the
-- function below).
create or replace function public.submit_hiring_attempt(p_attempt uuid, p_reason text)
returns public.hiring_attempts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a         public.hiring_attempts;
  v_correct   int;
  v_wrong_mcq int;
  v_wrong_num int;
  v_skipped   int;
begin
  select * into v_a from hiring_attempts where id = p_attempt for update;
  if not found then
    raise exception 'no such attempt' using errcode = 'check_violation';
  end if;
  if v_a.submitted_at is not null then
    return v_a;
  end if;

  select
    count(*) filter (where verdict = 'correct'),
    count(*) filter (where verdict = 'incorrect' and format = 'mcq'),
    count(*) filter (where verdict = 'incorrect' and format = 'numeric'),
    count(*) filter (where verdict = 'skipped')
  into v_correct, v_wrong_mcq, v_wrong_num, v_skipped
  from (
    select i.format,
           case
             when a.choice is null and a.numeric_value is null then 'skipped'
             when i.format = 'mcq' then case when a.choice = i.answer_key then 'correct' else 'incorrect' end
             else case when a.numeric_value = i.numeric_answer then 'correct' else 'incorrect' end
           end as verdict
      from hiring_test_items ti
      join hiring_items i on i.id = ti.item_id
      left join hiring_answers a on a.attempt_id = v_a.id and a.position = ti.position
     where ti.test_id = v_a.test_id
  ) graded;

  update hiring_attempts
     set submitted_at  = now(),
         submit_reason = case when p_reason = 'timer' or now() > deadline_at then 'timer' else 'manual' end,
         score         = v_correct - 0.25 * v_wrong_mcq,
         correct       = v_correct,
         incorrect     = v_wrong_mcq + v_wrong_num,
         skipped       = v_skipped
   where id = v_a.id
  returning * into v_a;
  return v_a;
end
$$;

-- Grades every attempt whose time ran out unsubmitted. The staff page calls
-- it before reading, so a closed page still gets a score.
create or replace function public.close_expired_hiring_attempts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  if not (public.can_hire() or public.auth_role() = 'service_role') then
    raise exception 'only a teacher or superadmin' using errcode = 'insufficient_privilege';
  end if;
  for v_id in
    select id from hiring_attempts where submitted_at is null and deadline_at + interval '30 seconds' < now()
  loop
    perform public.submit_hiring_attempt(v_id, 'timer');
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$$;

revoke all on function public.submit_hiring_attempt(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_hiring_attempt(uuid, text) to service_role;
revoke all on function public.issue_hiring_test(uuid, text) from public, anon;
grant execute on function public.issue_hiring_test(uuid, text) to authenticated;
revoke all on function public.close_expired_hiring_attempts() from public, anon;
grant execute on function public.close_expired_hiring_attempts() to authenticated, service_role;

-- ── access ──────────────────────────────────────────────────────────────────
-- Each table asks "can I see the parent row?" through its own policy; the
-- subquery is itself under RLS, so visibility is stated once, on applicants.

alter table public.hiring_applicants enable row level security;
alter table public.hiring_tests      enable row level security;
alter table public.hiring_test_items enable row level security;
alter table public.hiring_attempts   enable row level security;
alter table public.hiring_answers    enable row level security;

create policy hiring_applicants_read on public.hiring_applicants
  for select to authenticated using (public.can_see_applicant(created_by));
create policy hiring_applicants_add on public.hiring_applicants
  for insert to authenticated with check (public.can_hire());

create policy hiring_tests_read on public.hiring_tests
  for select to authenticated
  using (exists (select 1 from public.hiring_applicants a where a.id = applicant_id));
create policy hiring_test_items_read on public.hiring_test_items
  for select to authenticated
  using (exists (select 1 from public.hiring_tests t where t.id = test_id));
create policy hiring_attempts_read on public.hiring_attempts
  for select to authenticated
  using (exists (select 1 from public.hiring_tests t where t.id = test_id));
create policy hiring_answers_read on public.hiring_answers
  for select to authenticated
  using (exists (select 1 from public.hiring_attempts a where a.id = attempt_id));

revoke all on public.hiring_applicants, public.hiring_tests, public.hiring_test_items,
              public.hiring_attempts, public.hiring_answers from anon, authenticated;
grant select on public.hiring_applicants, public.hiring_tests, public.hiring_test_items,
                public.hiring_attempts, public.hiring_answers to authenticated;
grant insert (name, mobile, subject) on public.hiring_applicants to authenticated;
