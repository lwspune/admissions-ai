-- "Download for Excel" on /leads (2026-10-26), after GoPost's (its 0020).
--
-- Two choices for the stage on screen: every lead, or those that reached the
-- app since your last download of that stage. Each download is recorded here;
-- a person's latest for a stage is their download point for it. downloaded_at
-- is the moment the file's leads were read up to, so the next "new" download
-- starts exactly there. Written only through record_lead_download, after the
-- file is built (src/lib/leadExport.ts), and only by a counsellor or
-- superadmin: a file of every number walks out easily. Each person reads only
-- their own. Not candidate data (counts and times), so the purge leaves it;
-- it goes with the staff account.
-- ─────────────────────────────────────────────────────────────────────────────

create table public.lead_downloads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('all', 'new')),
  stage         text not null check (stage in ('new', 'cnr', 'contacted', 'in_eis', 'not_interested')),
  lead_count    int not null check (lead_count >= 0),
  -- For a "new" download, the point it started from (null: everything).
  since         timestamptz,
  downloaded_at timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint lead_downloads_since_before check (since is null or since < downloaded_at)
);

create index lead_downloads_point_idx on public.lead_downloads (user_id, stage, downloaded_at desc);

alter table public.lead_downloads enable row level security;
create policy lead_downloads_read on public.lead_downloads
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.lead_downloads from authenticated, anon;

create or replace function public.record_lead_download(
  p_kind  text,
  p_stage text,
  p_count int,
  p_since timestamptz,
  p_at    timestamptz
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.auth_role() not in ('counsellor', 'superadmin') then
    raise exception 'only a counsellor or superadmin can download leads' using errcode = 'insufficient_privilege';
  end if;
  -- A minute's grace for the app server's clock.
  if p_at is null or p_at > now() + interval '1 minute' then
    raise exception 'the download time is not valid' using errcode = 'invalid_parameter_value';
  end if;
  insert into lead_downloads (user_id, kind, stage, lead_count, since, downloaded_at)
  values (auth.uid(), p_kind, p_stage, p_count, p_since, p_at);
end
$$;

revoke all on function public.record_lead_download(text, text, int, timestamptz, timestamptz) from public, anon;
grant execute on function public.record_lead_download(text, text, int, timestamptz, timestamptz) to authenticated;
