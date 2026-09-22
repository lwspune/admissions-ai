-- Let staff insert the rows that issuing a test creates.
--
-- assessment_items had only a read policy, so `issue_assessment` — which runs
-- as the caller — could write the assessment but not its 15 questions when
-- invoked by a signed-in staff member. It worked in tests only because the
-- service-role client bypasses RLS entirely.
--
-- The alternative was to run the staff console on the service-role key after
-- checking the session in application code. That works, but it moves the
-- access rule out of the database and into an `if` — exactly the trade this
-- schema has avoided everywhere else. Staff get the narrow permission instead.
--
-- Insert only. Nothing may edit or delete a frozen paper: a question changing
-- under a candidate mid-attempt is the failure assessment_items exists to
-- prevent.

create policy assessment_items_staff_insert on public.assessment_items
  for insert to authenticated with check (public.is_staff());
