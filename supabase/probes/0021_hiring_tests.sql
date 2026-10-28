-- Probe: issuing and taking a teacher screening test (migration 0021).
-- Run with `npm run db:probe -- 0021`.
--
-- Uses two existing logins as two teachers (their ids only; nothing about them
-- changes) and probe questions it inserts live. ONE statement that always ends
-- by raising, so every row rolls back and no other session sees any of it.
--
-- Orgs (migration 0030): a teacher sees every applicant in their org, so the
-- first login stands in as an LWS Pune teacher and the second, the outsider,
-- as an LWS Delhi one.

do $$
declare
  v_out    text := '';
  v_fail   boolean := false;
  v_t1     uuid;
  v_t2     uuid;
  v_app    uuid;
  v_test   public.hiring_tests;
  v_t2nd   public.hiring_tests;
  v_t3rd   public.hiring_tests;
  v_att    public.hiring_attempts;
  v_n      int;
  v_ids    uuid[];
  v_pos    int;
  v_rec    record;
  v_con text;
  v_twin uuid;

begin
  select array_agg(id) into v_ids from (select id from auth.users order by created_at limit 2) u;
  if coalesce(array_length(v_ids, 1), 0) < 2 then
    raise exception 'PROBE-FAIL needs two existing logins to stand in as teachers';
  end if;
  v_t1 := v_ids[1];
  v_t2 := v_ids[2];

  -- 40 MCQ over 20 chapters and 10 typed answers over 10 chapters, all live.
  insert into public.hiring_items (source_ref, source, paper, subject, chapter, format, stem, options, answer_key, status)
  select 'probe21-m' || g, 'mht-cet', 'probe', 'physics', 'ch' || ((g - 1) / 2), 'mcq', 'probe ' || g,
         '{"A":"1","B":"2","C":"3","D":"4"}', 'A', 'live'
    from generate_series(1, 40) g;
  insert into public.hiring_items (source_ref, source, paper, subject, chapter, format, stem, numeric_answer, status)
  select 'probe21-n' || g, 'jee-mains', 'probe', 'physics', 'nch' || g, 'numeric', 'probe n' || g, 5, 'live'
    from generate_series(1, 10) g;

  -- ── applicants: the creator comes from the session ─────────────────────────
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t1,
    'app_metadata', json_build_object('role', 'teacher', 'org_id', 'b31b8575-91c2-434a-b025-a7d12d3c0988'))::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.hiring_applicants (name, mobile, subject, created_by)
    values ('Probe Forged', '9700002109', 'physics', v_t2);
    v_fail := true; v_out := v_out || 'CLIENT SET CREATOR; ';
  exception when insufficient_privilege then null;
  end;
  insert into public.hiring_applicants (name, mobile, subject)
  values ('Probe Applicant', '9700002101', 'physics')
  returning id into v_app;
  if (select created_by from public.hiring_applicants where id = v_app) <> v_t1 then
    v_fail := true; v_out := v_out || 'CREATOR NOT STAMPED; ';
  end if;

  -- ── issue ──────────────────────────────────────────────────────────────────
  v_test := public.issue_hiring_test(v_app, 'probe21aaaaaaaaaaaaa01');
  select count(*) into v_n from public.hiring_test_items where test_id = v_test.id;
  if v_n <> 15 or v_test.question_count <> 15 or v_test.limit_minutes <> 25 or v_test.state <> 'issued'
     or v_test.subject <> 'physics' or v_test.issued_by <> v_t1
     or v_test.expires_at not between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute' then
    v_fail := true; v_out := v_out || format('BAD TEST %s items %s min %s; ', v_n, v_test.limit_minutes, v_test.state);
  end if;
  for v_rec in
    select ti.position, i.format from public.hiring_test_items ti join public.hiring_items i on i.id = ti.item_id
     where ti.test_id = v_test.id order by ti.position
  loop
    if (v_rec.position <= 12) <> (v_rec.format = 'mcq') then
      v_fail := true; v_out := v_out || format('POSITION %s IS %s; ', v_rec.position, v_rec.format);
    end if;
  end loop;
  select max(c) into v_n from (
    select count(*) c from public.hiring_test_items ti join public.hiring_items i on i.id = ti.item_id
     where ti.test_id = v_test.id group by i.chapter) x;
  if v_n > 2 then v_fail := true; v_out := v_out || format('%s FROM ONE CHAPTER; ', v_n); end if;
  v_out := v_out || 'issued 12+3, at most 2 a chapter; ';

  -- ── another teacher sees nothing and cannot issue ─────────────────────────
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t2,
    'app_metadata', json_build_object('role', 'teacher', 'org_id', '787f94d7-8d1b-4c45-a11d-b85916b7ccff'))::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.hiring_applicants where id = v_app;
  if v_n <> 0 then v_fail := true; v_out := v_out || 'OTHER TEACHER SEES APPLICANT; '; end if;
  select count(*) into v_n from public.hiring_tests where applicant_id = v_app;
  if v_n <> 0 then v_fail := true; v_out := v_out || 'OTHER TEACHER SEES TEST; '; end if;
  begin
    perform public.issue_hiring_test(v_app, 'probe21aaaaaaaaaaaaa09');
    v_fail := true; v_out := v_out || 'OTHER TEACHER ISSUED; ';
  exception when insufficient_privilege then null;
  end;

  -- ── superadmin sees it; a counsellor sees none of hiring ──────────────────
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t2,
    'app_metadata', json_build_object('role', 'superadmin'))::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.hiring_test_items where test_id = v_test.id;
  if v_n <> 15 then v_fail := true; v_out := v_out || format('SUPERADMIN SEES %s ITEMS; ', v_n); end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t1,
    'app_metadata', json_build_object('role', 'counsellor'))::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.hiring_applicants;
  if v_n <> 0 then v_fail := true; v_out := v_out || 'COUNSELLOR SEES APPLICANTS; '; end if;
  begin
    insert into public.hiring_applicants (name, mobile, subject) values ('x', '9700002102', 'maths');
    v_fail := true; v_out := v_out || 'COUNSELLOR ADDED APPLICANT; ';
  exception when insufficient_privilege then null;
  end;
  v_out := v_out || 'another org's teacher sees nothing; ';

  -- ── a teacher writes nothing directly ─────────────────────────────────────
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t1,
    'app_metadata', json_build_object('role', 'teacher', 'org_id', 'b31b8575-91c2-434a-b025-a7d12d3c0988'))::text, true);
  execute 'set local role authenticated';
  begin
    update public.hiring_tests set expires_at = now() + interval '30 days' where id = v_test.id;
    v_fail := true; v_out := v_out || 'TEACHER UPDATED TEST; ';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hiring_attempts (test_id, deadline_at) values (v_test.id, now() + interval '9 hours');
    v_fail := true; v_out := v_out || 'TEACHER STARTED ATTEMPT; ';
  exception when insufficient_privilege then null;
  end;

  -- ── reissue: fresh questions, the old link voided, three at most ─────────
  v_t2nd := public.issue_hiring_test(v_app, 'probe21aaaaaaaaaaaaa02');
  v_t3rd := public.issue_hiring_test(v_app, 'probe21aaaaaaaaaaaaa03');
  execute 'reset role';
  if (select state from public.hiring_tests where id = v_test.id) <> 'voided'
     or (select state from public.hiring_tests where id = v_t2nd.id) <> 'voided' or v_t3rd.issue_seq <> 3 then
    v_fail := true; v_out := v_out || 'EARLIER LINKS NOT VOIDED; ';
  end if;
  select count(*) - count(distinct item_id) into v_n from public.hiring_test_items
   where test_id in (v_test.id, v_t2nd.id, v_t3rd.id);
  if v_n <> 0 then v_fail := true; v_out := v_out || format('%s REPEATED ACROSS REISSUES; ', v_n); end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t1,
    'app_metadata', json_build_object('role', 'teacher', 'org_id', 'b31b8575-91c2-434a-b025-a7d12d3c0988'))::text, true);
  execute 'set local role authenticated';
  begin
    perform public.issue_hiring_test(v_app, 'probe21aaaaaaaaaaaaa04');
    v_fail := true; v_out := v_out || 'FOURTH ISSUE ALLOWED; ';
  exception when check_violation then null;
  end;
  execute 'reset role';
  v_out := v_out || 'reissues fresh, voided, capped at 3; ';

  -- ── the same set twice is refused ────────────────────────────────────────
  -- Another applicant, so only the one-set rule can refuse it.
  insert into public.hiring_applicants (name, mobile, subject) values ('Probe Twin', '9700002104', 'physics')
  returning id into v_twin;
  begin
    insert into public.hiring_tests (applicant_id, token, issue_seq, subject, question_count, limit_minutes, item_set)
    values (v_twin, 'probe21aaaaaaaaaaaaa05', 1, 'physics', 15, 25, v_t3rd.item_set);
    v_fail := true; v_out := v_out || 'SAME SET ACCEPTED; ';
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con <> 'hiring_tests_one_set' then
      v_fail := true; v_out := v_out || format('SAME SET REFUSED BY %s; ', v_con);
    end if;
  end;

  -- ── a paper never changes ────────────────────────────────────────────────
  begin
    update public.hiring_test_items set item_id = item_id where test_id = v_t3rd.id and position = 1;
    v_fail := true; v_out := v_out || 'PAPER CHANGED; ';
  exception when others then null;
  end;

  -- ── take the third test: shape guards, then grading in SQL ───────────────
  insert into public.hiring_attempts (test_id, deadline_at) values (v_t3rd.id, now() + interval '9 hours')
  returning * into v_att;
  if v_att.deadline_at not between now() + interval '24 minutes 59 seconds' and now() + interval '25 minutes 1 second'
     or (select state from public.hiring_tests where id = v_t3rd.id) <> 'started' then
    v_fail := true; v_out := v_out || 'DEADLINE OR STATE WRONG ON START; ';
  end if;
  begin
    insert into public.hiring_attempts (test_id, deadline_at) values (v_test.id, now());
    v_fail := true; v_out := v_out || 'VOIDED TEST STARTED; ';
  exception when check_violation then null;
  end;

  for v_rec in select * from (values (1, 'A', null), (2, 'A', null), (3, 'B', null), (13, null, 5), (14, null, 6)) as x(p, c, n) loop
    insert into public.hiring_answers (attempt_id, position, choice, numeric_value)
    values (v_att.id, v_rec.p, v_rec.c, v_rec.n);
  end loop;
  update public.hiring_answers set choice = 'A' where attempt_id = v_att.id and position = 1; -- a change is fine
  foreach v_pos in array array[16] loop
    begin
      insert into public.hiring_answers (attempt_id, position, choice) values (v_att.id, v_pos, 'A');
      v_fail := true; v_out := v_out || 'POSITION 16 SAVED; ';
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.hiring_answers (attempt_id, position, numeric_value) values (v_att.id, 4, 3);
    v_fail := true; v_out := v_out || 'NUMBER ON AN MCQ SAVED; ';
  exception when check_violation then null;
  end;
  begin
    insert into public.hiring_answers (attempt_id, position, choice) values (v_att.id, 15, 'A');
    v_fail := true; v_out := v_out || 'LETTER ON A TYPED ANSWER SAVED; ';
  exception when check_violation then null;
  end;

  -- 3 right, a wrong MCQ (−0.25) and a wrong typed answer (0): 2.75.
  select * into v_att from public.submit_hiring_attempt(v_att.id, 'manual');
  if v_att.score <> 2.75 or v_att.correct <> 3 or v_att.incorrect <> 2 or v_att.skipped <> 10
     or v_att.submit_reason <> 'manual' or (select state from public.hiring_tests where id = v_t3rd.id) <> 'submitted' then
    v_fail := true;
    v_out := v_out || format('GRADED %s (%s/%s/%s) %s; ', v_att.score, v_att.correct, v_att.incorrect, v_att.skipped, v_att.submit_reason);
  end if;
  select * into v_att from public.submit_hiring_attempt(v_att.id, 'manual');
  if v_att.score <> 2.75 then v_fail := true; v_out := v_out || 'RESUBMIT REGRADED; '; end if;
  begin
    update public.hiring_answers set choice = 'C' where attempt_id = v_att.id and position = 3;
    v_fail := true; v_out := v_out || 'ANSWER CHANGED AFTER SUBMIT; ';
  exception when check_violation then null;
  end;
  v_out := v_out || 'answers guarded, graded 2.75 in SQL, locked after submit; ';

  -- The state only moves forward (migration 0022): a late "opened" from a
  -- slow page load must not reopen a submitted test, nor revive a voided one.
  begin
    update public.hiring_tests set state = 'opened' where id = v_t3rd.id;
    v_fail := true; v_out := v_out || 'SUBMITTED WENT BACK TO OPENED; ';
  exception when check_violation then null;
  end;
  begin
    update public.hiring_tests set state = 'issued' where id = v_test.id;
    v_fail := true; v_out := v_out || 'VOIDED CAME BACK; ';
  exception when check_violation then null;
  end;
  update public.hiring_tests set state = 'submitted' where id = v_t3rd.id; -- the same state is a no-op
  v_out := v_out || 'state only moves forward; ';

  -- ── an attempt past its deadline is closed as timed out ──────────────────
  -- A fresh applicant, issued and started, with the clock moved back.
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t1,
    'app_metadata', json_build_object('role', 'teacher', 'org_id', 'b31b8575-91c2-434a-b025-a7d12d3c0988'))::text, true);
  execute 'set local role authenticated';
  insert into public.hiring_applicants (name, mobile, subject) values ('Probe Late', '9700002103', 'physics')
  returning id into v_app;
  v_test := public.issue_hiring_test(v_app, 'probe21aaaaaaaaaaaaa06');
  execute 'reset role';
  insert into public.hiring_attempts (test_id, deadline_at) values (v_test.id, now()) returning * into v_att;
  alter table public.hiring_attempts disable trigger user;
  update public.hiring_attempts set deadline_at = now() - interval '5 minutes' where id = v_att.id;
  alter table public.hiring_attempts enable trigger user;
  begin
    insert into public.hiring_answers (attempt_id, position, choice) values (v_att.id, 1, 'A');
    v_fail := true; v_out := v_out || 'ANSWER SAVED AFTER DEADLINE; ';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_t1,
    'app_metadata', json_build_object('role', 'teacher', 'org_id', 'b31b8575-91c2-434a-b025-a7d12d3c0988'))::text, true);
  execute 'set local role authenticated';
  perform public.close_expired_hiring_attempts();
  execute 'reset role';
  select * into v_att from public.hiring_attempts where id = v_att.id;
  if v_att.submitted_at is null or v_att.submit_reason <> 'timer' or v_att.score <> 0 then
    v_fail := true; v_out := v_out || 'EXPIRED ATTEMPT NOT CLOSED; ';
  end if;
  v_out := v_out || 'late answers refused, expired attempts closed';

  raise exception '% %', case when v_fail then 'PROBE-FAIL' else 'PROBE-PASS' end, v_out;
end
$$;
