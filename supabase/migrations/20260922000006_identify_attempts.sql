-- Rate limiting for the identity screen.
--
-- The candidate proves who they are by typing the number the link was sent to.
-- That is a 10-digit secret with a known format, so without a limit it is
-- brute-forceable — and the token is in a WhatsApp message that may have been
-- forwarded.
--
-- In-memory counting does not work here: the app runs on serverless instances
-- that do not share state, so five instances would allow five times the limit.
-- The counter has to live in the database.
--
-- Doubles as forensics: repeated failures on a token are worth seeing on the
-- report, whether or not the limit was ever reached.

create table public.identify_attempts (
  id    bigserial primary key,
  token text not null,
  ip    inet,
  at    timestamptz not null default now(),
  ok    boolean not null
);

-- Both lookups are "recent attempts for X", so both indexes are (X, at desc).
create index identify_attempts_token_idx on public.identify_attempts (token, at desc);
create index identify_attempts_ip_idx on public.identify_attempts (ip, at desc);

alter table public.identify_attempts enable row level security;

-- Written only by the service-role candidate API. Staff read it for the report.
create policy identify_attempts_staff_read on public.identify_attempts
  for select to authenticated using (public.is_staff());
