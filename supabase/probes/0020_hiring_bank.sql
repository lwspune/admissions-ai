-- Probe: the hiring question bank (migration 0020). Run with `npm run db:probe -- 0020`.
--
-- Proves the shape rules refuse every half-built row, and that only a teacher
-- or superadmin can read the bank and nobody signed in can write it. Inserts
-- probe rows inside ONE statement that always ends by raising, so they roll
-- back and no other session ever sees them.

do $$
declare
  v_out   text := '';
  v_fail  boolean := false;
  v_seen  int;
  v_role  text;
  v_bad   record;
begin
  insert into public.hiring_items
    (source_ref, source, paper, subject, chapter, format, stem, options, answer_key, numeric_answer, status)
  values
    ('probe-mcq', 'nda', 'NDA 2024', 'maths', 'Algebra', 'mcq', 'probe stem',
     '{"A":"1","B":"2","C":"3","D":"4"}', 'B', null, 'live'),
    ('probe-num', 'jee-mains', 'JEE 2025', 'physics', 'Optics', 'numeric', 'probe stem',
     null, null, 42, 'live');
  insert into public.hiring_items
    (source_ref, source, paper, subject, chapter, format, direction, stem, options, answer_key, status)
  values
    ('probe-eng', 'cds', 'CDS 2024', 'english', 'Grammar', 'mcq', 'Directions: spot the error.', 'probe stem',
     '{"A":"a","B":"b","C":"c","D":"d"}', 'A', 'review');
  v_out := v_out || 'valid rows accepted; ';

  -- Each of these must be refused by a constraint.
  for v_bad in
    select * from (values
      ('mcq without options',      $q$('b1','nda','p','maths','c','mcq',null,'s',null,'A',null)$q$),
      ('mcq missing option D',     $q$('b2','nda','p','maths','c','mcq',null,'s','{"A":"1","B":"2","C":"3"}','A',null)$q$),
      ('mcq with an empty option', $q$('b3','nda','p','maths','c','mcq',null,'s','{"A":"1","B":"2","C":"3","D":" "}','A',null)$q$),
      ('mcq without a key',        $q$('b4','nda','p','maths','c','mcq',null,'s','{"A":"1","B":"2","C":"3","D":"4"}',null,null)$q$),
      ('mcq with a typed answer',  $q$('b5','nda','p','maths','c','mcq',null,'s','{"A":"1","B":"2","C":"3","D":"4"}','A',3)$q$),
      ('numeric with options',     $q$('b6','jee-mains','p','maths','c','numeric',null,'s','{"A":"1","B":"2","C":"3","D":"4"}',null,3)$q$),
      ('numeric with a key',       $q$('b7','jee-mains','p','maths','c','numeric',null,'s',null,'A',3)$q$),
      ('numeric without answer',   $q$('b8','jee-mains','p','maths','c','numeric',null,'s',null,null,null)$q$),
      ('numeric 2.5',              $q$('b9','jee-mains','p','maths','c','numeric',null,'s',null,null,2.5)$q$),
      ('numeric -1',               $q$('b10','jee-mains','p','maths','c','numeric',null,'s',null,null,-1)$q$),
      ('numeric 10000',            $q$('b11','jee-mains','p','maths','c','numeric',null,'s',null,null,10000)$q$),
      ('english typed answer',     $q$('b12','cds','p','english','c','numeric',null,'s',null,null,3)$q$),
      ('direction on maths',       $q$('b13','nda','p','maths','c','mcq','Directions: x','s','{"A":"1","B":"2","C":"3","D":"4"}','A',null)$q$),
      ('direction of 161 chars',   format($q$('b14','cds','p','english','c','mcq',%L,'s','{"A":"1","B":"2","C":"3","D":"4"}','A',null)$q$, repeat('x', 161))),
      ('subject biology',          $q$('b15','nda','p','biology','c','mcq',null,'s','{"A":"1","B":"2","C":"3","D":"4"}','A',null)$q$),
      ('source unknown',           $q$('b16','neet','p','physics','c','mcq',null,'s','{"A":"1","B":"2","C":"3","D":"4"}','A',null)$q$),
      ('blank stem',               $q$('b17','nda','p','maths','c','mcq',null,'  ','{"A":"1","B":"2","C":"3","D":"4"}','A',null)$q$),
      ('blank chapter',            $q$('b18','nda','p','maths',' ','mcq',null,'s','{"A":"1","B":"2","C":"3","D":"4"}','A',null)$q$),
      ('duplicate source_ref',     $q$('probe-mcq','nda','p','maths','c','mcq',null,'s','{"A":"1","B":"2","C":"3","D":"4"}','A',null)$q$)
    ) as t(label, vals)
  loop
    begin
      execute 'insert into public.hiring_items (source_ref, source, paper, subject, chapter, format, direction, stem, options, answer_key, numeric_answer) values '
        || v_bad.vals;
      v_fail := true;
      v_out := v_out || format('ACCEPTED %s; ', v_bad.label);
    exception when check_violation or not_null_violation or unique_violation then
      null;
    end;
  end loop;
  v_out := v_out || 'bad shapes refused; ';

  begin
    update public.hiring_items set status = 'bogus' where source_ref = 'probe-mcq';
    v_fail := true;
    v_out := v_out || 'ACCEPTED status bogus; ';
  exception when check_violation then null;
  end;

  -- Who can read: a teacher and superadmin see the probe rows; other staff see none.
  foreach v_role in array array['teacher', 'superadmin', 'counsellor', 'telecaller'] loop
    perform set_config('request.jwt.claims',
      format('{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000020","app_metadata":{"role":"%s"}}', v_role), true);
    execute 'set local role authenticated';
    select count(*) into v_seen from public.hiring_items where source_ref like 'probe-%';
    if (v_role in ('teacher', 'superadmin')) <> (v_seen = 3) or (v_role not in ('teacher', 'superadmin') and v_seen <> 0) then
      v_fail := true;
      v_out := v_out || format('%s SAW %s; ', v_role, v_seen);
    end if;

    -- Nobody signed in writes the bank: the seed does, on service role.
    begin
      insert into public.hiring_items (source_ref, source, paper, subject, chapter, format, stem, options, answer_key)
      values ('probe-w-' || v_role, 'nda', 'p', 'maths', 'c', 'mcq', 's', '{"A":"1","B":"2","C":"3","D":"4"}', 'A');
      v_fail := true;
      v_out := v_out || format('%s INSERTED; ', v_role);
    exception when insufficient_privilege then null;
    end;
    begin
      update public.hiring_items set status = 'live' where source_ref = 'probe-eng';
      get diagnostics v_seen = row_count;
      if v_seen > 0 then
        v_fail := true;
        v_out := v_out || format('%s UPDATED; ', v_role);
      end if;
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
  v_out := v_out || 'reads: teacher+superadmin only; writes: none signed in';

  raise exception '% %', case when v_fail then 'PROBE-FAIL' else 'PROBE-PASS' end, v_out;
end
$$;
