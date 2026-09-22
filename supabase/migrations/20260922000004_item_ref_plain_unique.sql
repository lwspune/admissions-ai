-- Replace the partial unique index on test_items.ref with a plain one.
--
-- The partial index (`where ref is not null`) cannot back an ON CONFLICT
-- clause, so upserting the item bank by ref failed with 42P10:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--    specification"
--
-- The partial predicate was never needed. Postgres treats NULLs as distinct in
-- a unique constraint, so a plain `unique (ref)` still allows any number of
-- draft items with no ref, while giving the upsert an index it can target.

drop index if exists public.test_items_ref_key;

alter table public.test_items
  add constraint test_items_ref_key unique (ref);
