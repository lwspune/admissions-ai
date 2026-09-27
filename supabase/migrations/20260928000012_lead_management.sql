-- Lead management.
--
-- Leads arrive from many sources (WhatsApp sheets, ads, walk-ins), are worked
-- by telecallers, qualified to counsellors, and entered into EIS. They live in
-- the same `leads` table the test already uses, so a lead is one row whether
-- or not it is ever issued a paper, and the report, the reissue cap and the
-- purge all keep working unchanged.
--
-- What this adds, and where each rule is enforced:
--   * name becomes optional — imported sheets have rows with no name. Issuing
--     requires one (issue_assessment, below), because the candidate confirms
--     it on screen. A name can be corrected but never removed (leads_guard).
--   * stage, interest, assigned_to on the lead; CHECKs hold the vocabularies.
--   * telecallers see only leads assigned to them, and everything hanging off
--     those leads. Counsellors and superadmin see all. RLS, not a filter.
--   * only counsellors and superadmin assign, and only to a telecaller
--     (leads_guard). A lead a telecaller creates is theirs.
--   * lead_comments: history. Insert-only; the author is stamped from the
--     session, never taken from the client. Stage changes write themselves.
--   * lead_sources / lead_origins: where each lead came from, possibly many.
--   * import_leads(): a file is written in one transaction or not at all.
--
-- Retention: every new table cascades from leads, so the purge covers it. An
-- imported lead's created_at is the day it was imported; the date the source
-- recorded goes in lead_origins.source_date. Using the sheet's date would let
-- the purge delete a 2025 row the night it arrived. Whether leads that never
-- took a test should be purged at all is open (SUGGESTIONS.md) — it must be
-- settled before the first imported leads turn 12 months old.

-- ─────────────────────────────────────────────────────────────────────────────
-- leads: new columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.leads alter column name drop not null;
-- The existing CHECK (length(trim(name)) > 0) stays: a name is absent or real,
-- never blank.

alter table public.leads
  add column interest text
    constraint leads_interest_known check (interest in ('NDA', 'SPI')),
  add column stage text not null default 'new'
    constraint leads_stage_known check (stage in (
      'new', 'cnr', 'contacted', 'qualified', 'in_eis', 'not_interested')),
  add column assigned_to uuid references auth.users(id) on delete set null;

-- created_by was never filled in (the form did not send it). It is now, which
-- would start blocking the removal of any staff member who created a lead —
-- so the reference releases on delete, as assigned_to does.
alter table public.leads alter column created_by set default auth.uid();
alter table public.leads drop constraint leads_created_by_fkey;
alter table public.leads
  add constraint leads_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

create index leads_assigned_to_idx on public.leads (assigned_to);
create index leads_stage_idx on public.leads (stage);
create index leads_created_at_idx on public.leads (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- leads_guard: assignment and name rules
--
-- SECURITY DEFINER only to read a target's role from auth.users; auth_role()
-- and auth.uid() still read the caller's JWT.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.leads_guard() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
     ) then
    raise exception 'a lead can only be assigned to a telecaller'
      using errcode = 'check_violation';
  end if;

  return new;
end
$$;

create trigger leads_guard before insert or update on public.leads
  for each row execute function public.leads_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- lead_sources / lead_origins
-- ─────────────────────────────────────────────────────────────────────────────
create table public.lead_sources (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 80),
  -- Which header holds which field, remembered from the last import.
  column_map  jsonb not null default '{}' check (jsonb_typeof(column_map) = 'object'),
  created_by  uuid default auth.uid() references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- "WhatsApp" and "whatsapp " are one source, not two.
create unique index lead_sources_name_ci on public.lead_sources (lower(trim(name)));

create table public.lead_origins (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads(id) on delete cascade,
  -- No cascade: a source with leads behind it is not deletable.
  source_id    uuid not null references public.lead_sources(id),
  -- The date the source recorded, if any. Informational; never the
  -- retention clock.
  source_date  date,
  imported_by  uuid default auth.uid() references auth.users(id) on delete set null,
  imported_at  timestamptz not null default now()
);

