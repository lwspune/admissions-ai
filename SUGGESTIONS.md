# Open items

Living checklist for Admissions_AI. Newest concerns first within each section.
Spec: [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) · Context: [BRAINSTORM.md](BRAINSTORM.md)

---

## Do before anyone real uses this

- [ ] **Hiring applicants are kept for good, and nothing can remove one (2026-10-24).** The user's
      call: past applicants inform future hiring, so the purge no longer touches them (step 4,
      migration 0023). No page or script deletes an applicant or their resume, so an applicant who
      asks to be removed can only be deleted by hand on service role: the applicant row (it
      cascades) and `hiring-resumes/<id>` (storage does not cascade). If removal on request is
      wanted, a superadmin-only delete that does both is a small step 5. Applicants are told nothing
      about retention today: neither the issue message nor the test says how long anything is kept.
      Kept for good also means `/hiring` grows for good: it loads every applicant, with their tests
      and notes, in one query and has no paging. Fine at tens or low hundreds; page it (or default
      the filter to the open decisions) before it is slow.

- [ ] **Teacher screening test: built, not yet in use (2026-10-19).** All three steps on branch
      `feat/teacher-screening`; migrations 0020–0022 applied. Verified in headless Edge on local dev
      against production: a teacher kept to /hiring, adds an applicant, sends the link; the applicant
      takes it on a phone; the score and per-question report read back. **Needs the user:** sign off
      a subject's questions (below), merge, then create teacher logins (`/staff`) — not before, as
      the live code shows a teacher as "No role". Then a real WhatsApp send and a real phone.
      **Defaults awaiting the user's word:** 24-hour window, two reissues, no score shown to the
      applicant, the clock does not pause, starting re-checks the number.

- [x] **Teacher screening test: the hiring bank is live (2026-10-21).** All 1,050 questions from
      PYQ Vault promoted on the user's word ("make all content live"), one subject at a time with
      `npm run hiring:seed -- --live --file <subject>`; integration suite 177/177 after. Still open
      from the review: chemistry #37 (`54e5bffa`, MHT-CET 2025 · 21 April Shift I,
      Amines, "Identify product A…"). On a phone it read "… + CH₃CHO +", which looked truncated; the
      stored text ends "+ HCl". The cause was display maths that could not wrap and ran off-screen,
      fixed the same day (`renderTex` draws it wrapping). Confirm it reads whole on a phone.

- [ ] **Scanning paper tests (2026-10-16): built, not yet tried on paper.** Migration 0019 applied;
      unit 532, `paperScan.itest.ts` 14/14, retention 9/9 (the photo purge goes red when removed).
      Read correctly off a photo of the real PDF with pen marks, perspective and a shadow, filed
      through `/scan` by photo and by Edge's fake camera, scores matching `grade.ts`.
      **Needs the user:** a printed sheet filled by hand, scanned with the live viewfinder on a
      real phone — print scaling, real ink, glare, hands. Paper #100032 ("Test test") is open
      until 19 Oct; scanning it files that lead's result for good.
      **Consent — the user's call:** the call consent lists what is recorded (answers, timing,
      device and network details). A photo of the candidate's handwritten answer sheet is now kept
      12 months; the script probably needs a line for it. Nothing on screen was changed.
      **Known limits:** a double mark always needs a tap to confirm (never guessed), so a sheet
      with one is offered for review, not auto-filed; a filed scan cannot be undone (the user's
      choice) — a misread caught after saving has no path back yet. A lead deleted any way but the
      purge (the dashboard, a test suite's cleanup) leaves its sheet photo in `omr-sheets`; the app
      deletes leads only in the purge, which removes them, and a trigger cannot (deleting the
      `storage.objects` row leaves the file). Seen 2026-10-16: two test photos orphaned when the
      integration suite swept `ITest%` leads; removed by hand.

- [ ] **Paper tests (2026-10-16): issue, print and download are LIVE (`5ac7821`); scanning is not.** Migration
      0018 applied; `paper.itest.ts` 12/12, full integration 142/142, `db:probe` pass; golden path
      run as a temporary counsellor on local dev against production (issue → question paper →
      Hindi → OMR PDF built in the browser and read back), sheets in
      `screenshots/2026-10-16-paper-test/`. Until the scanner ships a paper test has **no score**,
      and after three days it cannot be scanned at all — do not hand one to a real candidate before
      then unless the result can wait. **Needs the user's review:** the new Hindi lines of the
      question paper (`CANDIDATE_TEXT.hi.paper`: title, labels, "mark answers on the OMR sheet",
      "write in box Q n"); the marking line reuses reviewed Hindi. **Unverified:** a real printer
      at 100% scale (the sheet's geometry assumes it; "fit to page" shrinks it, which the
      registration grid should absorb but nobody has scanned one), and the OMR file actually
      saving in a real browser — headless Edge cancels every blob download, a five-byte control
      included, so the PDF was checked by capturing the blob the button made, not the saved file.
      **For the scanner:** read the code block with the fixed frame first (`buildAnswerSheetLayout`
      puts it in the same place on every paper), then rebuild the paper's layout from its formats;
      a double mark is wrong, not blank (nda-tracker OMR.md §4); a blank numeric box is a skip and
      a written 0 is "0 in the units column".

- [x] **Hindi (2026-10-11): LIVE.** Migration 0016 applied, all 237 translations signed off by the
      user and loaded, `feat/hindi` merged (`06fad9f`, "Deployment has completed"). A test issued
      on production for a class 9 admit showed the switch on the live site. Unit 366, integration
      115/115 including the Hindi suite, rerun after loading. The staff report's "Answered in
      Hindi" row was seen on the live site the same day (a submitted test with three answers in
      Hindi, then removed). The real-phone check is folded into the Android item below.
