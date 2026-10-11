# Decisions history

Entries archived from the Decisions log in [CLAUDE.md](CLAUDE.md), which keeps roughly the
last two weeks because it is loaded into every session. Moved verbatim, newest batch first.

1. 2026-09-01 to 2026-09-30, archived 2026-10-07 (17 entries)

### 2026-09-01 to 2026-09-30 — archived 2026-10-07

- **2026-09-28 — Lead management lives in the `leads` table the test already
  uses.** Leads come from many sources and move telecaller → counsellor → EIS;
  any of them may be sent the test. One row per lead, test or no test, so the
  report, reissue cap and purge needed no change. The user's answers set the
  shape: one number is one lead; counsellors or superadmin assign;
  telecallers see only their own, counsellors all; comments are a history,
  not a field; SPI leads are in scope (`interest`); class and name are
  optional until issue; stages New → CNR → Contacted → Qualified → In EIS,
  plus Not interested. Import is CSV with a column mapping remembered per
  source — no Excel dependency. Imported NOT CONNECTED → CNR and
  CONNECTED → Contacted; remarks become the first comment; "not interested"
  is never inferred from free text. Retention was deliberately left open (see
  SUGGESTIONS.md for the deadline). EIS matching is deferred until the file
  is shared.
- **2026-09-27 — Papers are scoped by the class being admitted to, with one
  tag on the item and one rule in the code.** Students are admitted to 9, 10,
  11 and 12 and every admit drew the same pool. Three choices were made in
  order. The lead stores the *admitting* class, not the current one: in April a
  student who has finished class 10 is in nobody's class, and the batch they
  join is what the parent says on the phone. The item is tagged with the class
  in which its content is *taught*, a fact an author can state, rather than a
  window of who it is fair for, a policy that would be re-decided item by
  item; one integer replaced the min/max pair first proposed, since reasoning
  items do not go stale with age and the bank is too small to give up items at
  the top. The rule connecting them — an admit to class N draws content taught
  up to N−1 — is a constant in `src/lib/classes.ts` and a check in
  `issue_assessment`, and is conservative in the fair direction for a mid-year
  admit. Plumbing shipped first with all 105 items at the floor, so behaviour
  is unchanged until a tag is raised; the tagging pass is the user's, with the
  lint as the net. The "45 live items" in the 09-23 entry below was true that
  day; the bank was 105, all live, when this was measured. A per-class draw
  splits every stratum, so exposure has to be checked per class as well as per
  stratum — `coverageByClass` is the one place that count is made.
- **2026-09-22 — Spec cut by two thirds after "why are you overcomplicating
  this?".** The first spec specified a ten-signal weighted integrity score, and
  in the same breath admitted the weights were guesses. Everything needing
  volume to mean anything moved to a deferred list. The rule that came out of
  it is now an invariant above.
- **2026-09-22 — Issuing moved into a Postgres function.** PostgREST cannot run
  a multi-statement transaction, so writing an assessment and its 15 items over
  REST could leave a paper with missing questions, still scored out of 15.
  Assessment state follows the attempt row through triggers rather than a
  second write that can drift.
- **2026-09-22 — Item exclusion on reissue is a preference, not a rule.** A
  hard rule made reissue impossible whenever a stratum was fully seen — with a
  15-item bank, always. A reissue repeating a question beats a 500 in front of
  staff. Still throws if a stratum cannot be filled even with repeats.
- **2026-09-22 — The link goes to the parent's number.** This resolved the DPDP
  verifiable-consent question: the consent screen renders on the parent's own
  device before the child sees a question. It also removed the unique
  constraint on `leads.contact_mobile`, since siblings share a number.
- **2026-09-22 — Telemetry events carry a relative `offsetMs`, not a timestamp.** Server
  arrival is flush time, so events cluster into 5-second groups; an ANSWERED question carries
  its own dwell but a SKIPPED one had no usable timing at all. An offset from attempt start is
  a duration, not a clock reading, so nothing new has to be trusted.