create index lead_origins_lead_idx on public.lead_origins (lead_id);
create index lead_origins_source_idx on public.lead_origins (source_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- lead_comments: the history
-- ─────────────────────────────────────────────────────────────────────────────
create table public.lead_comments (
  id           bigint generated always as identity primary key,
  lead_id      uuid not null references public.leads(id) on delete cascade,
  kind         text not null default 'note' check (kind in ('note', 'stage', 'import')),
  body         text not null check (length(trim(body)) between 1 and 2000),
  author       uuid references auth.users(id) on delete set null,
  -- Captured at write time from app_metadata, so a telecaller can read who
  -- wrote a note without being able to list staff accounts.
  author_name  text,
  created_at   timestamptz not null default now()
);

create index lead_comments_lead_idx on public.lead_comments (lead_id, id);

-- Who wrote it and when come from the session, not the request body.
create or replace function public.lead_comments_stamp() returns trigger
language plpgsql
as $$
begin
  new.author := auth.uid();
  new.author_name := coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'name', ''),
    auth.jwt() ->> 'email'
  );
  new.created_at := now();
  return new;
end
$$;

create trigger lead_comments_stamp before insert on public.lead_comments
  for each row execute function public.lead_comments_stamp();

-- A stage change writes its own history line, as "old → new" in stage codes;
-- src/lib/leads.ts formatStageChange() renders it. DEFINER so the insert can
-- carry kind 'stage', which the insert policy refuses to anyone else.
create or replace function public.leads_stage_history() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into lead_comments (lead_id, kind, body)
  values (new.id, 'stage', old.stage || ' → ' || new.stage);
  return null;
end
$$;

create trigger leads_stage_history after update of stage on public.leads
  for each row when (old.stage is distinct from new.stage)
  execute function public.leads_stage_history();

-- ─────────────────────────────────────────────────────────────────────────────
-- Row level security
--
-- Visibility is stated once, on leads, and everything else inherits it by
-- asking "can I see the parent row?" — a policy's subquery is itself subject
-- to RLS. Callers enumerated before narrowing (the 0008 lesson): the candidate
-- API, the purge and the scripts run as service role and are unaffected; the
-- lead pages, issue_assessment and the report run as the staff member and
-- only ever act on a lead that member can see.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.can_see_lead(p_assigned_to uuid) returns boolean
language sql
stable
as $$
  select public.is_staff()
     and (public.auth_role() <> 'telecaller' or p_assigned_to = auth.uid())
$$;

drop policy leads_staff_all on public.leads;

create policy leads_staff_read on public.leads
  for select to authenticated using (public.can_see_lead(assigned_to));
create policy leads_staff_insert on public.leads
  for insert to authenticated with check (public.can_see_lead(assigned_to));
create policy leads_staff_update on public.leads
  for update to authenticated
  using (public.can_see_lead(assigned_to)) with check (public.can_see_lead(assigned_to));
-- Nothing in the app deletes a lead through a session; the purge is service role.
create policy leads_superadmin_delete on public.leads
  for delete to authenticated using (public.is_superadmin());

drop policy assessments_staff_all on public.assessments;
create policy assessments_staff_all on public.assessments
  for all to authenticated
  using (public.is_staff() and exists (select 1 from public.leads l where l.id = assessments.lead_id))
  with check (public.is_staff() and exists (select 1 from public.leads l where l.id = assessments.lead_id));

drop policy attempts_staff_read on public.attempts;
create policy attempts_staff_read on public.attempts
  for select to authenticated
  using (public.is_staff() and exists (select 1 from public.assessments a where a.id = attempts.assessment_id));

drop policy attempt_answers_staff_read on public.attempt_answers;
create policy attempt_answers_staff_read on public.attempt_answers
  for select to authenticated
  using (public.is_staff() and exists (select 1 from public.attempts t where t.id = attempt_answers.attempt_id));

drop policy attempt_events_staff_read on public.attempt_events;
create policy attempt_events_staff_read on public.attempt_events
  for select to authenticated
  using (public.is_staff() and exists (select 1 from public.attempts t where t.id = attempt_events.attempt_id));

-- Holds tokens (live test links) and IP addresses.
drop policy identify_attempts_staff_read on public.identify_attempts;
create policy identify_attempts_staff_read on public.identify_attempts
  for select to authenticated
  using (public.is_staff() and exists (select 1 from public.assessments a where a.token = identify_attempts.token));

alter table public.lead_sources  enable row level security;
alter table public.lead_origins  enable row level security;
alter table public.lead_comments enable row level security;

