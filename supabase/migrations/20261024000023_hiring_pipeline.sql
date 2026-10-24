-- After the test: a decision, notes and a resume on each teacher applicant
-- (2026-10-24). HIRING_TEST_SPEC.md §5.
--
--   • decision: in_progress → shortlisted / on_hold / hired / rejected /
--     withdrawn. A teacher sets it on their own applicants; hired and rejected
--     are superadmin's, both into and out of them (the owner's call), and a
--     trigger, not the page, says so. Every change writes a history line.
--     Nothing sets it from the score: a person decides.
--   • hiring_notes: the history, as lead_comments is for a lead. Insert-only;
--     the author is stamped from the session; a signed-in user writes only
--     kind 'note'. Decision and resume lines come from the functions below.
--   • Resumes: the private hiring-resumes bucket, one file per applicant named
--     by the applicant's id, PDF or Word (.docx), at most 5 MB. The browser
--     uploads it on the session client (the storage policy decides) and
--     attach_resume() records it, after checking the file is really there.
--   • Applicants are kept: the owner's call, so past applicants inform future
--     hiring. The purge no longer touches them (src/server/retention.ts).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.hiring_applicants
  add column decision text not null default 'in_progress'
    constraint hiring_applicants_decision_known check (decision in (
      'in_progress', 'shortlisted', 'on_hold', 'hired', 'rejected', 'withdrawn')),
  add column resume_type text check (resume_type in ('pdf', 'docx')),
  add column resume_name text check (char_length(resume_name) between 1 and 200),
  add column resume_at   timestamptz,
  add constraint hiring_applicants_resume_whole check (
    (resume_at is null) = (resume_type is null) and (resume_at is null) = (resume_name is null));

-- ── notes: the history ──────────────────────────────────────────────────────

create table public.hiring_notes (
  id           bigint generated always as identity primary key,
  applicant_id uuid not null references public.hiring_applicants(id) on delete cascade,
  kind         text not null default 'note' check (kind in ('note', 'decision', 'resume')),
  body         text not null check (char_length(btrim(body)) between 1 and 2000),
  author       uuid references auth.users(id) on delete set null,
  -- Captured at write time from app_metadata, so a teacher reads who wrote a
  -- line without being able to list staff accounts.
  author_name  text,
  created_at   timestamptz not null default now()
);

create index hiring_notes_applicant_idx on public.hiring_notes (applicant_id, id);

create or replace function public.hiring_notes_stamp() returns trigger
language plpgsql
as $$
begin
  new.author := auth.uid();
  new.author_name := coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'name', ''), auth.jwt() ->> 'email');
  new.created_at := now();
  return new;
end
$$;

create trigger hiring_notes_stamp before insert on public.hiring_notes
  for each row execute function public.hiring_notes_stamp();

-- ── decision ────────────────────────────────────────────────────────────────

create or replace function public.hiring_applicants_decision_guard() returns trigger
language plpgsql
as $$
begin
  if (old.decision in ('hired', 'rejected') or new.decision in ('hired', 'rejected'))
     and public.auth_role() <> 'superadmin' then
    raise exception 'only superadmin decides hired or rejected' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger hiring_applicants_decision_guard
  before update of decision on public.hiring_applicants
  for each row when (old.decision is distinct from new.decision)
  execute function public.hiring_applicants_decision_guard();

-- A decision change writes its own line, "old → new" in codes; src/lib/hiring.ts
-- formatDecisionChange() words it. DEFINER so the line can carry kind
-- 'decision', which the insert policy refuses to anyone signed in.
create or replace function public.hiring_applicants_decision_history() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into hiring_notes (applicant_id, kind, body)
  values (new.id, 'decision', old.decision || ' → ' || new.decision);
  return null;
end
$$;

create trigger hiring_applicants_decision_history
  after update of decision on public.hiring_applicants
  for each row when (old.decision is distinct from new.decision)
  execute function public.hiring_applicants_decision_history();

-- ── resumes ─────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hiring-resumes', 'hiring-resumes', false, 5242880,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

-- A file name is an applicant's id, and this session may see that applicant.
-- DEFINER, as omr_sheet_writable is, so the storage policy does not depend on
-- the applicants table's own policy. The CASE keeps the cast behind the match.
create or replace function public.hiring_resume_allowed(p_name text) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then exists (
      select 1 from public.hiring_applicants a
       where a.id = p_name::uuid and public.can_see_applicant(a.created_by))
    else false
  end
$$;

create policy hiring_resumes_read on storage.objects
  for select to authenticated
  using (bucket_id = 'hiring-resumes' and public.hiring_resume_allowed(name));

create policy hiring_resumes_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'hiring-resumes' and public.hiring_resume_allowed(name));

-- An upsert replacing the file. Nobody signed in deletes one.
create policy hiring_resumes_update on storage.objects
  for update to authenticated
  using (bucket_id = 'hiring-resumes' and public.hiring_resume_allowed(name))
  with check (bucket_id = 'hiring-resumes' and public.hiring_resume_allowed(name));

-- Records the uploaded file on the applicant and writes the history line.
-- The type is read from the stored object, never taken from the caller.
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
  if not found or not public.can_see_applicant(v_app.created_by) then
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

revoke all on function public.attach_resume(uuid, text) from public, anon;
grant execute on function public.attach_resume(uuid, text) to authenticated;
revoke all on function public.hiring_resume_allowed(text) from public, anon;
grant execute on function public.hiring_resume_allowed(text) to authenticated;

-- ── access ──────────────────────────────────────────────────────────────────

alter table public.hiring_notes enable row level security;

create policy hiring_notes_read on public.hiring_notes
  for select to authenticated
  using (exists (select 1 from public.hiring_applicants a where a.id = applicant_id));
create policy hiring_notes_add on public.hiring_notes
  for insert to authenticated
  with check (
    public.can_hire()
    and kind = 'note'
    and exists (select 1 from public.hiring_applicants a where a.id = applicant_id));

create policy hiring_applicants_decide on public.hiring_applicants
  for update to authenticated
  using (public.can_see_applicant(created_by))
  with check (public.can_see_applicant(created_by));

revoke all on public.hiring_notes from anon, authenticated;
grant select on public.hiring_notes to authenticated;
grant insert (applicant_id, body) on public.hiring_notes to authenticated;
grant update (decision) on public.hiring_applicants to authenticated;
