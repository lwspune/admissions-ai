-- Messages from the homepage's contact form (2026-10-11).
--
-- The homepage shows other institutes what the product looks like, and asks
-- them to get in touch. A visitor has no session, so the row is written on
-- service role by a server action; nobody else may insert. Only superadmin
-- reads, on /messages, and the one thing they may change is whether it has
-- been read: what a visitor sent is never rewritten, and nobody deletes it.
--
-- Not candidate data: these are institute staff writing about the product, so
-- the 12-month purge does not touch this table, by the user's choice. It holds
-- the sender's IP, for the rate limit below.

create table public.contact_messages (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  -- Normalised to ten digits by the app (src/lib/mobile.ts), as on leads.
  phone      text check (phone ~ '^[6-9][0-9]{9}$'),
  email      text check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  message    text not null check (char_length(btrim(message)) between 1 and 2000),
  ip         inet,
  read_at    timestamptz,
  constraint contact_messages_reachable check (phone is not null or email is not null)
);

create index contact_messages_created_idx on public.contact_messages (created_at desc);
create index contact_messages_ip_idx on public.contact_messages (ip, created_at desc);

-- ── rate limit ──────────────────────────────────────────────────────────────
-- Counted here, not in memory: serverless instances share nothing, so five of
-- them would allow five times the limit (as with identify_attempts). Five an
-- hour from one address, and thirty an hour from everyone together, since an
-- address can be absent or forged. The app maps the message to a sentence.

create or replace function public.contact_messages_rate() returns trigger
language plpgsql
as $$
begin
  -- Serialises concurrent inserts, so two at once cannot both read 29.
  lock table public.contact_messages in share row exclusive mode;

  if new.ip is not null and (
    select count(*) from public.contact_messages
    where ip = new.ip and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'contact_rate_limited';
  end if;

  if (
    select count(*) from public.contact_messages
    where created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'contact_rate_limited';
  end if;

  return new;
end
$$;

create trigger contact_messages_rate
  before insert on public.contact_messages
  for each row execute function public.contact_messages_rate();

-- ── access ──────────────────────────────────────────────────────────────────

alter table public.contact_messages enable row level security;

create policy contact_messages_superadmin_read on public.contact_messages
  for select to authenticated using (public.is_superadmin());

create policy contact_messages_superadmin_mark on public.contact_messages
  for update to authenticated using (public.is_superadmin()) with check (public.is_superadmin());

-- The policies say who; the grants say which columns. Supabase grants every
-- table to anon and authenticated by default, so take that back and give
-- signed-in staff read_at alone. Insert is service role only.
revoke all on public.contact_messages from anon, authenticated;
grant select on public.contact_messages to authenticated;
grant update (read_at) on public.contact_messages to authenticated;
