-- A hiring test's state only moves forward (2026-10-19).
--
-- Found in the browser check of migration 0021: an applicant submitted, and the
-- test still read 'opened', so the link opened on the number screen again
-- instead of "Your test is submitted". The page load marks a test opened with a
-- plain update; a slow one read 'issued' and wrote after the submit. The page
-- now writes only while the state is still 'issued' (src/server/hiringAttempt.ts),
-- and this makes any backward move impossible whoever attempts it:
--
--   issued → opened, started, voided
--   opened → started, voided
--   started → submitted, voided
--   submitted, voided: final
--
-- Setting the state it already has is allowed, as a no-op.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.hiring_tests_state_forward() returns trigger
language plpgsql
as $$
begin
  if new.state = old.state then
    return new;
  end if;
  if (old.state = 'issued' and new.state in ('opened', 'started', 'voided'))
     or (old.state = 'opened' and new.state in ('started', 'voided'))
     or (old.state = 'started' and new.state in ('submitted', 'voided')) then
    return new;
  end if;
  raise exception 'a hiring test cannot go from % to %', old.state, new.state using errcode = 'check_violation';
end
$$;

create trigger hiring_tests_state_forward
  before update of state on public.hiring_tests
  for each row execute function public.hiring_tests_state_forward();
