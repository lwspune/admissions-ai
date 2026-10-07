-- A test link stays open three hours from issue, not two (the user, 2026-10-07).
--
-- The window is the time to START, not to take, the test: with the 30-minute
-- paper, two hours left a parent about an hour and a half to hand the phone
-- over, which a parent at work or a child at school often missed. The paper's
-- own timer is unchanged, and no question is visible before it starts.
--
-- Only the default changes: issue_assessment inserts without expires_at, so
-- every link issued from now gets three hours. Links already issued keep the
-- expiry they were issued with.

alter table public.assessments
  alter column expires_at set default (now() + interval '3 hours');
