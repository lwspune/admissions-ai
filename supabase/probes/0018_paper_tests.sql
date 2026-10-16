-- Probe: a paper test's numeric cap (migration 0018). Run with `npm run db:probe`.
--
-- Proving the cap needs a paper with more numeric questions than the sheet's
-- 18 boxes, which the real bank cannot supply, so this inserts live probe
-- items. Everything happens inside ONE statement that always ends by raising:
-- the raise rolls the whole block back, so no other session ever sees a probe
-- item and no real candidate can draw one. The raised message carries the
-- result; `db:probe` passes a file whose message says PROBE-PASS.

do $$
declare
  v_lead   uuid;
  v_items  uuid[] := '{}';
  v_ids    uuid[];
  v_out    text := '';
  v_fail   boolean := false;
  v_sub    text;
  v_part   text;
  v_diff   text;
  v_n      int;
begin
  -- Twenty numeric items, one per maths and science slot of a class 12 paper:
  -- basics at taught_in 6, syllabus at class 11 first term.
  foreach v_sub in array array['maths', 'science'] loop
    foreach v_part in array array['basics', 'syllabus'] loop
      foreach v_diff in array array['easy', 'moderate', 'difficult'] loop
        v_n := case v_diff when 'easy' then 3 else 1 end;
        with ins as (
          insert into public.test_items
            (subject, part, taught_in, term, skill, difficulty, format, stem, numeric_answer, rationale, status)
          select v_sub, v_part,
                 case v_part when 'basics' then 6 else 11 end,
                 case v_part when 'basics' then null else 1 end,
                 'probe', v_diff, 'numeric',
                 format('probe %s %s %s %s', v_sub, v_part, v_diff, g), g, 'probe', 'live'
            from generate_series(1, v_n) g
          returning id
        )
        select array_agg(id) into v_ids from ins;
        v_items := v_items || v_ids;
      end loop;
    end loop;
  end loop;

  -- Ten English from the real pool, at the paper's 6 / 2 / 2.
  select v_items || array_agg(id) into v_items from (
    (select id from public.test_items where status = 'live' and subject = 'english' and part = 'basics' and difficulty = 'easy' limit 6)
    union all
    (select id from public.test_items where status = 'live' and subject = 'english' and part = 'basics' and difficulty = 'moderate' limit 2)
    union all
    (select id from public.test_items where status = 'live' and subject = 'english' and part = 'basics' and difficulty = 'difficult' limit 2)
  ) e;

  insert into public.leads (name, contact_mobile, class_level)
  values ('Probe Paper', '9700009999', 12)
  returning id into v_lead;

  -- From here on, a signed-in counsellor.
  perform set_config('request.jwt.claims', '{"role":"authenticated","app_metadata":{"role":"counsellor"}}', true);
  execute 'set local role authenticated';

  begin
    perform public.issue_assessment(v_lead, null, 'probe-paper-cap-0000001', v_items, 'paper');
    v_fail := true;
    v_out := v_out || 'FAIL: a paper test with 20 numeric questions was issued. ';
  exception when others then
    if sqlerrm like '%18 numeric%' then
      v_out := v_out || 'ok: refuses a paper test with 20 numeric questions. ';
    else
      v_fail := true;
      v_out := v_out || 'FAIL: refused for the wrong reason: ' || sqlerrm || '. ';
    end if;
  end;

  -- The cap is the sheet's, so the same paper online is fine.
  begin
    perform public.issue_assessment(v_lead, null, 'probe-paper-cap-0000002', v_items, 'online');
    v_out := v_out || 'ok: the same paper is accepted online. ';
  exception when others then
    v_fail := true;
    v_out := v_out || 'FAIL: the same paper was refused online: ' || sqlerrm || '. ';
  end;

  raise exception '% %', case when v_fail then 'PROBE-FAIL' else 'PROBE-PASS' end, v_out;
end
$$;
