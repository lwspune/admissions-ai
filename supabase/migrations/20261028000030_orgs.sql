-- Orgs (2026-10-28): LWS Pune and LWS Delhi, each seeing only its own.
--
-- The owner's calls: an org is an LWS branch; superadmin sees every org; the
-- question bank and the teacher-test bank stay shared; lead source names stay
-- one list; a teacher sees every applicant in their org, not only their own.
-- Everything that existed before this migration is LWS Pune's.
--
--   • organizations: one row per org. Read by any signed-in staff member or
--     teacher (the header shows the name); written only by service role.
--   • A staff account's org is app_metadata.org_id, beside its role, set by
--     superadmin through the admin API. auth_org() reads it from the JWT and,
--     for a token issued before the org was set, from the account itself. Like
--     the role, a move reaches a live token when it refreshes (≤ 1 hour). An
--     account with no org sees nothing.
--   • leads, hiring_applicants and lead_feeds carry org_id. A session's insert
--     takes the session's org whatever it sends (superadmin may name one);
--     service role must name it. A lead never changes org.
--   • Visibility is still stated once per tree: can_see_lead() for a lead and
--     everything hanging off it, can_see_applicant() for an applicant and
--     everything hanging off it. Both add "in my org".
--   • The doors that skip RLS (SECURITY DEFINER functions, storage policies)
--     each check the org themselves: the sheet photo, the scan, the resume,
--     issuing a teacher test, leads_on_mobile. A number is matched within an
--     org: the same parent at Pune and Delhi is two leads.
--   • GoPost's feed is LWS Pune's; its page writes into the feed's org.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── organizations ───────────────────────────────────────────────────────────

create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique check (slug ~ '^[a-z][a-z0-9-]{1,40}$'),
  name       text not null unique check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

-- Fixed ids, so staff accounts can carry their org before this migration runs.
insert into public.organizations (id, slug, name) values
  ('b31b8575-91c2-434a-b025-a7d12d3c0988', 'lws-pune', 'LWS Pune'),
  ('787f94d7-8d1b-4c45-a11d-b85916b7ccff', 'lws-delhi', 'LWS Delhi');

-- ── who is in which org ─────────────────────────────────────────────────────

-- DEFINER only to read the caller's own account when the token predates the
-- org; the JWT is read first.
create or replace function public.auth_org() returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'org_id', ''),
    (select u.raw_app_meta_data ->> 'org_id' from auth.users u where u.id = auth.uid())
  )::uuid
$$;

create or replace function public.in_my_org(p_org uuid) returns boolean
language sql
stable
as $$ select public.is_superadmin() or p_org = public.auth_org() $$;

revoke all on function public.auth_org(), public.in_my_org(uuid) from public, anon;
grant execute on function public.auth_org(), public.in_my_org(uuid) to authenticated, service_role;

alter table public.organizations enable row level security;
create policy organizations_read on public.organizations
  for select to authenticated using (public.is_staff() or public.can_hire());
revoke insert, update, delete, truncate on public.organizations from authenticated, anon;

-- ── org_id on the roots ─────────────────────────────────────────────────────
-- A constant default fills existing rows without rewriting them or firing a
-- trigger (no updated_at moves); it is dropped at once, so a new row must say.

alter table public.leads
  add column org_id uuid not null default 'b31b8575-91c2-434a-b025-a7d12d3c0988' references public.organizations(id);
alter table public.leads alter column org_id drop default;
create index leads_org_stage_idx on public.leads (org_id, stage);
create index leads_org_mobile_idx on public.leads (org_id, contact_mobile);

alter table public.hiring_applicants
  add column org_id uuid not null default 'b31b8575-91c2-434a-b025-a7d12d3c0988' references public.organizations(id);
alter table public.hiring_applicants alter column org_id drop default;
create index hiring_applicants_org_idx on public.hiring_applicants (org_id, created_at desc);

alter table public.lead_feeds
  add column org_id uuid not null default 'b31b8575-91c2-434a-b025-a7d12d3c0988' references public.organizations(id);
alter table public.lead_feeds alter column org_id drop default;

-- ── leads ───────────────────────────────────────────────────────────────────

