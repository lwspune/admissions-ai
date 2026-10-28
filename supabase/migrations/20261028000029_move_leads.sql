-- Moving the ticked leads on /leads at once (2026-10-28).
--
-- One call, one transaction: every lead moves or none does. The ids travel in
-- the request body, not the URL, so a page of them never meets PostgREST's URL
-- limit (the `in` trap). SECURITY INVOKER, so RLS still decides which leads the
-- caller can touch, and leads_stage_history writes each lead's line under the
-- caller's name exactly as a single move does. A lead already in the stage is
-- skipped, so it gets no line, and the count returned is the leads that moved.
-- A counsellor's or superadmin's, like assigning: telecallers move their own
-- leads one at a time from the row.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.move_leads(p_ids uuid[], p_stage text) returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  moved int;
begin
  if public.auth_role() not in ('counsellor', 'superadmin') then
    raise exception 'only a counsellor or superadmin can move leads in bulk' using errcode = 'insufficient_privilege';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'select at least one lead';
  end if;
  if cardinality(p_ids) > 500 then
    raise exception 'move at most 500 leads at a time';
  end if;

  -- An unknown stage is refused by leads_stage_known.
  update leads set stage = p_stage
   where id = any (p_ids) and stage is distinct from p_stage;
  get diagnostics moved = row_count;
  return moved;
end
$$;

revoke all on function public.move_leads(uuid[], text) from public, anon;
grant execute on function public.move_leads(uuid[], text) to authenticated;
