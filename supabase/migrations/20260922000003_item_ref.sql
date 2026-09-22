-- Human-readable item reference, e.g. 'M-E-01'.
--
-- The review artifact (content/items/calibration-batch.md) and any future
-- authoring batch identify items by this ref. Without it there is no link
-- between a reviewed item and the row it became, so a later "was M-E-03 ever
-- approved?" has no answer.
--
-- Nullable, because an item may exist in draft before it is assigned a ref;
-- unique when present, so two authored items can never claim the same one.

alter table public.test_items
  add column if not exists ref text;

create unique index if not exists test_items_ref_key
  on public.test_items (ref)
  where ref is not null;