create or replace function public.leads_guard() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The org: a session's own (superadmin may name one), never changed after.
  if tg_op = 'INSERT' then
    if public.auth_role() = 'superadmin' then
      new.org_id := coalesce(new.org_id, public.auth_org());
    elsif auth.uid() is not null then
      new.org_id := public.auth_org();
      if new.org_id is null then
        raise exception 'your account belongs to no org' using errcode = 'insufficient_privilege';
      end if;
    end if;
  elsif new.org_id is distinct from old.org_id then
    raise exception 'a lead never moves to another org' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and old.name is not null and new.name is null then
    raise exception 'a lead''s name can be corrected but not removed'
      using errcode = 'check_violation';
  end if;

  if public.auth_role() = 'telecaller' then
    if tg_op = 'INSERT' then
      new.assigned_to := auth.uid();
    elsif new.assigned_to is distinct from old.assigned_to then
      raise exception 'only a counsellor or superadmin can assign a lead'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (
       select 1 from auth.users u
        where u.id = new.assigned_to
          and u.raw_app_meta_data ->> 'role' = 'telecaller'
          and u.raw_app_meta_data ->> 'org_id' = new.org_id::text
     ) then
    raise exception 'a lead can only be assigned to a telecaller of its org'
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

drop policy leads_staff_read on public.leads;
drop policy leads_staff_insert on public.leads;
drop policy leads_staff_update on public.leads;
drop function public.can_see_lead(uuid);

create function public.can_see_lead(p_assigned_to uuid, p_org uuid) returns boolean
language sql
stable
as $$
  select public.is_staff()
     and public.in_my_org(p_org)
     and (public.auth_role() <> 'telecaller' or p_assigned_to = auth.uid())
$$;

create policy leads_staff_read on public.leads
  for select to authenticated using (public.can_see_lead(assigned_to, org_id));
create policy leads_staff_insert on public.leads
  for insert to authenticated with check (public.can_see_lead(assigned_to, org_id));
create policy leads_staff_update on public.leads
  for update to authenticated
  using (public.can_see_lead(assigned_to, org_id)) with check (public.can_see_lead(assigned_to, org_id));

-- An origin is written only onto a lead this session can see.
drop policy lead_origins_import_insert on public.lead_origins;
create policy lead_origins_import_insert on public.lead_origins
  for insert to authenticated
  with check (
    public.auth_role() in ('counsellor', 'superadmin')
    and exists (select 1 from public.leads l where l.id = lead_origins.lead_id));

create or replace function public.leads_on_mobile(p_mobile text) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_staff()
              then (select count(*)::int from leads where contact_mobile = p_mobile and org_id = public.auth_org())
              else 0 end
$$;

-- ── imports: matched within one org ─────────────────────────────────────────

drop function internal.merge_lead_rows(uuid, jsonb);

create function internal.merge_lead_rows(p_org uuid, p_source_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  r           jsonb;
  v_mobile    text;
  v_ids       uuid[];
  v_lead      uuid;
  v_note      text;
  v_created   int := 0;
  v_merged    int := 0;
  v_ambiguous text[] := '{}';
begin
  if p_org is null then
    raise exception 'an import names its org' using errcode = 'invalid_parameter_value';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_mobile := r ->> 'mobile';

    select array_agg(id) into v_ids from leads where contact_mobile = v_mobile and org_id = p_org;

    if coalesce(array_length(v_ids, 1), 0) > 1 then
      v_ambiguous := v_ambiguous || v_mobile;
      continue;
    end if;

    if v_ids is null then
      insert into leads (name, contact_mobile, interest, stage, org_id)
      values (
        nullif(trim(r ->> 'name'), ''),
        v_mobile,
        r ->> 'interest',
        coalesce(r ->> 'stage', 'new'),
        p_org
      )
      returning id into v_lead;
      v_created := v_created + 1;
    else
      v_lead := v_ids[1];
      update leads
         set name     = coalesce(name, nullif(trim(r ->> 'name'), '')),
             interest = coalesce(interest, r ->> 'interest')
       where id = v_lead
         and ((name is null and nullif(trim(r ->> 'name'), '') is not null)
              or (interest is null and r ->> 'interest' is not null));
      v_merged := v_merged + 1;
    end if;

    insert into lead_origins (lead_id, source_id, source_date)
    values (v_lead, p_source_id, (r ->> 'source_date')::date);

    for v_note in select jsonb_array_elements_text(coalesce(r -> 'notes', '[]'::jsonb)) loop
      insert into lead_comments (lead_id, kind, body) values (v_lead, 'import', v_note);
    end loop;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'merged', v_merged,
    'ambiguous', to_jsonb(v_ambiguous)
  );
