-- Orgs, step 2 (2026-10-28): superadmin names the org.
--
-- Superadmin sees every org (0030) but, until now, everything they added or
-- imported went to their own. The screens now ask which org; these let the
-- database honour the answer for superadmin only. Anyone else stays tied to
-- their own org: leads_on_mobile ignores the org they name, import_leads
-- refuses one that is not theirs, and hiring_applicants_stamp (0030) already
-- overwrites a teacher's.
--
-- Both old signatures are dropped for ones with a trailing default, so a
-- caller that names no org (the code before this migration) resolves to the
-- new function unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

drop function public.leads_on_mobile(text);

create function public.leads_on_mobile(p_mobile text, p_org uuid default null) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_staff()
              then (select count(*)::int from leads
                     where contact_mobile = p_mobile
                       and org_id = case when public.is_superadmin()
                                         then coalesce(p_org, public.auth_org())
                                         else public.auth_org() end)
              else 0 end
$$;

revoke all on function public.leads_on_mobile(text, uuid) from public, anon;
grant execute on function public.leads_on_mobile(text, uuid) to authenticated;

drop function public.import_leads(uuid, jsonb);

create function public.import_leads(p_source_id uuid, p_rows jsonb, p_org uuid default null)
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
  if public.is_superadmin() then
    v_org := coalesce(p_org, v_org);
  elsif p_org is not null and p_org is distinct from v_org then
    raise exception 'a counsellor imports only into their own org' using errcode = 'insufficient_privilege';
  end if;
  if v_org is null then
    raise exception 'your account belongs to no org' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from organizations where id = v_org) then
    raise exception 'org % does not exist', v_org using errcode = 'foreign_key_violation';
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

revoke all on function public.import_leads(uuid, jsonb, uuid) from public, anon;
grant execute on function public.import_leads(uuid, jsonb, uuid) to authenticated;

-- Superadmin may name an applicant's org; the stamp keeps a teacher's own.
grant insert (org_id) on public.hiring_applicants to authenticated;
