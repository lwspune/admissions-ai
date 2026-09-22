-- live_pool() must answer the service role too.
--
-- 0009 guarded the body with `public.is_staff()`, which reads the role out of
-- the JWT's app_metadata. A service-role key carries no app_metadata, so
-- is_staff() is false and the function returned nothing -- silently, as an
-- empty pool rather than an error. The integration suite caught it: every
-- issueAssessment test went red at once, because assemblePaper cannot fill a
-- stratum from zero items.
--
-- The candidate API is unaffected: a candidate is served the frozen paper from
-- assessment_items and never touches the live pool. This is about the
-- service-role paths -- the integration tests and scripts/issue-test.
--
-- Keeping the is_staff() check rather than dropping it: EXECUTE is granted to
-- `authenticated`, and today every authenticated user is staff, but that is a
-- property of how accounts are created rather than a rule the database holds.
create or replace function public.live_pool()
returns table (id uuid, subject text, difficulty text)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.subject, t.difficulty
  from public.test_items t
  where t.status = 'live'
    and (public.is_staff() or auth.role() = 'service_role')
$$;

revoke all on function public.live_pool() from public;
grant execute on function public.live_pool() to authenticated, service_role;