end
$$;

revoke all on function internal.merge_lead_rows(uuid, uuid, jsonb) from public;
grant execute on function internal.merge_lead_rows(uuid, uuid, jsonb) to authenticated, service_role;

-- A sheet goes into the importer's own org.
create or replace function public.import_leads(p_source_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := public.auth_org();
begin
  if public.auth_role() not in ('counsellor', 'superadmin') then
    raise exception 'only a counsellor or superadmin can import leads'
      using errcode = 'insufficient_privilege';
  end if;
  if v_org is null then
    raise exception 'your account belongs to no org' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from lead_sources where id = p_source_id) then
    raise exception 'source % does not exist', p_source_id using errcode = 'foreign_key_violation';
  end if;
  return internal.merge_lead_rows(v_org, p_source_id, p_rows);
end
$$;

-- A feed's page goes into the feed's org.
create or replace function public.import_feed_page(
  p_feed    text,
  p_from    text,
  p_next    text,
  p_rows    jsonb,
  p_dry_run boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org       uuid;
  v_cursor    text;
  v_source    text;
  v_source_id uuid;
  v_part      jsonb;
  v_total     jsonb := jsonb_build_object('created', 0, 'merged', 0, 'ambiguous', '[]'::jsonb);
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where nullif(trim(r.value ->> 'source'), '') is null) then
    raise exception 'every row names its source' using errcode = 'invalid_parameter_value';
  end if;

  select org_id into v_org from lead_feeds where name = p_feed;
  if not found then
    raise exception 'feed % does not exist', p_feed using errcode = 'foreign_key_violation';
  end if;

  if p_dry_run then
    select jsonb_build_object(
             'created', count(*) filter (where n = 0),
             'merged', count(*) filter (where n = 1),
             'ambiguous', coalesce(jsonb_agg(mobile) filter (where n > 1), '[]'::jsonb))
      into v_total
      from (select r.value ->> 'mobile' as mobile,
                   (select count(*) from leads l
                     where l.contact_mobile = r.value ->> 'mobile' and l.org_id = v_org) as n
              from jsonb_array_elements(p_rows) r) x;
    return v_total;
  end if;

  select cursor into v_cursor from lead_feeds where name = p_feed for update;
  -- A plain error (P0001, HTTP 400): serialization_failure reaches the client
  -- as a 503, which it retries for half a minute before giving up.
  if v_cursor is distinct from p_from then
    raise exception 'the page starts at cursor %, but feed % stopped at %', p_from, p_feed, v_cursor;
  end if;

  for v_source in select distinct trim(r.value ->> 'source') from jsonb_array_elements(p_rows) r loop
    insert into lead_sources (name) values (v_source) on conflict do nothing;
    select id into v_source_id from lead_sources where lower(trim(name)) = lower(v_source);
    v_part := internal.merge_lead_rows(
      v_org,
      v_source_id,
      (select jsonb_agg(r.value) from jsonb_array_elements(p_rows) r where trim(r.value ->> 'source') = v_source));
    v_total := jsonb_build_object(
      'created', (v_total ->> 'created')::int + (v_part ->> 'created')::int,
      'merged', (v_total ->> 'merged')::int + (v_part ->> 'merged')::int,
      'ambiguous', (v_total -> 'ambiguous') || (v_part -> 'ambiguous'));
  end loop;

  update lead_feeds
     set cursor = p_next, last_synced_at = now(), last_error = null, last_result = v_total
   where name = p_feed;
  return v_total;
end
$$;

drop policy lead_feeds_read on public.lead_feeds;
create policy lead_feeds_read on public.lead_feeds
  for select to authenticated
  using (public.auth_role() in ('counsellor', 'superadmin') and public.in_my_org(org_id));

-- ── the paper test's sheet photo ────────────────────────────────────────────

