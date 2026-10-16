-- Scanning paper tests (2026-10-16)
--
-- A counsellor photographs a filled OMR sheet; the browser reads it; a person
-- settles anything unclear; then this files it. The browser never sends a
-- score: `record_paper_scan` stores the answers and grades them here, from
-- the stored keys, the same way src/lib/grade.ts does (paperScan.itest.ts
-- holds the two to the same numbers).
--
--   • attempts: submit_reason 'paper', who scanned it (id and name, stamped
--     from the session; no foreign key, so removing a staff login never fails
--     — the issued_by trap), and the sheet photo's storage path.
--   • attempt_answers: double_mark (two marks in a row or column: wrong, not
--     blank) and by_hand (a person decided it), both shown on the report.
--   • Storage bucket omr-sheets, private. One photo per paper test, named
--     <assessment id>.jpg. Counsellors and superadmin may write it only while
--     that paper test is still open, so once a scan is filed its photo is the
--     record and cannot be replaced; they alone may read it. The 12-month purge
--     deletes it by hand (src/server/retention.ts): storage does not cascade.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.attempts drop constraint attempts_submit_reason_check;
alter table public.attempts
  add constraint attempts_submit_reason_check check (submit_reason in ('manual', 'timer', 'window', 'paper')),
  add column scanned_by uuid,
  add column scanned_by_name text,
  add column sheet_photo text,
  -- A scanned attempt says who scanned it and where its photo is; no other does.
  add constraint attempts_paper_scan check (
    (submit_reason = 'paper') = (scanned_by is not null and sheet_photo is not null)
  );