- [x] **Hindi parent sheets (2026-10-11): LIVE.** Read and approved by the user, merged (`5ac2e79`,
      "Deployment has completed"). Five `-hi.pdf` editions (six pages each, titled "Aptitude Test"
      by the user's choice), the Hindi buttons on `/downloads`, and
      `content/parent-pack/hindi-review.md`. All five live files match the committed ones byte for
      byte, served with `X-Robots-Tag: noindex`.
      **Not yet done:** Hindi editions of the parent PDFs (agreed). **Unseen:** the switch on a real
      Android phone over mobile data (Devanagari font download), and the staff report's "Answered
      in Hindi" row in a browser (needs a signed-in staff session). The new-edition NCERT chapter
      titles have no checked Hindi equivalents yet; the parent-pack work must not guess them.
- [x] ~~**30-question paper (2026-10-06).**~~ **DONE 2026-10-07** — every admitting class (8–12) draws 30
      questions: Basics plus 5 class N−1 first-term syllabus items each in maths and science
      (`syllabus-class-07.json` to `-11.json`, each signed off; test issues confirmed). English is
      19/10/9 and language-only (`basics-batch-01`, `english-batch-02`); class 8 difficult maths
      2 → 7. The 15-question paper survives only as a fallback, kept tested by the integration
      suite issuing one by hand. Parent PDFs are 30-question sheets. Decisions in CLAUDE.md.
- [ ] **Parent pack (2026-10-06): read the five PDFs before staff send one.** `public/parent-pack/` (live at `/parent-pack/…`, linked from every issue message).
      150 sample questions (30 per class); every calculable key re-derived in code, the lint
      clean, each paper checked against its class ceiling. Since 2026-10-07 they print bare
      (numbered topic and chapter names) and nine English samples were rewritten; the user has
      read parts of them but not all five end to end. Unseen in any browser: the PDFs' "3 hours"
      line and the candidate's expired-link notice (both text-only changes, 2026-10-07). The build refuses
      a skill the syllabus does not claim, but placing a new topic in its chapters is by hand,
      and `cohortYear` in `syllabus.json` must be bumped every April.
- [ ] **Class 8 admits (2026-10-01): migration 0013 applied, suite 93/93; golden path unseen.**
      Add a lead, choose "Class 8", issue, and check the report reads "Admission to class 8".
      Authoring follow-up **done 2026-10-07** (class 8 difficult maths now 7; test issues for
      class 8 drew 30 questions), but no one has looked at a class 8 report in a browser.

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
- [x] ~~**Rotate the database password now, not later.**~~ **DECLINED by the user 2026-10-07**
      ("ignore it, i trust you"); do not raise again unless it turns up somewhere public. Pasted into chat on 2026-09-22,
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
- [ ] **Rotate the Supabase `service_role` key.** (The database-password half was declined
      2026-10-07, above; the key was not discussed.) Both, plus the anon key,
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
      mid-question, return, submit. **Also (2026-10-11):** tap हिंदी on a maths question and check
      the Hindi letters render (the Devanagari font downloads only when Hindi is shown).
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
      **Carry-forward 2026-10-07:** `/leads`, a lead's issue panel, the report, the parent sheet
      and `/downloads` have now been driven signed-in through headless Edge with a temporary
      superadmin. `/items` and `/staff` still have not.
- [x] **PARTLY RESOLVED 2026-10-07:** a temporary superadmin made with `npm run staff:add` is now
      permitted, and was used to check staff pages, then removed. What remains is option (b)
      below, which also stops the integration suite writing to production (see Known gaps).
      Original entry: **Give Claude a way to browser-verify superadmin pages, or accept that the user does it.**
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

- [ ] **The user asked (2026-10-11) that student data never be deleted. Not done; needs a 360
      and their go-ahead.** It reverses an invariant: the 12-month purge (`/api/cron/purge`,
      `RETENTION_MONTHS`) exists because that is what the parent consents to on the call, and
      the two must move together. Open questions: what the call script then says about how
      long data is kept; whether minors' data kept indefinitely fits DPDP's purpose-limitation
      and erasure duties; whether "keep the score, drop the IPs and device details" would
      serve. No row is due for deletion before 2027-09 (the first lead is from 2026-09-22),
      so nothing is lost while this is decided.
- [ ] **Homepage messages: what is deliberately not built (2026-10-11).** No email or WhatsApp
      alert on a new message; the unread count in the nav is the signal. `/messages` shows
      the newest 200. On a phone the staff nav scrolls sideways and Messages, with its count,
      starts off-screen (Staff already did): scrolling the current tab into view would fix
      both, and touches every staff page.

- [ ] **Consent now lives only on the call (2026-10-11): check the call script says it.** The
      consent and handover screens were removed from the test link (the user's call, to cut
      friction). Everything the screen told the parent must now be said on the recorded call:
      what is recorded (answers, timing, device and network details), that it is kept 12
      months, that only the institute sees it, and that a score summary may be sent to them.
      Unverified: nobody has checked the call script against that list. `leads.consented_at`
      has never been written by anything — no consent record exists in the app, before or
      after this change. If a record is ever wanted, the telecaller ticking "consent taken"
      before issuing is the natural place.

- [x] ~~**GoPost's hourly read is idle until its two Vault secrets exist.**~~ **DONE 2026-10-26.**
      The first import ran by hand (2,579 leads: 2,577 new, 2 merged, 0 siblings); the Vault
      secrets were set on the user's go-ahead, and a manual `internal.trigger_gopost_sync()` got a
      200 and moved `lead_feeds.last_synced_at`. `gopost-leads-hourly` runs at :45. Not yet seen:
      a run fired by the schedule itself rather than by hand; check `last_synced_at` after the
      next :45.
- [x] ~~**The purge reads expired leads in one query, which Supabase caps at 1,000 rows.**~~
      **FIXED 2026-10-26.** Worse than first written here: the test that expired 1,001 leads at
      once showed the delete (`in('id', …)` with every id in the URL) refused outright with a
      400, so from about October 2027, when the 2,577 GoPost leads expire together, every nightly
      purge would have failed and kept data past the consented 12 months. `purgeExpired` now
      reads in pages of 1,000 and deletes in chunks of 100 ids (sheet photos in 100s);
      `retention.itest.ts` holds it. No other read is affected: `/leads` pages with `range`, and
      the import's preview already chunks its `in` filter.
- [ ] **GoPost's leads: assignment, and what does not travel (2026-10-26).** They arrive
      unassigned, so telecallers see none until a counsellor assigns them (bulk assign on
      `/leads` works today); automatic assignment is the user's "later". Only new leads travel: a
      name or course fixed in GoPost afterwards, or a "Not a lead" there, never reaches this app.
      About 2,500 of the 2,579 are website leads (PYQ Vault students and the NDA age
      calculator), including CDS and AFCAT adults, by the user's choice. They are kept 12 months
      from their import date like any lead (see "Decide whether leads that never took a test are
      ever purged" below, which this import makes matter).
- [ ] **Lead management: what is deliberately not built (2026-09-28).** EIS matching (the user
      will share the EIS Excel; decide then whether "in EIS" is a flag or carries EIS status);
      call-back reminders; automatic intake from Meta / Google forms (since 2026-10-26 GoPost
      gathers those and this app reads GoPost hourly, so direct intake is no longer needed); a per-row Source column in
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
      **It happened again 2026-10-16** (`2a89a01`, the paper tests): `readyState BLOCKED`,
      `seatBlock TEAM_ACCESS_REQUIRED`, GitHub 265271616 now resolved to Vercel user
      `ma9VhhCWbsoAhb4bcLWBT9To`, verified — a third account, neither this project's
      (`connectapjschool-4966`, `v22v1W7a…`) nor 09-27's `PJQRidKL…`. `72a1e0f` deployed hours
      earlier, so the link moved today. The status page gives no reason and `vercel inspect` says
      `UNKNOWN`; the reason is only in the API's deployment record
      (`GET /v13/deployments/<id>` → `seatBlock`). Cleared the same day after the user changed
      the link on the Vercel side: `5ac7821` deployed, and the paper test was issued, printed and
      its OMR sheet built on the live site by a temporary counsellor (then removed).
      **Again 2026-10-19** (`e44c81c`, the teacher screening test): `BLOCKED`, `TEAM_ACCESS_REQUIRED`,
      GitHub 265271616 resolved to the same `ma9VhhCWbsoAhb4bcLWBT9To` as 10-16 — so the 10-16 fix did
      not hold. Production stayed on `6f4321b`; migrations 0020–0022 were already applied, which the
      old code ignores (new tables only). Read the reason with the CLI's own token:
      `GET https://api.vercel.com/v6/deployments?app=admissions-ai&limit=3&slug=apj-school`, then
      `GET /v13/deployments/<uid>?slug=apj-school` → `seatBlock`.
- [ ] **The integration suite is coupled to production content (2026-10-07).** It runs against
      the live database and draws from the live pool, so a content change can turn it red with no
      code change: after the class 10 batch went live, twelve tests still expected 15 questions,
      and nobody noticed until two promotions later. Now a Trap in CLAUDE.md (rerun after every
      promotion). **Why it matters:** a red suite that is red for content reasons trains people to
      ignore it. **How to apply:** either option (b) under the browser-verify item (a separate
      Supabase project seeded with fixed fixtures), or make the shape assertions follow
      `choosePaperShape(live_pool)` instead of a literal 30.
- [ ] **`db:verify` and `db:verify-rls` cannot see migrations 0012 onward (now up to 0015).** Both refuse to run on a
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
- [ ] **Does the purge cron still run after the redirect?** On 2026-10-11 the old domain
      became a 308 redirect, and `/api/cron/purge` on it now answers 308. If Vercel's scheduler
      calls the old domain rather than the deployment, the purge stops silently. Check after
      03:00 UTC on 2026-10-12: Vercel → Logs, `/api/cron/purge` should show a 200 and the
      `purge: cutoff=… leads=…` line, not a 308.
- [ ] **Custom domain.** **Renamed 2026-10-11** to `aptitudetestai.vercel.app` (the old
      `admissions-ai-omega.vercel.app` 308-redirects to it, path kept, for links already sent). That fixes the odd
      name, not the trust problem: a link from an unrecognised `vercel.app` subdomain, arriving
      from an unknown number, is exactly what people are taught not to tap. A subdomain of the
      institute's own domain would materially improve the open rate. The team owns no domain
      today; it needs one CNAME record plus `NEXT_PUBLIC_APP_URL` and a rebuild, nothing in code.
- [ ] **Vercel Hobby is licensed for non-commercial use.** This is a fee-charging institute's
      admissions pipeline. If enforced, candidate links go down mid-window with no warning to the
      telecaller. Decided on 2026-09-22 to stay on Hobby for now; revisit before a real intake.
      **2026-10-11:** the homepage now pitches the product to other institutes, which makes the
      commercial use public. The user is gauging interest before doing anything commercial;
      the plan (Pro, or a separate project for the sales page) is due before any paid use.
- [x] ~~**The report does not exist.**~~ **DONE 2026-09-22** — `/reports/[leadId]`: score, section
      bars, the five facts, and an expandable per-question table. Question stems are hidden from
      telecallers. `src/lib/report.ts` is pure with 20 tests.
- [ ] **Bank size, updated 2026-10-07: 275 live items** (maths 65/29/33, English 19/10/9, science
      60/25/25 easy/moderate/difficult, of which 150 are syllabus items), 7 retired. Every class fills
      the 30-question paper. The original entry below (105 items) is history.
      Original: **The bank holds 105 items, not 300 — all live and signed off as of 2026-09-23.**
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
- [ ] **Answer keys that rest on a rationale and a human read, with no machine check behind them.**
      Updated 2026-10-07: every English item (38 live) and most science MCQs, including the
      syllabus batches' judgement keys (each batch's review sheet lists them). Original count: 36.
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

- [x] ~~**Leads issued a test before 0024 still sit at New.**~~ **DONE 2026-10-26**, on the user's
      word ("move them to contacted"). The 26 leads with a test (24 submitted) had sunk to pages
      52–53 of New leads under the GoPost import; all 26 moved to Contacted, each with a "new →
      contacted" history line signed System, which is also the record of exactly which moved.
      Contacted rather than In EIS: a finished test is not an enrolment.

- [ ] **Some times are formatted without India's zone (2026-10-19).** Found live on /hiring: the
      server runs on UTC, so "added 08:47 am" was 2:17 pm. Hiring now uses `istTime`/`istDay`, and
      the unit suite runs on UTC (`vitest.config.ts`) so a zoneless format fails there instead of
      passing on an India-time laptop. Four shipped client components format without a zone —
      `IssuePanel.tsx:181`, `ReportView.tsx:440`, `StaffConsole.tsx:316`, `CandidateFlow.tsx:579`
      (the "start by" time a parent reads). They render first on the server in UTC, then in the
      browser in IST, so the text can disagree between the two (a hydration mismatch React patches
      up, or shows UTC). Not yet analysed (360 needed: the fix is one option per call).

- [ ] **An assessment's state can move backwards (2026-10-19).** Found in the hiring test's browser
      check: a submitted test read `opened` again, so its link showed the number screen instead
      of "submitted". The page load marks a test opened with an unconditional update; a slow load
      that read `issued` wrote after the submit. The hiring tables now refuse any backward move
      (migration 0022) and write `opened` only while still `issued`. `openByToken`
      (`src/server/attempt.ts:63`) has the same unconditional write, and `assessments` has no
      transition guard, so the same race could hit a candidate: start would still refuse (the
      attempt is submitted), but the link and the staff list would say "opened". Not yet analysed
      (360 needed: the fix is one `.eq('state', 'issued')` and a trigger like 0022's).

- [ ] **`items:seed` reads the bank's statuses in one request, and the API stops at 1000 rows
      (2026-10-19).** Found building `hiring:seed`: its first run counted 1000 of 1050 rows, and
      the same read decides which questions keep `live`. Past 1000 items, a plain re-seed would
      treat every unread item as new and demote it to `review` — the trap the status rule exists
      to prevent, and nothing would say so until a paper could not be filled. `hiring:seed` pages
      its reads. `scripts/seed-items.mts` (the `existingRows` and `inBank` fetches) and
      `loadBank` in `src/server/items.ts` do not; the student bank is far below 1000 today, so
      nothing is wrong yet. Not yet analysed (360 needed).

- [ ] **`db:verify`'s probes no longer run anywhere (2026-10-16).** They refuse a database holding
      leads, and the only database is production, which always holds leads now — so every check in
      `verify-schema.mjs` (MCQ shape, class ceilings, Hindi shape, reissue cap…) has been inert
      since the first real lead, while the docs still cite it as the proof. `npm run db:probe`
      runs rollback-only probes safely on production; porting those checks into
      `supabase/probes/` would make them live again. Not yet analysed (360 needed: most are also
      covered by the integration suite, so the real gap may be small).

- [x] **Two topics the new NCERT books teach later than the bank's tags said. RETAGGED
      2026-10-07** with the user's go-ahead. Averages (the mean first appears in *Ganita Prakash
      8*): M-E-18, M-M-33, M-M-34 and M-D-44 went 7 → 8. Speed of light and sound (*Curiosity 8*
      has no sound chapter; it is *Exploration 9*): S-E-22 went 8 → 9, and the class 9 parent
      sample P9-S1 was replaced with a food-chain question. Seeded and read back from production.
      Class 8 maths is now moderate 5 and difficult 2 — every class still fills, but class 8
      difficult maths is the thinnest cell in the bank (each item on about one paper in two).
      The parent-pack build no longer warns "also asked" for any class.
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
      it started filling in, and gave every new reference `on delete set null`. **Confirmed on
      production 2026-10-07:** `staff:rm` of a temporary superadmin failed with
      `assessments_issued_by_fkey` until its test leads (and so their papers) were deleted. A
      real staff member who has issued tests cannot be removed. Not yet analysed or fixed; the fix
      is a migration giving `issued_by` and `voided_by` `on delete set null`.
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
  by the 3-hour window (2 hours until 2026-10-07) and reported via answer-changed-after-pause. Revisit if the reports show it
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
