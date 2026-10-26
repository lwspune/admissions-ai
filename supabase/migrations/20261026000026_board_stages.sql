-- The leads board's five stages (2026-10-26).
--
-- The owner's pipeline is New leads → CNR → Contacted → In EIS → Not
-- interested, shown as columns on /leads, and "In EIS is Qualified itself".
-- Qualified goes. No lead held it and no history line named it when this was
-- written; any lead that somehow does is moved to In EIS first, through the
-- stage-history trigger, so the move is recorded like any other.
-- ─────────────────────────────────────────────────────────────────────────────

update public.leads set stage = 'in_eis' where stage = 'qualified';

alter table public.leads drop constraint leads_stage_known;
alter table public.leads add constraint leads_stage_known
  check (stage in ('new', 'cnr', 'contacted', 'in_eis', 'not_interested'));