alter table public.attempt_answers
  add column double_mark boolean not null default false,
  add column by_hand boolean not null default false,
  add constraint attempt_answers_double_mark_empty check (
    not double_mark or (choice is null and numeric_value is null)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- The photo bucket
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('omr-sheets', 'omr-sheets', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

-- The paper test a photo name belongs to, if it is one that is still open.
create or replace function public.omr_sheet_writable(p_name text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
     and exists (
       select 1 from public.assessments a
        where a.id = substring(p_name from 1 for 36)::uuid
          and a.mode = 'paper'
          and a.state = 'issued'
     )
$$;

create policy omr_sheets_read on storage.objects
  for select to authenticated
  using (bucket_id = 'omr-sheets' and public.auth_role() in ('counsellor', 'superadmin'));

create policy omr_sheets_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'omr-sheets'
    and public.auth_role() in ('counsellor', 'superadmin')
    and public.omr_sheet_writable(name)
  );

-- An upsert of a retaken photo, allowed only while the scan is not yet filed.
create policy omr_sheets_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'omr-sheets'
    and public.auth_role() in ('counsellor', 'superadmin')
    and public.omr_sheet_writable(name)
  )
  with check (
    bucket_id = 'omr-sheets'
    and public.auth_role() in ('counsellor', 'superadmin')
    and public.omr_sheet_writable(name)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- record_paper_scan: file a scanned sheet, all or nothing
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.record_paper_scan(p_assessment_id uuid, p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a       public.assessments;
  v_photo   text;
  v_count   int;
  v_bad     text;
  v_attempt uuid;
  v_r       record;
begin
  if public.auth_role() not in ('counsellor', 'superadmin') then
    raise exception 'only a counsellor or superadmin may file a scanned sheet'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_a from assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'no such test' using errcode = 'check_violation';
  end if;
  if v_a.mode <> 'paper' then
    raise exception 'only a paper test is scanned' using errcode = 'check_violation';
  end if;
  if v_a.state = 'submitted' then
    raise exception 'paper % is already scanned', v_a.paper_no using errcode = 'check_violation';
  end if;
  if v_a.state <> 'issued' then
    raise exception 'paper % was replaced by a newer test and cannot be scanned', v_a.paper_no
      using errcode = 'check_violation';
  end if;
  if now() >= v_a.expires_at then
    raise exception 'the scanning window for paper % closed on %', v_a.paper_no, v_a.expires_at
      using errcode = 'check_violation';
  end if;

  v_photo := v_a.id::text || '.jpg';
  if not exists (select 1 from storage.objects where bucket_id = 'omr-sheets' and name = v_photo) then
    raise exception 'the sheet photo for paper % is not stored; upload it first', v_a.paper_no
      using errcode = 'check_violation';
  end if;

  -- One answer per position of this paper, each the shape its question takes.
  if jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'answers must be a list' using errcode = 'check_violation';
  end if;
  select count(*) into v_count from jsonb_array_elements(p_answers);
  if v_count <> v_a.question_count then
    raise exception 'paper % has % questions, got % answers', v_a.paper_no, v_a.question_count, v_count
      using errcode = 'check_violation';
  end if;

  select string_agg(problem, '; ') into v_bad from (
    select case
      when ai.position is null then format('position %s is not on this paper', x.position)
      when count(*) over (partition by x.position) > 1 then format('position %s appears twice', x.position)
      when x."doubleMark" is null or x."byHand" is null then format('Q%s: flags must be true or false', x.position)
      when x."doubleMark" and (x.choice is not null or x."numericValue" is not null)
        then format('Q%s: a double mark carries no answer', x.position)
      when t.format = 'mcq' and x."numericValue" is not null
        then format('Q%s is multiple-choice and cannot take a number', x.position)
      when t.format = 'mcq' and x.choice is not null and x.choice not in ('A', 'B', 'C', 'D')
        then format('Q%s: %s is not A-D', x.position, x.choice)
      when t.format = 'numeric' and x.choice is not null
        then format('Q%s is numeric and cannot take a letter', x.position)
      when t.format = 'numeric' and x."numericValue" is not null
           and (x."numericValue" < 0 or x."numericValue" >= 10000
                or x."numericValue" * 100 <> round(x."numericValue" * 100))
        then format('Q%s: %s does not fit the answer box', x.position, x."numericValue")
    end as problem
    from jsonb_to_recordset(p_answers)
      as x(position int, choice text, "numericValue" numeric, "doubleMark" boolean, "byHand" boolean)
    left join assessment_items ai on ai.assessment_id = v_a.id and ai.position = x.position
    left join test_items t on t.id = ai.item_id
  ) checks where problem is not null;
  if v_bad is not null then
    raise exception 'the scan does not fit paper %: %', v_a.paper_no, v_bad using errcode = 'check_violation';
  end if;

  insert into attempts (assessment_id, deadline_at, scanned_by, scanned_by_name, sheet_photo)
  values (
    v_a.id,
    now(),
    auth.uid(),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'name',
    v_photo
  )
  returning id into v_attempt;

  insert into attempt_answers (attempt_id, position, choice, numeric_value, double_mark, by_hand, last_answered_at)
  select v_attempt, x.position, x.choice, x."numericValue", x."doubleMark", x."byHand", now()
    from jsonb_to_recordset(p_answers)
      as x(position int, choice text, "numericValue" numeric, "doubleMark" boolean, "byHand" boolean);

  -- Graded as src/lib/grade.ts grades: +1 correct, -0.25 a wrong or double-
  -- marked multiple-choice answer, 0 a wrong numeric one or a blank. A numeric
  -- answer is right within its tolerance plus the same 1e-9 cushion.
  select
    coalesce(sum(delta), 0) / 100.0                                        as score,
    count(*) filter (where verdict = 'correct')                           as correct,
    count(*) filter (where verdict = 'incorrect')                         as incorrect,
    count(*) filter (where verdict = 'skipped')                           as skipped,
    coalesce(sum(delta) filter (where subject = 'maths'), 0) / 100.0      as maths,
    coalesce(sum(delta) filter (where subject = 'english'), 0) / 100.0    as english,
    coalesce(sum(delta) filter (where subject = 'science'), 0) / 100.0    as science
    into v_r
  from (
    select t.subject, v.verdict,
           case
             when v.verdict = 'correct' then 100
             when v.verdict = 'incorrect' and t.format = 'mcq' then -25
             else 0
           end as delta
      from assessment_items ai
      join test_items t on t.id = ai.item_id
      left join attempt_answers aa on aa.attempt_id = v_attempt and aa.position = ai.position
      cross join lateral (
        select case
          when aa.double_mark then 'incorrect'
          when t.format = 'mcq' then
            case when aa.choice is null then 'skipped'
                 when aa.choice = t.answer_key then 'correct'
                 else 'incorrect' end
          else
            case when aa.numeric_value is null or t.numeric_answer is null then 'skipped'
                 when abs(aa.numeric_value - t.numeric_answer)
                      <= coalesce(t.numeric_tolerance, 0) + 1e-9 * greatest(1, abs(t.numeric_answer))
                   then 'correct'
                 else 'incorrect' end
        end as verdict
      ) v
     where ai.assessment_id = v_a.id
  ) graded;

  update attempts
     set submitted_at = now(),
         submit_reason = 'paper',
         score = v_r.score,
         correct = v_r.correct,
         incorrect = v_r.incorrect,
         skipped = v_r.skipped,
         maths_score = v_r.maths,
         english_score = v_r.english,
         science_score = v_r.science
   where id = v_attempt;

  return jsonb_build_object(
    'attemptId', v_attempt,
    'score', v_r.score,
    'correct', v_r.correct,
    'incorrect', v_r.incorrect,
    'skipped', v_r.skipped
  );
end
$$;

revoke all on function public.record_paper_scan(uuid, jsonb) from public, anon;
grant execute on function public.record_paper_scan(uuid, jsonb) to authenticated;
revoke all on function public.omr_sheet_writable(text) from public, anon;
grant execute on function public.omr_sheet_writable(text) to authenticated;
