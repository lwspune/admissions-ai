-- Fix a three-valued-logic hole in test_items_format_pairing.
--
-- The original constraint read:
--
--   (format = 'mcq' and jsonb_typeof(options) = 'object' and options ?& ... )
--   or (format = 'numeric' and ...)
--
-- When `options` IS NULL, jsonb_typeof(NULL) is NULL, so the first branch
-- evaluates to NULL rather than false. The second branch is false. NULL OR
-- false is NULL — and Postgres treats a CHECK that evaluates to NULL as
-- SATISFIED, not violated.
--
-- Net effect: an MCQ row with no options at all was accepted, which is the
-- exact shape the constraint exists to forbid. Caught by scripts/verify-schema.mjs.
--
-- The fix is an explicit `options is not null` guard placed BEFORE the
-- jsonb_typeof call, so the branch short-circuits to false instead of NULL.
-- `is null` / `is not null` always return a boolean, never NULL, which is what
-- makes the rest of the expression safe.

alter table public.test_items
  drop constraint if exists test_items_format_pairing;

alter table public.test_items
  add constraint test_items_format_pairing check (
    (
      format = 'mcq'
      and options is not null
      and jsonb_typeof(options) = 'object'
      and options ?& array['A', 'B', 'C', 'D']
      and answer_key is not null
      and numeric_answer is null
    )
    or (
      format = 'numeric'
      and numeric_answer is not null
      and answer_key is null
      and options is null
    )
  );
