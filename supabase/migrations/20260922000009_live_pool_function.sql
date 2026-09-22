-- Give the paper draw its own door into the bank.
--
-- Migration 0008 narrowed SELECT on test_items so that non-superadmin staff see
-- only items that have already appeared on a paper. That protects the answer
-- keys, and it broke issuing: assemblePaper draws from `livePool()`, which
-- reads test_items through the session client, so a newly promoted item was
-- invisible to a counsellor and could never be drawn. On a bank where nothing
-- had been issued yet, a counsellor could not issue at all.
--
-- Demonstrated before writing this: a throwaway item inserted at status 'live'
-- was counted by the service role and not by a signed-in counsellor.
--
-- The draw needs three columns and never needs an answer. Handing it a function
-- that returns exactly those columns is both the fix and an improvement on what
-- came before, where assembling a paper meant SELECTing a table that also holds
-- every key.
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
    and public.is_staff()
$$;

-- SECURITY DEFINER runs as the owner and therefore bypasses the policy above,
-- so the guard has to be inside the body -- hence `and public.is_staff()`,
-- which yields no rows rather than an error for anyone else.
revoke all on function public.live_pool() from public;
grant execute on function public.live_pool() to authenticated;
