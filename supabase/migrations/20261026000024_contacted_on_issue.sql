-- Issuing a test moves the lead to Contacted (2026-10-26).
--
-- The owner's flow: a lead arrives New, someone speaks to the family, and the
-- test link goes out from Contacted. Issuing a test is proof of that call, so
-- a New or CNR lead moves to Contacted on its own, online or paper, whoever
-- issued it. It never moves a lead back: Qualified, In EIS and Not interested
-- stay where they are. The stage-history trigger (0012) writes the line, and
-- its author is the issuer, since auth.uid() still reads the caller's JWT.
--
-- A trigger on assessments, not a line in issue_assessment, because staff may
-- write assessments directly (0018's note on assessments_paper_guard).
-- SECURITY DEFINER so the move does not depend on the leads update policy;
-- it touches one column of the one lead the new paper belongs to.
--
-- A lead added by hand starts at Contacted too; that is the add form's
-- choice (src/app/leads/actions.ts), since the database cannot tell a hand
-- entry from an import, which sets its own stage.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.assessments_mark_contacted() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update leads set stage = 'contacted'
   where id = new.lead_id and stage in ('new', 'cnr');
  return null;
end
$$;

revoke all on function public.assessments_mark_contacted() from public, anon, authenticated;

create trigger assessments_mark_contacted after insert on public.assessments
  for each row execute function public.assessments_mark_contacted();
