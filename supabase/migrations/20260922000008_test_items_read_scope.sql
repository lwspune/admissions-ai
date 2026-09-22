-- Narrow who can read the item bank.
--
-- test_items_staff_read granted SELECT on the whole of test_items to every
-- staff role: `using (public.is_staff())`. A telecaller could therefore read
-- every stem, option, answer key and rationale straight from PostgREST with
-- their own login, no UI involved. That is also what made the stem-stripping in
-- src/server/report.ts decorative -- it hid the text in one query while another
-- query returned it in full.
--
-- The incentive points straight at this. Telecallers are measured on candidates
-- reaching the counsellor, and coaching the items is the cheapest way to move
-- that number.

drop policy if exists test_items_staff_read on public.test_items;

-- Superadmin keeps full read through test_items_superadmin_write, which is
-- FOR ALL and therefore already covers SELECT. Policies are OR'd, so nothing
-- further is needed for them.
--
-- Other staff keep exactly what the report needs: an item they can see is one
-- that has actually appeared on somebody's paper. Everything at status 'review'
-- -- the sign-off queue -- becomes invisible to them, as does any live item not
-- yet drawn.
--
-- Honest limitation: with a small bank, nearly every live item has been issued,
-- so this buys little today. It is the growth curve that makes it worth having,
-- and doing it now costs one migration instead of a retrofit later.
create policy test_items_issued_read on public.test_items
  for select to authenticated
  using (
    public.is_staff()
    and exists (
      select 1
      from public.assessment_items ai
      where ai.item_id = public.test_items.id
    )
  );