- **2026-09-22 — The report shows facts, never a verdict.** Missing telemetry reads as
  "nothing seen", not "nothing happened", and unknown dwell prints `unknown` rather than 0 —
  zero would read as "answered instantly", which is a fraud signal the data does not support.
- **2026-09-22 — The institute's own 2025 IQ paper was ported, not adopted.**
  15 of its 20 questions entered the bank (`content/items/legacy-iq-2025.*`);
  five were dropped — one needs a figure the `.docx` has lost, one duplicates
  another's sequence, three are recall at p ≈ 0.95. Its two shipped answer keys
  disagree with each other and five keys were wrong, so every key was
  re-derived twice, the second time in code. Field-tested items beat authored
  ones, but only once the keys are trustworthy.
- **2026-09-22 — Narrowing an RLS policy broke two things downstream, in
  order.** Scoping `test_items` reads to superadmin plus issued items (0008)
  made newly promoted items undrawable, because the paper draw read the table
  through the session client; `live_pool()` fixed that (0009) and then returned
  nothing for the service role, because `is_staff()` reads a JWT claim a
  service key does not carry (0010). Each break was found by a check that could
  fail — a throwaway live row for the first, the integration suite for the
  second. When tightening a policy, enumerate every caller of the table first;
  a read path is easy to miss precisely because it never errors, it just
  returns fewer rows.
- **2026-09-23 — Staff management moved into the app, on service role.** The
  CLI needed the service-role key on the operator's machine. Creating a login
  has no RLS path, so the gate went into `src/server/staff.ts` (see
  Invariants) rather than into a SECURITY DEFINER function writing Supabase's
  internal `auth` tables. The superadmin sets a temporary password and hands it
  over; by the user's choice there is no self-service password change and no
  email invite (built-in Supabase mail is rate-limited and lands in spam). A
  forgotten password is remove + re-add. Staff names (required on add, same
  day) sit beside the role in `app_metadata`; renaming is the one change a
  superadmin may make to their own account, since a name grants nothing.
- **2026-09-23 — The purge deletes; it does not anonymise.** The consent says
  "kept for 12 months", and deleting is the unambiguous way to honour that.
  Aggregate history is lost with it — if cohort analytics are ever wanted, the
  numbers must be rolled up BEFORE the purge takes the rows, not recovered
  after. Raised rather than decided; nobody has asked for those analytics yet.
- **2026-09-23 — The 5/5/5 split stands, and the whole bank went live.** Both
  batches signed off; 45 live items. The institute's own paper is ~65% maths
  with no science, but spec §1 wins, so every science item has to be authored
  rather than drawn from experience. Measured straight after: 200 draws gave
  200 distinct papers, yet six items sit on *every* one — all five science
  items plus the single difficult English item, because those strata hold
  exactly the 3/1/1 a paper needs and there is nothing to choose between.
  Variety in one subject buys none in another; check exposure per stratum,
  never per bank.
- **2026-09-22 — Maths batches proceed while the subject split is open.** The
  institute's own paper is ~65% maths with no science; spec §1 mandates 5/5/5.
  That decision is the user's, and maths needs 60/20/20 either way — so
  authoring maths cannot be wasted by it, while English and science can.
  (Settled 2026-09-23, above.)
- **2026-09-22 — Lint compares option *quantities*, not just strings.** `2/3`
  and `4/6` are one option printed twice: eliminated together, and two correct
  answers if one is the key. `parseOptionValue` refuses anything containing
  words, because `4% less` / `4% more` is a legitimate pair and a check that
  cries wolf is a check people stop reading.
- **2026-09-22 — Seeding never demotes.** `resolveSeedStatus` in
  `src/lib/items.ts` is pure and tested because the alternative — the rule
  living inline in a script — is what took the live bank to zero. Promotion is
  the answer-key sign-off and is now scoped per batch, since `--live` alone
  would approve items nobody has reviewed.
- **2026-09-22 — Staff get a narrow `assessment_items` insert policy** rather
  than the console running on service role after an application-level check.
  Keeps the access rule in the database.

For anything **2026-10-01 onwards** see the Decisions log in CLAUDE.md.
