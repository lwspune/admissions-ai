-- Probe: orgs on the paper test and the feed (migration 0030).
-- Run with `npm run db:probe -- 0030`.
--
-- What orgs.itest.ts cannot reach through the API: a paper test's sheet photo
-- and scan, which go through SECURITY DEFINER functions that skip RLS, and the
-- feed's status row. Two probe orgs, a lead in A with a paper test issued by
-- A's counsellor, then B's counsellor tries each door. ONE statement that
-- always ends by raising, so every row (the storage row too) rolls back.

do $$
declare
  v_out    text := '';
  v_fail   boolean := false;
  v_a      uuid;
  v_b      uuid;
  v_lead   uuid;
  v_items  uuid[];
  v_test   public.assessments;
  v_photo  text;
  v_c_a    text;
  v_c_b    text;
  v_n      int;
  v_ids    uuid[];
begin
  insert into public.organizations (slug, name) values ('probe-org-a', 'Probe Org A') returning id into v_a;
  insert into public.organizations (slug, name) values ('probe-org-b', 'Probe Org B') returning id into v_b;
  -- Two existing logins stand in as the counsellors (their ids only, since a
  -- history line's author must be a real account; nothing about them changes).
  select array_agg(id) into v_ids from (select id from auth.users order by created_at limit 2) u;
  if coalesce(array_length(v_ids, 1), 0) < 2 then
    raise exception 'PROBE-FAIL needs two existing logins to stand in as counsellors';
  end if;
  v_c_a := json_build_object('role', 'authenticated', 'sub', v_ids[1],
    'app_metadata', json_build_object('role', 'counsellor', 'org_id', v_a))::text;
  v_c_b := json_build_object('role', 'authenticated', 'sub', v_ids[2],
    'app_metadata', json_build_object('role', 'counsellor', 'org_id', v_b))::text;

  insert into public.leads (name, contact_mobile, class_level, org_id)
  values ('Probe Orgs', '9700003099', 12, v_a)
  returning id into v_lead;

  insert into public.lead_feeds (name, org_id) values ('probe_feed_b', v_b);

  -- ── A's counsellor issues a paper test ────────────────────────────────────
  -- live_pool() answers only a staff session, so the draw comes after this.
  perform set_config('request.jwt.claims', v_c_a, true);
  execute 'set local role authenticated';

  -- A class 12 paper from the real pool, at SHAPE_30's quotas, MCQ first so
  -- the sheet's 18 numeric boxes are never the reason for a refusal.
  select array_agg(id) into v_items from (
    select id, subject, part, difficulty,
           row_number() over (partition by subject, part, difficulty order by format = 'numeric', id) as rn
      from public.live_pool(12::smallint)
  ) p
  where rn <= case
    when subject = 'english' then case difficulty when 'easy' then 6 else 2 end
    else case difficulty when 'easy' then 3 else 1 end
  end;

  v_test := public.issue_assessment(v_lead, null, 'probe-orgs-paper-00001', v_items, 'paper');
  v_photo := v_test.id::text || '.jpg';
  if not public.omr_sheet_writable(v_photo) then
    v_fail := true; v_out := v_out || 'A CANNOT WRITE ITS OWN PHOTO; ';
  end if;
  execute 'reset role';

  insert into storage.objects (bucket_id, name, metadata)
  values ('omr-sheets', v_photo, '{"mimetype": "image/jpeg", "size": 1000}');

  -- ── B's counsellor tries each door ────────────────────────────────────────
  perform set_config('request.jwt.claims', v_c_b, true);
  execute 'set local role authenticated';

  if public.omr_sheet_writable(v_photo) then
    v_fail := true; v_out := v_out || 'B MAY WRITE A''S PHOTO; ';
  end if;

  select count(*) into v_n from storage.objects where bucket_id = 'omr-sheets' and name = v_photo;
  if v_n <> 0 then
    v_fail := true; v_out := v_out || 'B READS A''S PHOTO; ';
  end if;

  begin
    perform public.record_paper_scan(v_test.id, '[]'::jsonb);
    v_fail := true; v_out := v_out || 'B FILED A''S SCAN; ';
  exception when others then
    if sqlerrm not like '%no such test%' then
      v_fail := true; v_out := v_out || format('B REFUSED FOR THE WRONG REASON (%s); ', sqlerrm);
    end if;
  end;

  select count(*) into v_n from public.lead_feeds where name = 'probe_feed_b';
  if v_n <> 1 then
    v_fail := true; v_out := v_out || 'B CANNOT SEE ITS OWN FEED; ';
  end if;
  execute 'reset role';

  -- ── and A sees its own photo, but not B's feed ────────────────────────────
  perform set_config('request.jwt.claims', v_c_a, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects where bucket_id = 'omr-sheets' and name = v_photo;
  if v_n <> 1 then
    v_fail := true; v_out := v_out || 'A CANNOT READ ITS OWN PHOTO; ';
  end if;
  select count(*) into v_n from public.lead_feeds where name = 'probe_feed_b';
  if v_n <> 0 then
    v_fail := true; v_out := v_out || 'A SEES B''S FEED; ';
  end if;
  execute 'reset role';

  raise exception '% %', case when v_fail then 'PROBE-FAIL' else 'PROBE-PASS' end,
    case when v_out = '' then 'photo, scan and feed stay inside their org' else v_out end;
end
$$;