create or replace function public.omr_sheet_writable(p_name text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
     and exists (
       select 1 from public.assessments a
         join public.leads l on l.id = a.lead_id
        where a.id = substring(p_name from 1 for 36)::uuid
          and a.mode = 'paper'
          and a.state = 'issued'
          and public.in_my_org(l.org_id)
     )
$$;

-- Reading a photo, filed or not, is for the paper's own org.
create or replace function public.omr_sheet_readable(p_name text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$' then exists (
      select 1 from public.assessments a
        join public.leads l on l.id = a.lead_id
       where a.id = substring(p_name from 1 for 36)::uuid
         and public.in_my_org(l.org_id))
    else false
  end
$$;
revoke all on function public.omr_sheet_readable(text) from public, anon;
grant execute on function public.omr_sheet_readable(text) to authenticated;

drop policy omr_sheets_read on storage.objects;
create policy omr_sheets_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'omr-sheets'
    and public.auth_role() in ('counsellor', 'superadmin')
    and public.omr_sheet_readable(name));

-- ── teacher applicants ──────────────────────────────────────────────────────

create or replace function public.hiring_applicants_stamp() returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'an applicant is added by a signed-in teacher or superadmin' using errcode = 'insufficient_privilege';
  end if;
  new.created_by := auth.uid();
  new.created_at := now();
  new.org_id := case when public.auth_role() = 'superadmin'
                     then coalesce(new.org_id, public.auth_org())
                     else public.auth_org() end;
  if new.org_id is null then
    raise exception 'your account belongs to no org' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

drop policy hiring_applicants_read on public.hiring_applicants;
drop policy hiring_applicants_decide on public.hiring_applicants;
drop function public.can_see_applicant(uuid);

-- Every applicant in the org, whoever added them (the owner's call).
create function public.can_see_applicant(p_org uuid) returns boolean
language sql
stable
as $$ select public.can_hire() and public.in_my_org(p_org) $$;

create policy hiring_applicants_read on public.hiring_applicants
  for select to authenticated using (public.can_see_applicant(org_id));
create policy hiring_applicants_decide on public.hiring_applicants
  for update to authenticated
  using (public.can_see_applicant(org_id))
  with check (public.can_see_applicant(org_id));

create or replace function public.hiring_resume_allowed(p_name text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1 from public.hiring_applicants a
       where a.id = p_name::uuid and public.can_see_applicant(a.org_id))
    else false
  end
$$;

-- ── unchanged but for the org check (copied from 0019, 0021 and 0023) ───────

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
  -- Another org's paper is "no such test", as a missing one is.
  if not found or not exists (select 1 from leads l where l.id = v_a.lead_id and public.in_my_org(l.org_id)) then
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
  if not found or not public.can_see_applicant(v_app.org_id) then
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

create or replace function public.attach_resume(p_applicant uuid, p_file_name text)
returns public.hiring_applicants
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app  public.hiring_applicants;
  v_mime text;
  v_type text;
  v_name text := btrim(coalesce(p_file_name, ''));
  v_had  boolean;
begin
  if not public.can_hire() then
    raise exception 'only a teacher or superadmin attaches a resume' using errcode = 'insufficient_privilege';
  end if;
  select * into v_app from hiring_applicants where id = p_applicant for update;
  if not found or not public.can_see_applicant(v_app.org_id) then
    raise exception 'no such applicant' using errcode = 'insufficient_privilege';
  end if;
  if char_length(v_name) not between 1 and 200 then
    raise exception 'a resume''s file name is 1 to 200 characters' using errcode = 'check_violation';
  end if;

  select metadata ->> 'mimetype' into v_mime
    from storage.objects where bucket_id = 'hiring-resumes' and name = p_applicant::text;
  if not found then
    raise exception 'upload the resume before attaching it' using errcode = 'check_violation';
  end if;
  v_type := case v_mime
    when 'application/pdf' then 'pdf'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
  end;
  if v_type is null then
    raise exception 'a resume is a PDF or a Word (.docx) file' using errcode = 'check_violation';
  end if;

  v_had := v_app.resume_at is not null;
  update hiring_applicants
     set resume_type = v_type, resume_name = v_name, resume_at = now()
   where id = v_app.id
  returning * into v_app;
  insert into hiring_notes (applicant_id, kind, body)
  values (v_app.id, 'resume', case when v_had then 'Resume replaced: ' else 'Resume added: ' end || v_name);
  return v_app;
end
$$;