create policy lead_sources_staff_read on public.lead_sources
  for select to authenticated using (public.is_staff());
create policy lead_sources_import_insert on public.lead_sources
  for insert to authenticated with check (public.auth_role() in ('counsellor', 'superadmin'));
create policy lead_sources_import_update on public.lead_sources
  for update to authenticated
  using (public.auth_role() in ('counsellor', 'superadmin'))
  with check (public.auth_role() in ('counsellor', 'superadmin'));

create policy lead_origins_staff_read on public.lead_origins
  for select to authenticated
  using (public.is_staff() and exists (select 1 from public.leads l where l.id = lead_origins.lead_id));
create policy lead_origins_import_insert on public.lead_origins
  for insert to authenticated
  with check (public.auth_role() in ('counsellor', 'superadmin'));

-- No update or delete policy: history is append-only for everyone.
create policy lead_comments_staff_read on public.lead_comments
  for select to authenticated
  using (public.is_staff() and exists (select 1 from public.leads l where l.id = lead_comments.lead_id));
create policy lead_comments_staff_insert on public.lead_comments
  for insert to authenticated
  with check (
    public.is_staff()
    and kind in ('note', 'import')
    and exists (select 1 from public.leads l where l.id = lead_comments.lead_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- leads_on_mobile: "is this number taken?", across every lead
--
-- The add form checks for an existing lead on a number. Under the policy above
-- a telecaller cannot see another telecaller's leads, so that check would pass
-- and quietly create a duplicate. This answers the one question the form
-- needs — how many — and nothing about whose they are.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.leads_on_mobile(p_mobile text) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_staff()
              then (select count(*)::int from leads where contact_mobile = p_mobile)
              else 0 end
$$;

revoke all on function public.leads_on_mobile(text) from public;
grant execute on function public.leads_on_mobile(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- import_leads: one file, one transaction
--
-- p_rows is an array of {mobile, name, stage, interest, source_date, notes[]},
-- prepared by src/lib/leads.ts. Every value is re-checked here by the table
-- constraints; any failure aborts the whole file.
--
-- A number already on exactly one lead ADDS to it — an origin, the notes, and a
-- name or interest only where the lead has none. Stage and assignment are
-- never touched: that is the lesson of the seed that demoted the live bank.
-- A number on several leads (siblings) is not guessed at; it is returned.
--
-- SECURITY INVOKER: the caller's own policies apply to every write.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.import_leads(p_source_id uuid, p_rows jsonb)
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
  if public.auth_role() not in ('counsellor', 'superadmin') then
    raise exception 'only a counsellor or superadmin can import leads'
      using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows must be a JSON array' using errcode = 'invalid_parameter_value';
  end if;
  if not exists (select 1 from lead_sources where id = p_source_id) then
    raise exception 'source % does not exist', p_source_id using errcode = 'foreign_key_violation';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_mobile := r ->> 'mobile';

    select array_agg(id) into v_ids from leads where contact_mobile = v_mobile;

    if coalesce(array_length(v_ids, 1), 0) > 1 then
      v_ambiguous := v_ambiguous || v_mobile;
      continue;
    end if;

    if v_ids is null then
      insert into leads (name, contact_mobile, interest, stage)
      values (
        nullif(trim(r ->> 'name'), ''),
        v_mobile,
        r ->> 'interest',
        coalesce(r ->> 'stage', 'new')
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

revoke all on function public.import_leads(uuid, jsonb) from public;
grant execute on function public.import_leads(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- issue_assessment: now also requires a name
--
-- Identical to migration 0011 but for the name check. The candidate is asked
-- to confirm their name before the paper opens; a nameless lead would show
-- them a blank.
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
  v_seq   int;
  v_class smallint;
  v_name  text;
  v_fit   int;
  v_row   public.assessments;
begin
  if array_length(p_item_ids, 1) is distinct from 15 then
    raise exception 'a paper must hold exactly 15 items, got %',
      coalesce(array_length(p_item_ids, 1), 0)
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
  if v_fit <> 15 then
    raise exception
      'paper for lead % holds an item that is not live or is above the class % content ceiling (% of 15 fit)',
      p_lead_id, v_class, v_fit
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

  insert into assessments (lead_id, token, issue_seq, issued_by)
  values (p_lead_id, p_token, v_seq, p_issued_by)
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
