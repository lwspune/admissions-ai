# Open items

Living checklist for Admissions_AI. Newest concerns first within each section.
Spec: [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) · Context: [BRAINSTORM.md](BRAINSTORM.md)

---

## Do before anyone real uses this

- [ ] **URGENT — production has not deployed since 2026-09-23, and issuing is likely broken.**
      Found 2026-09-28. Every Git deploy since `bce06da` (09-27) and a manual `npx vercel --prod`
      of `1fb9aef` were refused by Vercel: *"the commit author doesn't have permission to create
      deployments for this project"* (`seatBlock.blockCode: TEAM_ACCESS_REQUIRED`, `isVerified:
      false`). The commit author is `LWS Pune <connect.lwspune@gmail.com>` — the same author whose
      commits deployed fine up to `6facb61` on 09-23; the Vercel login is `connectapjschool-4966`
      on team `apj-school`. Production still serves `6facb61`, which calls the zero-argument
      `live_pool()` that migration 0011 dropped on 09-27 — so **Issue test has most likely failed
      in production since 09-27**, and the 0011 entry below ("issuing failed closed for the
      interval") was wrong: the interval never ended. Production also now runs that old code on
      the 0012 schema (telecallers see no leads). **Diagnosed 2026-10-01 from the deployment
      records:** the blocked deploy's `seatBlock` resolves GitHub `lwspune` (id 265271616) to
      Vercel user `PJQRidKLNEY9QU7rsfcbj8Xr`, not this account (`v22v1W7akoc61Ufax2uCIi7d`,
      connect.apjschool@gmail.com, Hobby team created 2026-09-22), whose Authentication page now
      shows GitHub unconnected. Why the link moved is not established — the user runs several
      Vercel accounts from one GitHub without trouble. **Fix is in the Vercel dashboard, by the owner:**
      make the commit author a recognised member — Account Settings → Authentication, connect the
      GitHub account that owns `connect.lwspune@gmail.com` to the `connectapjschool` Vercel login
      (or add that email to the account) — then redeploy `main` (Deployments → the blocked
      `1fb9aef` → Redeploy, or push any commit). See
      https://vercel.com/docs/deployments/troubleshoot-project-collaboration#team-configuration.
      Lesson: "pushed" was recorded as "deployed" twice without checking the deployment status.

- [ ] **Ship lead management: apply migration 0012, push, run the suite, walk the golden path.**
      **0012 APPLIED 2026-09-28** (dry run first: it was the only pending migration), with the
      database password pasted into chat a third time — rotation below is now urgent. Integration
      suite **92/92** afterwards, including all 24 in `leads.itest.ts`. The planned mutation of
      `leads_guard` was not run: it would mean disabling a guard on the live database. The name
      test is still meaningful — the import tests insert nameless leads, so NOT NULL is gone and
      only the trigger can be refusing the removal. A read-only count of the real leads afterwards
      was blocked, so their survival rests on the suite's cleanup being scoped to 97000010xx
      numbers and one named source. **Still to do: push, golden path.** Built 2026-09-28. Order: `npx supabase db push` (0012) **then push `main`
      straight after** — the old code runs against the new schema (it only ever inserts named
      leads, and a telecaller's insert is auto-assigned to them), but from the moment 0012 is live
      telecallers see only leads assigned to them, and every existing lead is unassigned
      (`created_by` was never filled in, so there is nobody to backfill to). A counsellor assigns
      them on `/leads`. Then `npm run test:integration` — `leads.itest.ts` (24 tests) failed
      21/24 before the migration for the right reason (missing columns and tables). After it goes
      green, break `leads_guard`'s name rule on purpose and watch "lets a name be corrected but not
      removed" go red: before 0012 that test passed only because `name` was NOT NULL. **Golden
      path, by the user** (needs real counsellor + telecaller sessions on production): export the
      WhatsApp Consolidated sheet as CSV → `/leads/import` as a counsellor, new source → preview
      (the sheet has 597 rows; rows with no number, like the first "S. Shingre", should be listed
      as skipped) → import → filter
      Source + Unassigned → select 5, assign to a telecaller → sign in as that telecaller: exactly
      those 5 → open one, set CNR, add a comment → add name and class, issue a test.
- [ ] **Decide whether leads that never took a test are ever purged.** The user's call
      2026-09-28: keep the data, decide later. Nothing is purged yet in practice — the purge counts
      12 months from `leads.created_at`, which for an imported lead is the import date (the
      sheet's own date is kept separately in `lead_origins.source_date` for exactly this reason).
      **Deadline: 12 months after the first import.** After that the nightly purge starts deleting
      untested imported leads, because it treats every lead alike. The consent screen's "kept for
      12 months" covers test data; leads from other sources were consented at source.

- [x] ~~**Apply migration 0011 (class-scoped papers), then deploy, then verify.**~~ **DONE
      2026-09-27**, in the wrong order and it did not matter: the code was pushed first (issuing
      failed closed for the interval), then the migration went in with the database password
      pasted into chat — see the rotation item below — after the user added a Bash allow rule
      for `npx supabase db push` in `.claude/settings.local.json` (gitignored). Then
      `items:seed` wrote the tags (database now 47/24/17/14/3 by `taught_in`, matching the
      files), `live_pool(p_class)` returns per-class counts identical to the lint's table, and
      the integration suite passed 68/68 including the four class-scoping tests, leaving the
      four real leads and 105 items untouched. The two pre-existing "11" leads cast cleanly; the
      two null-class leads are both `submitted`, so nothing can be issued to them and no
      backfill is needed. **Still unverified:** `db:verify`'s seven new probes (it skips on
      production because real leads exist) and the golden path in a browser — Add candidate now
      requires "Admission to class"; save a class 9 candidate, issue, open the link, and check
      the card and report read "Admission to class 9".
- [ ] **Rotate the database password now, not later.** It was pasted into this chat on
      2026-09-27 (as it was on 2026-09-22), and this time it was used from the transcript to
      apply a migration. Supabase → Settings → Database → reset. Nothing on this machine stores
      it, so no local file needs updating afterwards.
- [ ] **Review the class tags, then seed them.** Tagged 2026-09-27 against the NCERT sequence,
      checked against the Maharashtra board where they differ; each batch `.md` now ends with a
      "Class tags" table giving the reason for every raised tag, so a disagreement is a one-cell
      edit in the `.json` plus `npm run items:lint`. Distribution: 47 at the floor, 24 at class 7,
      17 at 8, 14 at 9, 3 at 10 (`S-M-29` earthing, `S-D-35` electric power, `M-D-46` two draws
      without replacement); nothing at 11. English is entirely at the floor. Two predictions in
      the earlier version of this item were wrong and are corrected in the tables: litmus is
      Class 7, not 10, and a single-draw probability is Class 8. **The cell to watch is class 9
      science/difficult: 3 items for a need of 1** (`S-D-19`, `S-D-31`, `S-D-33`), so a class 9
      admit sees one of three difficult science items on every paper — legal, but the next
      science batch should be difficult items on class 7–8 content. Seeding waits on migration
      0011 (`taught_in` does not exist in production yet); `npm run items:seed` after it.
- [ ] **Rotate the Supabase `service_role` key and the database password.** Both, plus the anon key,
      were pasted into a chat transcript on 2026-09-22. The anon key is public by design; the other two
      are not. Settings → API → Reset, then update `.env.local`.
- [x] ~~**Change the seeded staff password.**~~ **DONE 2026-09-22** — `admin@lwspune.test` deleted
      via the new `npm run staff:rm`, which refuses to remove the last superadmin.
- [ ] **Check the database password is not reused elsewhere.** It looks like it may be shared with
      other institute systems. This database should have its own.
- [ ] **Take the test on a real Android phone over mobile data.** Now possible — the site is
      public. (2026-09-22: the one real run was desktop Chrome at 1536x864, and a later check
      faked a 390x844 screen via curl; neither is a phone.) The 4-inch / Android 8 / 3G case is
      exactly where per-question save and the pausing timer earn their keep. Background the tab
      mid-question, return, submit.
- [x] ~~**Exercise the staff console buttons in a browser.**~~ **DONE 2026-09-22** — confirmed by
      the user. The database shows one lead with a **submitted** assessment, so Add candidate →
      Issue → the candidate flow → submit all ran end to end through the UI.
- [ ] **Decide whether the first intake runs in shadow mode.** Discussed repeatedly on 2026-09-22
      and 2026-09-23 and never written down until now, which is how a decision with a deadline gets
      lost. Shadow mode = record every score, pass everyone through to the counsellor, for the
      first couple of hundred candidates. Nobody yet knows what a 7/15 predicts about a cadet, and
      the app computes no cut-off by design (spec §1) precisely so a human sets that bar. The
      deadline is the **first candidate you turn away**, not the first candidate you test: after
      that you are defending a number retrospectively. Cheap now, impossible later.
- [ ] **Look at `/items`, `/staff` and the report's new Question column in a browser.** None has
      been seen by a human. `/staff` (shipped 2026-09-23, commit `83de925`) went to production on
      the user's instruction without the golden-path check: add a throwaway account, copy the
      details, change its role, remove it. Its server layer is covered by `staff.itest.ts` against
      the real auth server; the UI is not. All three need a superadmin session, so unauthenticated
      redirects to `/login` are all that has been proved. **Carry-forward 2026-09-23:** names and
      rename shipped in `543ba19`, also unseen. The first real use should be **Edit name** →
      "Ravi Nagpurkar" on `rrnlws8@gmail.com` (counsellor), then the superadmin's own name — both
      accounts have no name yet, and my attempt to set Ravi's by script was blocked (see below).
- [ ] **Give Claude a way to browser-verify superadmin pages, or accept that the user does it.**
      2026-09-23: creating a temporary superadmin on production to drive `/staff` through Edge was
      blocked by the permission classifier — correctly, since it mints top-level access on the live
      project. There is only one Supabase project, so every signed-in check is against production.
      This is why `/items` and `/staff` both shipped unseen. Options: (a) the user runs the
      golden path after each superadmin-page change (cheapest, status quo); (b) a separate
      Supabase project for Preview deployments, where a test superadmin is harmless; (c) a
      standing `e2e` telecaller account, which verifies nothing superadmin-only. (b) is the only
      one that closes the gap, and it also stops integration tests writing to production.
      Same day, a one-off service-role script setting a staff name on production was blocked
      too: any data fix on the live project has to go through the UI or be run by the user.
- [x] ~~Private GitHub repo + Vercel project.~~ **DONE 2026-09-22** — `lwspune/admissions-ai`
      (private, verified by a 404 to anonymous requests) deployed to
      https://admissions-ai-omega.vercel.app. Production env vars set; Preview left unset so
      previews fail loudly rather than becoming a second copy of the live system.

## Known gaps

- [ ] **Lead management: what is deliberately not built (2026-09-28).** EIS matching (the user
      will share the EIS Excel; decide then whether "in EIS" is a flag or carries EIS status);
      call-back reminders; automatic intake from Meta / Google forms; a per-row Source column in
      an import file (one source per file for now — the user may have meant per-row). An import is
      capped at 5000 rows / 900 KB: one file is one transaction and must finish inside the
      statement timeout. A comment's author name is captured when it is written, so a rename does
      not rewrite old comments.
- [ ] **`db:verify` and `db:verify-rls` cannot see migration 0012.** Both refuse to run on a
      database holding real leads, which production now does, so the lead rules are proven only by
      `leads.itest.ts`. This is the gap option (b) in "Give Claude a way to browser-verify" would
      close.

- [x] ~~**Vercel Git integration is not connected.**~~ **WRONG — it is, and always was.**
      Corrected 2026-09-22: pushing branch `items/legacy-iq-2025-port` produced Preview deployment
      `6593653103` for that exact commit, and `main` commits `881bd48` / `e68f42e` / `fe36391` each
      have a `vercel[bot]` Production deployment. **A push to `main` deploys to production.**
      Previews sit behind Vercel's own login, so they are not a second open copy. The earlier
      claim came from assuming the manual `npx vercel --prod` runs were the only mechanism.
- [ ] **The purge is deployed but three things about it are unproven.** (1) Whether Vercel actually
      registered the cron from `vercel.json` — the local CLI had no readable auth token, so this was
      never confirmed; look under project → Settings → Cron Jobs for `/api/cron/purge` at
      `0 3 * * *`. (2) The production *happy path*. Rejection was verified live (404 with no header
      and with a wrong one), but the accepting path never was, because production's `CRON_SECRET`
      is not readable locally — the dashboard's "Run" button proves it in one click and emits the
      `purge: cutoff=… leads=…` log line. (3) It has never deleted a real row, and will not need to
      for ~12 months, so its first genuine run will be unobserved. Worth inserting a throwaway
      backdated lead once and letting the *scheduled* job take it, rather than trusting a manual
      curl of the same code path.
- [ ] **Custom domain.** The production URL is `admissions-ai-omega.vercel.app` (the plain
      `admissions-ai.vercel.app` belongs to someone else). A link from an unrecognised `vercel.app`
      subdomain, arriving from an unknown number, is exactly what people are taught not to tap. A
      subdomain of the institute's own domain would materially improve the open rate.
- [ ] **Vercel Hobby is licensed for non-commercial use.** This is a fee-charging institute's
      admissions pipeline. If enforced, candidate links go down mid-window with no warning to the
      telecaller. Decided on 2026-09-22 to stay on Hobby for now; revisit before a real intake.
- [x] ~~**The report does not exist.**~~ **DONE 2026-09-22** — `/reports/[leadId]`: score, section
      bars, the five facts, and an expandable per-question table. Question stems are hidden from
      telecallers. `src/lib/report.ts` is pure with 20 tests.
- [ ] **The bank holds 105 items, not 300 — all live and signed off as of 2026-09-23.**
      Composition: maths 20/14/13, English 10/7/6, science 15/10/10 (easy/moderate/difficult
      against a 60/20/20 target per subject). Verified against the database, not the JSON files
      (re-verified 2026-09-27: still 105, nothing at review). Once items are class-tagged these
      numbers become per-class, and the thinnest cell will be class 9's, not the bank's.
      Authoring the remaining 195 is the bulk of the work left; the largest absolute gaps are the
      easy strata — English 50 short, science 45, maths 40 — and the thinnest are English
      difficult (6) and English moderate (7). **Nothing is urgent:** no item now appears on more
      than a third of papers.
- [x] ~~**Review the 2025 port and decide the subject split.**~~ **DONE 2026-09-23** — both
      batches signed off and promoted to live; the split stays **5 maths / 5 English / 5 science**
      per spec §1, the institute's own maths-heavy paper notwithstanding. Science items must
      therefore be authored from scratch rather than drawn from experience.
- [x] ~~**Science is fully exposed — author it next.**~~ **DONE 2026-09-23** — at 45 live items,
      six sat on *every* paper (the whole science section plus `E-D-05`). Four batches later the
      live bank is 105 and, over 2,000 simulated draws from the database, **no item appears on
      every paper** and the most exposed is 32%. Re-run that simulation after any future batch;
      exposure is a per-stratum property and a healthy bank total can hide a starved stratum.
- [ ] **36 answer keys rest on a rationale and a human read, with no machine check behind them.**
      Every science and English MCQ. `items:lint` verifies shape, duplication and length tells; it
      cannot verify that "terse" means brief, or that the third-law partner of the Earth's pull on
      a book is the book's pull on the Earth (`S-D-30`) rather than the table's push. The maths
      batches are different — every key there was recomputed from the stem in code. If a wrong key
      is ever going to reach a candidate, it will be one of these 36. Worth a second pass by
      someone who teaches the subject.
- [ ] **Two filler distractors, flagged not fixed.** `M-E-11` option D (89,223) and `M-E-13`
      option D (28) correspond to no derivable candidate error, so they are dead options that make
      the items easier than their tier implies. Noted in each item's `rationale`. Left in
      deliberately — they belong to the institute's own paper, and rewriting more of it than the
      wrong keys required is your call. Cheap to fix at sign-off.
- [ ] **The printed 2025 paper is still circulating with wrong answer keys.** Separate from the
      port: `IQ Test Answer Key.docx` (Apr 2025) is wrong on Q4, Q7 and Q17 and guesses Q12 — 15% of
      the paper, marked wrong regardless of what the candidate wrote. `IQ Test_Qs_A5_ak.docx`
      (Nov 2025) is correct apart from Q3. Corrected key in `content/items/legacy-iq-2025.md`;
      someone should reprint it and check whether any past candidate was marked against the April one.
- [x] ~~**No visual design pass.** The candidate screens are unstyled-but-correct.~~
      **WRONG — corrected 2026-09-22.** They are not unstyled: `Shell` is a centred `max-w-md`
      card, `min-h-tap` is on every button, inputs are `text-base` (which stops iOS zooming on
      focus), focus outlines are enforced globally in `globals.css`, and `body` is explicitly
      light so dark mode cannot surprise anyone. Anything further is fonts, colour and a logo —
      cosmetics, with no evidence they are needed. **Do not schedule a "design pass" as a task.**
      If the real-phone test turns up something specific, fix that specific thing.
- [x] ~~**Event timestamps are flush time, not action time.**~~ **DONE 2026-09-22** — events now
      carry `offsetMs`, a relative duration from attempt start (no clock to trust). Verified on
      production: 18 events arriving inside a 17s flush spread yielded correct 12s dwells for
      SKIPPED questions, which previously had no usable timing at all.
- [ ] **The pause signal has not been triggered by a real tab switch.** `changed_after_pause` is
      verified by posting pause/resume events directly; the `visibilitychange` wiring that emits them
      is written but unexercised in a browser.
- [x] ~~12-month purge job.~~ **DONE 2026-09-23** — `/api/cron/purge`, daily at 03:00 UTC via
      `vercel.json`, guarded by a timing-safe `CRON_SECRET` bearer check and failing closed with
      503 if that is unset. `?dryRun=1` reports without deleting. Covers `identify_attempts`,
      which no cascade reaches.
- [ ] **No cohort analytics and no per-issuer pass rates — and the purge now has a bearing on
      them.** Both are specced and unbuilt. Note the ordering constraint: the purge deletes rather
      than anonymises, so any aggregate worth keeping has to be rolled up before the rows go, not
      reconstructed afterwards. Nothing is lost yet; the oldest candidate data is days old.

## Backfill ledger

Learnings that may apply to work already shipped. Each needs a 360 analysis and the user's
go-ahead before anything shipped is touched.

- [ ] **Staff references that block removing a staff member.** Found 2026-09-28 while writing
      0012: `assessments.issued_by` and `voided_by` reference `auth.users` with no `on delete`
      rule, so removing (via `/staff` or `staff:rm`) anyone who has issued a test most likely fails
      with "The change could not be saved". 0012 fixed the same shape on `leads.created_by`, which
      it started filling in, and gave every new reference `on delete set null`. Not yet confirmed
      on production; not yet analysed or fixed.

## Decisions taken that are worth revisiting once there is data

- **The timer pauses when the tab is hidden**, which is exploitable: close, look it up, return. Bounded
  by the 2-hour window and reported via answer-changed-after-pause. Revisit if the reports show it
  being used.
- **Item exclusion on reissue is a preference, not a rule.** With a 15-item bank every reissue repeats
  everything. Becomes moot at 300 items.
- **Identity is the parent's number alone.** Anyone holding the phone passes. Accepted; no webcam by
  decision. Cross-check against the telecaller's call recording.
- **No cut-off is computed anywhere.** Deliberate — spec §1. The score is reported and a human sets the
  bar. Do not let this drift into the app.

## Traps worth remembering

- **Never run `next build` while `next dev` is live.** It overwrites the `.next` the dev server is
  serving and every asset 404s with nothing explaining why. Use `npm run build:check`, which writes to
  `.next-verify`.
- **The two database probes skip when real leads exist** (exit 2, not 1). They write rows, so they are
  development tools for an empty database, not a production health check.
- ~~**Files are CRLF.**~~ **FIXED 2026-09-22** — `.gitattributes` now normalises to LF and the
  tree was renormalised. Historic note: before that, exact-text patching of committed files
  failed confusingly, which cost real time.
- **`verify-schema` runs as service role and therefore proves nothing about RLS.** That is what
  `verify-rls` is for — it signs in as a real staff member.

## The gate

```
npm run lint          npm run test              npm run items:lint
npm run typecheck     npm run test:integration  npm run build:check
npm run db:verify     npm run db:verify-rls -- <email> <password>
```
