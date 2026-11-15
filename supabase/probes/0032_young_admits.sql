-- Probe: admits to classes 5–7 (migration 0032). Run with `npm run db:probe -- 0032`.
--
-- The database takes classes 5–12 and content tagged down to class 4, and the
-- N−1 rule in live_pool() reaches the new classes. One DO block that always
-- ends by raising, so every row it writes rolls back.

do $$
declare
  v_org    uuid := 'b31b8575-91c2-434a-b025-a7d12d3c0988';
  v_lead   uuid;
  v_b4     uuid;
  v_b5     uuid;
  v_s4     uuid;
  v_s4t2   uuid;
  v_out    text := '';
  v_fail   boolean := false;
  v_ids    uuid[];
begin
  -- Leads: 5 is admitted now, 4 is not.
  begin
    insert into public.leads (name, contact_mobile, class_level, org_id)
    values ('Probe Class5', '9700003205', 5, v_org) returning id into v_lead;
    v_out := v_out || 'ok: a class 5 lead. ';
  exception when others then
    v_fail := true; v_out := v_out || 'FAIL: class 5 lead refused: ' || sqlerrm || '. ';
  end;
  begin
    insert into public.leads (name, contact_mobile, class_level, org_id)
    values ('Probe Class4', '9700003204', 4, v_org);
    v_fail := true; v_out := v_out || 'FAIL: a class 4 lead was accepted. ';
  exception when check_violation then
    v_out := v_out || 'ok: refuses a class 4 lead. ';
  end;

  -- Papers record class 5.
  if v_lead is not null then
    begin
      insert into public.assessments (lead_id, token, issue_seq, class_level)
      values (v_lead, 'probe-young-0000000001', 1, 5);
      v_out := v_out || 'ok: a class 5 paper. ';
    exception when others then
      v_fail := true; v_out := v_out || 'FAIL: class 5 paper refused: ' || sqlerrm || '. ';
    end;
  end if;

  -- Items: tags down to 4, for basics and syllabus; 3 refused for both.
  begin
    insert into public.test_items (subject, skill, difficulty, format, stem, numeric_answer, rationale, status, taught_in)
    values ('maths', 'probe', 'easy', 'numeric', 'probe young b4', 1, 'probe', 'live', 4) returning id into v_b4;
    insert into public.test_items (subject, skill, difficulty, format, stem, numeric_answer, rationale, status, taught_in)
    values ('maths', 'probe', 'easy', 'numeric', 'probe young b5', 1, 'probe', 'live', 5) returning id into v_b5;
    insert into public.test_items (subject, skill, difficulty, format, stem, numeric_answer, rationale, status, taught_in, part, term)
    values ('science', 'probe', 'easy', 'numeric', 'probe young s4', 1, 'probe', 'live', 4, 'syllabus', 1) returning id into v_s4;
    insert into public.test_items (subject, skill, difficulty, format, stem, numeric_answer, rationale, status, taught_in, part, term)
    values ('science', 'probe', 'easy', 'numeric', 'probe young s4t2', 1, 'probe', 'live', 4, 'syllabus', 2) returning id into v_s4t2;
    v_out := v_out || 'ok: items tagged class 4 and 5. ';
  exception when others then
    v_fail := true; v_out := v_out || 'FAIL: a class 4 or 5 item refused: ' || sqlerrm || '. ';
  end;
  begin
    insert into public.test_items (subject, skill, difficulty, format, stem, numeric_answer, rationale, taught_in)
    values ('maths', 'probe', 'easy', 'numeric', 'probe young b3', 1, 'probe', 3);
    v_fail := true; v_out := v_out || 'FAIL: a basics item at class 3 was accepted. ';
  exception when check_violation then
    v_out := v_out || 'ok: refuses basics at class 3. ';
  end;
  begin
    insert into public.test_items (subject, skill, difficulty, format, stem, numeric_answer, rationale, taught_in, part, term)
    values ('maths', 'probe', 'easy', 'numeric', 'probe young s3', 1, 'probe', 3, 'syllabus', 1);
    v_fail := true; v_out := v_out || 'FAIL: a syllabus item at class 3 was accepted. ';
  exception when check_violation then
    v_out := v_out || 'ok: refuses syllabus at class 3. ';
  end;

  -- The draw for a class 5 admit: basics up to 4, syllabus exactly 4 term 1.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    select array_agg(lp.id) into v_ids from public.live_pool(5::smallint) lp;
    if v_b4 = any(v_ids) and v_s4 = any(v_ids)
       and not (v_b5 = any(coalesce(v_ids, '{}'))) and not (v_s4t2 = any(coalesce(v_ids, '{}'))) then
      v_out := v_out || 'ok: live_pool(5) draws class 4 basics and first-term syllabus only. ';
    else
      v_fail := true; v_out := v_out || 'FAIL: live_pool(5) drew the wrong set. ';
    end if;
    select array_agg(lp.id) into v_ids from public.live_pool(4::smallint) lp;
    if v_ids is null then
      v_out := v_out || 'ok: live_pool(4) draws nothing. ';
    else
      v_fail := true; v_out := v_out || 'FAIL: live_pool(4) drew items. ';
    end if;
  exception when others then
    v_fail := true; v_out := v_out || 'FAIL: live_pool: ' || sqlerrm || '. ';
  end;

  raise exception '% %', case when v_fail then 'PROBE-FAIL' else 'PROBE-PASS' end, v_out;
end
$$;
