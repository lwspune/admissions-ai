-- Probe: decision, notes and resume on a teacher applicant (migration 0023).
-- Run with `npm run db:probe -- 0023`.
--
-- Uses two existing logins as two teachers (their ids only; nothing about them
-- changes). ONE statement that always ends by raising, so every row — the
-- storage rows too — rolls back and no other session sees any of it.

do $$
declare
  v_out   text := '';
  v_fail  boolean := false;
  v_ids   uuid[];
  v_t1    uuid;
  v_t2    uuid;
  v_c_t1  text;
  v_c_t2  text;
  v_c_sa  text;
  v_c_co  text;
  v_app   uuid;
  v_row   public.hiring_applicants;
  v_n     int;
  v_note  public.hiring_notes;
  v_body  text;
  v_pdf   constant jsonb := '{"mimetype": "application/pdf", "size": 1000}';
begin
  select array_agg(id) into v_ids from (select id from auth.users order by created_at limit 2) u;
  if coalesce(array_length(v_ids, 1), 0) < 2 then
    raise exception 'PROBE-FAIL needs two existing logins to stand in as teachers';
  end if;
  v_t1 := v_ids[1];
  v_t2 := v_ids[2];
  v_c_t1 := json_build_object('role', 'authenticated', 'sub', v_t1,
    'app_metadata', json_build_object('role', 'teacher', 'name', 'Probe Teacher'))::text;
  v_c_t2 := json_build_object('role', 'authenticated', 'sub', v_t2,
    'app_metadata', json_build_object('role', 'teacher'))::text;
  v_c_sa := json_build_object('role', 'authenticated', 'sub', v_t2,
    'app_metadata', json_build_object('role', 'superadmin', 'name', 'Probe Admin'))::text;
  v_c_co := json_build_object('role', 'authenticated', 'sub', v_t2,
    'app_metadata', json_build_object('role', 'counsellor'))::text;

  -- ── a new applicant starts in progress, with no resume ────────────────────
  perform set_config('request.jwt.claims', v_c_t1, true);
  execute 'set local role authenticated';
  insert into public.hiring_applicants (name, mobile, subject)
  values ('Probe Applicant', '9700002301', 'maths')
  returning * into v_row;
  v_app := v_row.id;
  if v_row.decision <> 'in_progress' or v_row.resume_at is not null then
    v_fail := true; v_out := v_out || format('NEW APPLICANT IS %s; ', v_row.decision);
  end if;

  -- ── notes: author from the session, never edited, never deleted ───────────
  insert into public.hiring_notes (applicant_id, body) values (v_app, 'Probe note') returning * into v_note;
  if v_note.author <> v_t1 or v_note.author_name <> 'Probe Teacher' or v_note.kind <> 'note' then
    v_fail := true; v_out := v_out || 'NOTE NOT STAMPED; ';
  end if;
  begin
    insert into public.hiring_notes (applicant_id, body, author) values (v_app, 'Forged', v_t2);
    v_fail := true; v_out := v_out || 'CLIENT SET AUTHOR; ';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hiring_notes (applicant_id, kind, body) values (v_app, 'decision', 'in_progress → hired');
    v_fail := true; v_out := v_out || 'CLIENT WROTE A DECISION LINE; ';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.hiring_notes set body = 'changed' where id = v_note.id;
    v_fail := true; v_out := v_out || 'NOTE EDITED; ';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.hiring_notes where id = v_note.id;
    v_fail := true; v_out := v_out || 'NOTE DELETED; ';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.hiring_notes (applicant_id, body) values (v_app, '   ');
    v_fail := true; v_out := v_out || 'BLANK NOTE TAKEN; ';
  exception when check_violation then null;
  end;
  v_out := v_out || 'notes stamped and append-only; ';

  -- ── a teacher sets the open decisions, and only the decision ──────────────
  update public.hiring_applicants set decision = 'shortlisted' where id = v_app;
  get diagnostics v_n = row_count;
  if v_n <> 1 then v_fail := true; v_out := v_out || 'TEACHER COULD NOT SHORTLIST; '; end if;
  select * into v_note from public.hiring_notes where applicant_id = v_app and kind = 'decision' order by id desc limit 1;
  if v_note.body is distinct from 'in_progress → shortlisted' or v_note.author is distinct from v_t1 then
    v_fail := true; v_out := v_out || format('NO DECISION LINE (%s); ', v_note.body);
  end if;
  begin
    update public.hiring_applicants set decision = 'maybe' where id = v_app;
    v_fail := true; v_out := v_out || 'UNKNOWN DECISION TAKEN; ';
  exception when check_violation then null;
  end;
  begin
    update public.hiring_applicants set name = 'Renamed' where id = v_app;
    v_fail := true; v_out := v_out || 'TEACHER RENAMED; ';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.hiring_applicants set resume_at = now(), resume_type = 'pdf', resume_name = 'x.pdf' where id = v_app;
    v_fail := true; v_out := v_out || 'TEACHER SET RESUME COLUMNS; ';
  exception when insufficient_privilege then null;
  end;

  -- ── hired and rejected are superadmin's, both ways ────────────────────────
  begin
    update public.hiring_applicants set decision = 'hired' where id = v_app;
    v_fail := true; v_out := v_out || 'TEACHER HIRED; ';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.hiring_applicants set decision = 'rejected' where id = v_app;
    v_fail := true; v_out := v_out || 'TEACHER REJECTED; ';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_sa, true);
  execute 'set local role authenticated';
  update public.hiring_applicants set decision = 'rejected' where id = v_app;
  get diagnostics v_n = row_count;
  if v_n <> 1 then v_fail := true; v_out := v_out || 'SUPERADMIN COULD NOT REJECT; '; end if;
  select author_name into v_body from public.hiring_notes where applicant_id = v_app and kind = 'decision' order by id desc limit 1;
  if v_body is distinct from 'Probe Admin' then v_fail := true; v_out := v_out || 'DECISION LINE NOT SUPERADMIN''S; '; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_t1, true);
  execute 'set local role authenticated';
  begin
    update public.hiring_applicants set decision = 'in_progress' where id = v_app;
    v_fail := true; v_out := v_out || 'TEACHER UNDID A REJECTION; ';
  exception when insufficient_privilege then null;
  end;
  v_out := v_out || 'hired/rejected superadmin only; ';

  -- ── another teacher and a counsellor see and change nothing ───────────────
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_t2, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.hiring_notes where applicant_id = v_app;
  if v_n <> 0 then v_fail := true; v_out := v_out || 'OTHER TEACHER SEES NOTES; '; end if;
  begin
    insert into public.hiring_notes (applicant_id, body) values (v_app, 'Not mine');
    v_fail := true; v_out := v_out || 'OTHER TEACHER ADDED A NOTE; ';
  exception when insufficient_privilege then null;
  end;
  update public.hiring_applicants set decision = 'on_hold' where id = v_app;
  get diagnostics v_n = row_count;
  if v_n <> 0 then v_fail := true; v_out := v_out || 'OTHER TEACHER DECIDED; '; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('hiring-resumes', v_app::text, v_pdf);
    v_fail := true; v_out := v_out || 'OTHER TEACHER UPLOADED; ';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.attach_resume(v_app, 'x.pdf');
    v_fail := true; v_out := v_out || 'OTHER TEACHER ATTACHED; ';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_co, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.hiring_notes;
  if v_n <> 0 then v_fail := true; v_out := v_out || 'COUNSELLOR SEES NOTES; '; end if;
  v_out := v_out || 'others see nothing; ';

  -- ── the resume: uploaded under the applicant's id, then attached ──────────
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_t1, true);
  execute 'set local role authenticated';
  begin
    perform public.attach_resume(v_app, 'CV.pdf');
    v_fail := true; v_out := v_out || 'ATTACHED WITH NO FILE; ';
  exception when check_violation then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('hiring-resumes', 'not-an-applicant', v_pdf);
    v_fail := true; v_out := v_out || 'UPLOADED UNDER A STRAY NAME; ';
  exception when insufficient_privilege then null;
  end;
  insert into storage.objects (bucket_id, name, metadata) values ('hiring-resumes', v_app::text, v_pdf);
  v_row := public.attach_resume(v_app, '  Asha CV.pdf ');
  if v_row.resume_type <> 'pdf' or v_row.resume_name <> 'Asha CV.pdf' or v_row.resume_at is null then
    v_fail := true; v_out := v_out || format('BAD ATTACH %s %s; ', v_row.resume_type, v_row.resume_name);
  end if;
  select body into v_body from public.hiring_notes where applicant_id = v_app and kind = 'resume' order by id desc limit 1;
  if v_body is distinct from 'Resume added: Asha CV.pdf' then v_fail := true; v_out := v_out || format('RESUME LINE %s; ', v_body); end if;

  -- Replaced by a Word file: the same name, upserted.
  update storage.objects
     set metadata = '{"mimetype": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "size": 2000}'
   where bucket_id = 'hiring-resumes' and name = v_app::text;
  get diagnostics v_n = row_count;
  if v_n <> 1 then v_fail := true; v_out := v_out || 'TEACHER COULD NOT REPLACE; '; end if;
  v_row := public.attach_resume(v_app, 'Asha CV.docx');
  if v_row.resume_type <> 'docx' then v_fail := true; v_out := v_out || 'DOCX NOT RECORDED; '; end if;
  select body into v_body from public.hiring_notes where applicant_id = v_app and kind = 'resume' order by id desc limit 1;
  if v_body is distinct from 'Resume replaced: Asha CV.docx' then v_fail := true; v_out := v_out || format('REPLACE LINE %s; ', v_body); end if;

  -- A file of another kind, however it got there, is not attached.
  execute 'reset role';
  update storage.objects set metadata = '{"mimetype": "text/html"}' where bucket_id = 'hiring-resumes' and name = v_app::text;
  perform set_config('request.jwt.claims', v_c_t1, true);
  execute 'set local role authenticated';
  begin
    perform public.attach_resume(v_app, 'page.html');
    v_fail := true; v_out := v_out || 'HTML ATTACHED; ';
  exception when check_violation then null;
  end;

  -- Read: the teacher and superadmin; not another teacher, not a counsellor.
  select count(*) into v_n from storage.objects where bucket_id = 'hiring-resumes' and name = v_app::text;
  if v_n <> 1 then v_fail := true; v_out := v_out || 'TEACHER CANNOT READ RESUME; '; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_sa, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'hiring-resumes' and name = v_app::text;
  if v_n <> 1 then v_fail := true; v_out := v_out || 'SUPERADMIN CANNOT READ RESUME; '; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_t2, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'hiring-resumes' and name = v_app::text;
  if v_n <> 0 then v_fail := true; v_out := v_out || 'OTHER TEACHER READS RESUME; '; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', v_c_co, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'hiring-resumes';
  if v_n <> 0 then v_fail := true; v_out := v_out || 'COUNSELLOR READS RESUMES; '; end if;
  execute 'reset role';

  -- The bucket itself: private, 5 MB, PDF and Word only.
  if not exists (
    select 1 from storage.buckets
     where id = 'hiring-resumes' and not public and file_size_limit = 5242880
       and allowed_mime_types @> array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
       and cardinality(allowed_mime_types) = 2
  ) then
    v_fail := true; v_out := v_out || 'BUCKET WRONG; ';
  end if;
  v_out := v_out || 'resume uploaded, attached, replaced, read by the right people';

  raise exception '% %', case when v_fail then 'PROBE-FAIL' else 'PROBE-PASS' end, v_out;
end
$$;
