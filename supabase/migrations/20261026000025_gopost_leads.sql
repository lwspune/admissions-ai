-- GoPost's leads, every hour (2026-10-26).
--
-- GoPost, LWS's marketing app, serves LWS Pune's leads at /api/feeds/admissions
-- behind a shared secret. /api/cron/gopost reads that feed page by page
-- (src/lib/gopostLeads.ts) and writes each page here. Every lead arrives New;
-- a number already here is merged by the import's rule. The owner's calls:
-- all of GoPost's leads, consent taken where the parent answered the ad, no
-- assignment yet.
--
--   • internal.merge_lead_rows: import_leads' loop (0012), moved so a sheet
--     and the feed share one rule. `internal` is not a schema the API serves,
--     so nobody calls it except through the functions below.
--   • lead_feeds: one row per feed, its cursor, and how its last run went.
--     Counsellors and superadmin read it (the warning on /leads); nobody
--     writes it except service role.
--   • import_feed_page: one page, its sources and its cursor, in one
--     transaction. Service role only: the hourly route has no session, so the
--     history lines it writes have no author. A page that does not start
--     where the feed stopped is refused, so two runs cannot both import it.
--   • The schedule: pg_cron calls the route at :45 each hour (GoPost's own
--     job runs at :15). Vercel Hobby allows a daily cron only. The URL and
--     secret are Vault secrets set by hand, not here, and until both exist the
--     job does nothing:
--       select vault.create_secret('https://aptitudetestai.vercel.app/api/cron/gopost', 'gopost_sync_url');
--       select vault.create_secret('<CRON_SECRET>', 'gopost_sync_secret');
-- ─────────────────────────────────────────────────────────────────────────────

create schema if not exists internal;
revoke all on schema internal from public;
grant usage on schema internal to authenticated, service_role;

-- ── the merge, stated once ──────────────────────────────────────────────────
-- p_rows is an array of {mobile, name, stage, interest, source_date, notes[]}.
-- SECURITY INVOKER: a counsellor's import runs under their own policies.

create or replace function internal.merge_lead_rows(p_source_id uuid, p_rows jsonb)
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

revoke all on function internal.merge_lead_rows(uuid, jsonb) from public;
grant execute on function internal.merge_lead_rows(uuid, jsonb) to authenticated, service_role;

-- import_leads keeps its checks and its signature; only the loop moved.
create or replace function public.import_leads(p_source_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
  return internal.merge_lead_rows(p_source_id, p_rows);
end
$$;

-- ── lead_feeds ──────────────────────────────────────────────────────────────

create table public.lead_feeds (
  name           text primary key check (name ~ '^[a-z][a-z0-9_]{1,40}$'),
  -- The feed's cursor after the last page written; null = from the start.
  cursor         text check (cursor is null or length(cursor) between 1 and 200),
  last_synced_at timestamptz,
  last_error     text check (last_error is null or length(last_error) <= 500),
  -- What the last page did: {created, merged, ambiguous}.
  last_result    jsonb,
  created_at     timestamptz not null default now()
);

alter table public.lead_feeds enable row level security;
create policy lead_feeds_read on public.lead_feeds
  for select to authenticated using (public.auth_role() in ('counsellor', 'superadmin'));
revoke insert, update, delete, truncate on public.lead_feeds from authenticated, anon;

insert into public.lead_feeds (name) values ('gopost');

-- ── import_feed_page ────────────────────────────────────────────────────────
-- p_rows: as merge_lead_rows, plus `source`, the lead source's name. A dry run
-- counts what the page would do against the leads as they are and writes
-- nothing, not even a source.

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

  if p_dry_run then
    select jsonb_build_object(
             'created', count(*) filter (where n = 0),
             'merged', count(*) filter (where n = 1),
             'ambiguous', coalesce(jsonb_agg(mobile) filter (where n > 1), '[]'::jsonb))
      into v_total
      from (select r.value ->> 'mobile' as mobile,
                   (select count(*) from leads l where l.contact_mobile = r.value ->> 'mobile') as n
              from jsonb_array_elements(p_rows) r) x;
    return v_total;
  end if;

  select cursor into v_cursor from lead_feeds where name = p_feed for update;
  if not found then
    raise exception 'feed % does not exist', p_feed using errcode = 'foreign_key_violation';
  end if;
  -- A plain error (P0001, HTTP 400): serialization_failure reaches the client
  -- as a 503, which it retries for half a minute before giving up.
  if v_cursor is distinct from p_from then
    raise exception 'the page starts at cursor %, but feed % stopped at %', p_from, p_feed, v_cursor;
  end if;

  for v_source in select distinct trim(r.value ->> 'source') from jsonb_array_elements(p_rows) r loop
    insert into lead_sources (name) values (v_source) on conflict do nothing;
    select id into v_source_id from lead_sources where lower(trim(name)) = lower(v_source);
    v_part := internal.merge_lead_rows(
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

create or replace function public.record_feed_error(p_feed text, p_error text)
returns void
language sql
security invoker
set search_path = public
as $$
  update lead_feeds set last_error = left(coalesce(nullif(trim(p_error), ''), 'unknown error'), 500) where name = p_feed;
$$;

revoke all on function public.import_feed_page(text, text, text, jsonb, boolean), public.record_feed_error(text, text)
  from public, anon, authenticated;
grant execute on function public.import_feed_page(text, text, text, jsonb, boolean), public.record_feed_error(text, text)
  to service_role;

-- ── the hourly call ─────────────────────────────────────────────────────────

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function internal.trigger_gopost_sync() returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text := (select decrypted_secret from vault.decrypted_secrets where name = 'gopost_sync_url');
  v_secret text := (select decrypted_secret from vault.decrypted_secrets where name = 'gopost_sync_secret');
begin
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end
$$;

revoke all on function internal.trigger_gopost_sync() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'gopost-leads-hourly';
select cron.schedule('gopost-leads-hourly', '45 * * * *', $$select internal.trigger_gopost_sync()$$);
