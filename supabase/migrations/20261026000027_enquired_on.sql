-- The date a lead enquired, to sort and show it by (2026-10-26).
--
-- The owner's call: the pipeline lists leads newest enquiry first, so the warm
-- ones are called first, and each row shows the date. created_at cannot serve:
-- it is when a lead reached this app (it must be, for the retention clock), and
-- 2,577 GoPost leads arrived on one morning. The enquiry date each source
-- records is lead_origins.source_date.
--
--   • enquired_on is the LATEST source_date of a lead's origins, so a repeat
--     enquiry from another source moves the lead up (the owner's choice over
--     the first); an older one never moves it back.
--   • A lead an import creates takes its first origin's date, however old,
--     not the day of the import. The trigger tells such a lead by created_at =
--     now(): both are the transaction's start, so only a lead inserted in the
--     same transaction as its origin matches.
--   • A lead typed in by hand gets the day it was typed in, in India, and keeps
--     it when a sheet later records an older enquiry.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leads
  add column enquired_on date not null default ((now() at time zone 'Asia/Kolkata')::date);

update public.leads l
   set enquired_on = coalesce(
     (select max(o.source_date) from public.lead_origins o where o.lead_id = l.id),
     (l.created_at at time zone 'Asia/Kolkata')::date);

create index leads_stage_enquired_idx on public.leads (stage, enquired_on desc, created_at desc);

-- SECURITY DEFINER so the date follows whoever adds the origin, a counsellor's
-- import or the GoPost feed, without depending on the leads update policy; it
-- writes one column of the one lead the new origin belongs to.
create or replace function public.lead_origins_enquired() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_date is null then
    return null;
  end if;
  update leads l
     set enquired_on = case
           when l.created_at = now()
                and not exists (select 1 from lead_origins o where o.lead_id = new.lead_id and o.id <> new.id)
             then new.source_date
           else greatest(l.enquired_on, new.source_date)
         end
   where l.id = new.lead_id;
  return null;
end
$$;

revoke all on function public.lead_origins_enquired() from public, anon, authenticated;

create trigger lead_origins_enquired after insert on public.lead_origins
  for each row execute function public.lead_origins_enquired();
