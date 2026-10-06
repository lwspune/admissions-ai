# Open items

Living checklist for Admissions_AI. Newest concerns first within each section.
Spec: [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) · Context: [BRAINSTORM.md](BRAINSTORM.md)

---

## Do before anyone real uses this

- [ ] **30-question paper (2026-10-06): Phase 1 built on `feat/thirty-question-paper`.**
      Migration 0014, the draw, the test screens and both reports handle 15 or 30 questions;
      every class stays on 15 until its syllabus batch is live, so shipping it changes nothing a
      candidate sees except the label contrast. 0014 applied to production 2026-10-06 (dry run
      first); integration suite 100/100 against it; a 30-question paper walked in the browser
      with temporary class 7 fixtures, since removed. Not yet seen signed in: the staff report
      and parent sheet with a part split. Still to do: merge. **Phase 2**: syllabus batches (`part: "syllabus"`, `term`), class 9 → 10 → 11
      → 7 → 8, about 15 per class per subject, each signed off; plus about 15 English basics
      (a 10-question English part reuses the 23 items too often). **Phase 3**: the parent pack
      at 30 questions. Its `topicClass` treats every bank item as basics, so a syllabus skill
      would read as drawable for every later class; it must learn the part first.
- [ ] **Parent pack (2026-10-06): read the five PDFs before staff send one.** `content/parent-pack/pdf/`.
      75 new questions; every calculable key re-derived in code, the lint clean, each paper
      checked against its class ceiling. The syllabus names NCERT chapters, edition by edition,
      for the April 2027 joiners. Nobody but the author has read the questions or the chapter
      mapping; the bank's batches each had a sign-off, and these deserve one. The build refuses
      a skill the syllabus does not claim, but placing a new topic in its chapters is by hand,
      and `cohortYear` in `syllabus.json` must be bumped every April.
- [ ] **Class 8 admits (2026-10-01): migration 0013 applied, suite 93/93; golden path unseen.**
      Add a lead, choose "Class 8", issue, and check the report reads "Admission to class 8".
      Authoring follow-up: maths/difficult holds only 4 items at `taught_in` ≤ 7, so each sits
      on ~1 in 4 class 8 papers — 3–4 more difficult maths items tagged 6 or 7 would bring it
      in line.

- [x] **RESOLVED 2026-10-01 — production had not deployed since 2026-09-23.** After the user's
      change on the Vercel side, push `04f60fc` deployed (status "Deployment has completed",
      Ready, aliased to production). Not yet checked: that the cron is still registered, and
      issuing a test end to end (the golden path below).
      Original entry:
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

- [ ] **Lead management: shipped, golden path unseen.** Migration 0012 applied 2026-09-28
      (suite 92/92, now 93/93); code live 2026-10-01 (`04f60fc`, after the Vercel block below).
      The planned break-the-guard test of `leads_guard`'s name rule was not run on the live
      database; the suite still exercises it, since nameless leads now insert and only the trigger
      can refuse removing a name. **Left for the user** (needs counsellor + telecaller logins):
      export the WhatsApp Consolidated sheet as CSV → `/leads/import` as a counsellor, new source →
      preview (597 rows; rows with no number, like the first "S. Shingre", listed as skipped) →
      import → filter Source + Unassigned → assign 5 to a telecaller → as that telecaller, exactly
      those 5 → set CNR, comment, add name and class, issue. **Also:** every lead older than 0012
      is unassigned (`created_by` was never filled in), so telecallers see none of them until a
      counsellor assigns them.
- [ ] **Decide whether leads that never took a test are ever purged.** The user's call
      2026-09-28: keep the data, decide later. Nothing is purged yet in practice — the purge counts
      12 months from `leads.created_at`, which for an imported lead is the import date (the
      sheet's own date is kept separately in `lead_origins.source_date` for exactly this reason).
      **Deadline: 12 months after the first import.** After that the nightly purge starts deleting
      untested imported leads, because it treats every lead alike. The consent screen's "kept for
      12 months" covers test data; leads from other sources were consented at source.

- [x] ~~**Apply migration 0011 (class-scoped papers), then deploy, then verify.**~~ **DONE
      2026-09-27** — but **corrected 2026-10-01: the code did not reach production until
      2026-10-01.** The push was blocked by Vercel (see the RESOLVED entry above), so production ran
      09-23 code against this schema and issuing failed for four days. What follows was true of
      the database: the migration went in the migration went in with the database password
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
- [ ] **Rotate the database password now, not later.** Pasted into chat on 2026-09-22,
      2026-09-27 and 2026-09-28, and used from the transcript for migrations 0011, 0012 and 0013
      (the last on 2026-10-01). Supabase → Settings → Database → reset. Nothing on this machine stores
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
- [ ] **Find out which Vercel account holds the GitHub `lwspune` login link.** From 09-27 to
      10-01 Vercel resolved commit author `lwspune` to another Vercel user (`PJQRidKL…`) and
      blocked every deploy here; it cleared after the user changed something on the Vercel side,
      and the cause was never established. The user runs several Vercel accounts from one
      GitHub. Knowing which account holds the login link — Settings → Authentication in each — is
      what stops the next connect silently re-blocking this project. Until then, check every push:
      `gh api repos/lwspune/admissions-ai/commits/<sha>/status` must say "Deployment has completed".
- [ ] **`db:verify` and `db:verify-rls` cannot see migrations 0012 or 0013.** Both refuse to run on a
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

- [ ] **Two topics the new NCERT books teach later than the bank's tags say.** Found 2026-10-06
      by the parent-pack build, which warns whenever a drawable topic has no chapter in the
      child's books. (1) Averages: the mean first appears in *Ganita Prakash 8* ("Tales by Dots
      and Lines"; absent from GP 6 and 7), but M-E-18, M-M-33, M-M-34 and M-D-44 are tagged 7, so
      a class 8 admit on the new books can be asked them. Retagging them to 8 leaves class 8
      maths/moderate 7 → 5 and maths/difficult 3 → 2, still fillable but thin. (2) Speed of
      light and sound: *Curiosity 8* has no sound chapter (it is *Exploration 9*), but S-E-22 is
      tagged 8; class 9 science/easy 11 → 10 if retagged, and sample P9-S1 would move with it.
      Until then the class 8 and 9 sheets say "also asked, though the newer NCERT books teach it
      in a later class". Awaiting the user's decision.
- [x] **Class tags followed the old NCERT books. RETAGGED 2026-10-06** with the user's
      go-ahead. NCERT's new books reached classes 6–8 by 2025–26 and class 9 in 2026–27 and
      moved topics later: percentages, profit and loss, interest (*Ganita Prakash 8* "Fractions
      in Disguise"), ratio ("Proportional Reasoning"), food chains and floating (*Curiosity 8*),
      probability (*Ganita Manjari 9*). M-E-02, M-E-03, M-D-17, M-E-20, M-E-23, M-M-37, S-E-14
      and S-M-28 went to 8; M-M-28 to 9. Seeded to production, all 105 still live, the nine read
      back from the database. Class 8 maths/difficult is now 3 and science/moderate 4. Issued
      papers are frozen and unaffected. State Board and ICSE admits may have met these in class
      7; the later tag is the fair direction for everyone.
- [ ] **Staff references that block removing a staff member.** Found 2026-09-28 while writing
      0012: `assessments.issued_by` and `voided_by` reference `auth.users` with no `on delete`
      rule, so removing (via `/staff` or `staff:rm`) anyone who has issued a test most likely fails
      with "The change could not be saved". 0012 fixed the same shape on `leads.created_by`, which
      it started filling in, and gave every new reference `on delete set null`. Not yet confirmed
      on production; not yet analysed or fixed.
- [x] **Answer keys were piled on A. FIXED 2026-10-06.** Measured over the 83 MCQ items: A 73%,
      B 13%, C 11%, D 2% (science 27 of 28 on A). Options are served in authored order
      (`assemble.ts` shuffles items, not options), so answering A to everything scored 9–10 of
      15 on average. 43 items had their key swapped with one distractor (explanation letters
      swapped to match); 18 stayed put — "None of the above"-style options and numbers listed in
      order. Now A 28 / B 25 / C 24 / D 23%. All 5 production attempts had their stored answers
      and `answer_set` event letters remapped to the same option text; each regraded to its
      stored score before and after. `items:lint` now fails when one letter holds over 40% of a
      subject (`keySkew`). The batch `.md` review sheets carry the old letters, with a note.

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
