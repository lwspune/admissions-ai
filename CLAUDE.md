# Admissions AI

Gate 2 of an NDA coaching institute's admissions funnel: a 30-question,
30-minute reasoning test (15 questions in 15 minutes only as a fallback). Staff
issue it per candidate, the link goes to the **parent's** WhatsApp with the
class's syllabus PDF, the candidate starts it within three hours, and it grades
itself server-side.

| Doc | For |
|---|---|
| [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) | What it does and why. The v1 contract |
| [HIRING_TEST_SPEC.md](HIRING_TEST_SPEC.md) | The teacher screening test, a second track (2026-10-19) |
| [SUGGESTIONS.md](SUGGESTIONS.md) | Open items, traps, what is unverified |
| [BRAINSTORM.md](BRAINSTORM.md) | The wider funnel this sits inside |
| [DEPLOY.md](DEPLOY.md) | Deployment and credential rotation |
| [content/items/README.md](content/items/README.md) | Item fields and the class tag, for authors |
| [content/parent-pack/README.md](content/parent-pack/README.md) | The syllabus and sample-paper PDFs for parents |
| [DECISIONS_HISTORY.md](DECISIONS_HISTORY.md) | Decisions older than the log below keeps |

**Live:** https://aptitudetestai.vercel.app (the old `admissions-ai-omega.vercel.app`
308-redirects to it, path kept) · repo `lwspune/admissions-ai` (private)
Supabase project `ohcvimrxaeeqbmnucbcn` · Vercel team `apj-school`.

**Git integration is connected: a push to `main` deploys to production.** Other
branches get a preview deployment, which Vercel's own login protects, so a
preview is not a second open copy of the system. `npx vercel --prod` is the
manual path. Both stop dead if Vercel cannot match the commit author to this
account — see "A push is not a deploy" under Traps. Migrations are never part of a deploy (see below), so a
push ships code against whatever schema is already live — **and the reverse
bites too**: applying a migration while its code sits on a branch leaves
production running against a schema it does not know about. Ship them close
together, schema first only when the old code tolerates it.

`vercel.json` registers one cron: `/api/cron/purge`, daily at 03:00 UTC.
Hobby caps cron frequency at once per day, so the hourly GoPost read comes from
the database instead: pg_cron job `gopost-leads-hourly` (migration 0025) posts to
`/api/cron/gopost` at :45, once the Vault secrets `gopost_sync_url` and
`gopost_sync_secret` exist.

---

## Architecture

Next.js App Router + TypeScript + Supabase. Three layers, deliberately separated:

**`src/lib/` — pure.** Plain data in, plain data out, no IO. This is where the
logic worth testing lives, which is why it tests without a database.
`grade` · `timer` (active-time accounting) · `assemble` (the draw, and the
15-or-30 choice) · `serialize` (**the security boundary**) · `report` · `items`
(seed-status rules incl. retirement, per-class coverage, 30-question readiness,
the no-logic-puzzles-in-English rule) · `classes` (the N−1 content rule and the
syllabus rule) · `syllabus` and `samplePaper` (the parent pack's contents) · `hindi` (the rules a
translation meets, whether a paper offers Hindi, per-class coverage) · `candidateText` (every
candidate screen's words, English and Hindi) ·
`parentPack` (the PDFs' public paths and the issue message) ·
`retention` (the 12-month rule) · `leads` (stages, the import rules, list filters) ·
`gopostLeads` (GoPost's feed: a lead as an import row, the page check, the /leads warning, the paging loop) ·
`bearer` (the secret check of every route that guards itself) · `leadExport` (the Excel download: the CSV, its rules) · `initials` (an avatar's letters) ·
`contact` (what a homepage message must hold) · `publicPaths` (what opens without a session) ·
`omr/layout` (the paper test's answer sheet, **the contract with the scanner**) · `omr/sheetPdf` (its ink) ·
`omr/detectSquares`, `omr/gridFit`, `omr/readBubbles`, `omr/liveCapture` (the reader, ported from nda-tracker) ·
`omr/readAnswerSheet` (paper code, then answers) · `scanResult` (settling flags, the save, its validation) ·
`paperSheet` (what the sheet may know, an allow-list) ·
`hiring` (the teacher screening test: which PYQ Vault questions it can carry, the pool pick, the bank lint) ·
`mathText` (LaTeX in question text, ported from PYQ Vault's parser; KaTeX) ·
`csv` (the reader) · `mobile` · `token` · `ip` · `types`

**`src/server/` — service layer.** Marked `server-only`, which turns "imported
into a client bundle" into a build error. `supabase` (service-role client) ·
`auth` (session-bound client) · `staff` (accounts, via the admin API) · `assessments` (issue) · `items` (the bank) · `attempt` (open,
identify, start, save, record, submit) · `report` · `retention` (the purge) ·
`leads` (list and detail reads) · `leadImport` (preview and commit) · `gopostSync` (the hourly GoPost read) · `leadExport` (the download's reads) · `contact` (homepage
messages: send, list, mark read) · `paperTest` (a paper test's question paper and sheet) · `paperScan`
(look a paper up by its number, file a scan, the sheet photo) · `hiring` (the teacher test: its bank,
adding an applicant, issuing) · `hiringAttempt` (the applicant's side: open, number check, start, save, submit)

**`src/components/`** — the shared look: `ui` (button, field, card, badge and
alert styles, no hooks, so server and client pages share them), `icons` (inline
SVG, no icon package), `StaffShell` (the frame round every staff page),
`ConfirmDialog` (a native `<dialog>` in place of `window.confirm`),
`StaffLoading` and `MathText` (KaTeX drawn on the server; the hiring questions). Colours, corners and shadows are set once in `tailwind.config.ts`
(`brand` is indigo, from the parent sheet); a page should reach for these before
writing its own classes.

**`src/app/`** — `/` (the homepage), `t/[token]/`, `h/[token]/` (the teacher test's link) and
`api/cron/` are the only unauthenticated routes; the list and the reason for each is `src/lib/publicPaths.ts`.
The homepage is for other institutes: one line, an animation cycling through the
test, report, leads and admin screens (`ProductTour`, `tourScenes`) and a "Get in touch" button that opens the contact form in a
`<dialog>` (`ContactDialog`); staff who land on it go to `/leads`.
`api/cron/` guards itself with `CRON_SECRET`. The parents' PDFs in
`public/parent-pack/` are open too, as static files (no candidate data). `api/t/*` are
thin wrappers over `src/server`. `leads/` (the pipeline: a bar of stages, the chosen stage listed below, a lead moved from its row), `leads/[id]/`, `leads/[id]/paper/[assessmentId]` (the paper test, counsellor and superadmin), `scan/` (scanning sheets, counsellor and superadmin), `leads/import/` (counsellor and superadmin), `login/`, `reports/[leadId]/` (and `/summary`, the parent sheet), `items/`, `staff/`, `messages/` and `hiring/questions` (superadmin only), `downloads/` (admissions roles), `hiring/` and
`hiring/[id]` (teacher and superadmin) are staff, guarded by
`src/middleware.ts`.

**Two clients, never interchangeable.** Staff paths use the session-bound
client so **RLS** decides access; the candidate API uses service role because
it has no session to act for, and so do the homepage's contact form and the hourly
GoPost read (`/api/cron/gopost`), for the same reason. A staff feature reaching for service role is a
bug — it moves the access rule out of the database and into an `if`. The one
sanctioned exception is `src/server/staff.ts` (see Invariants): login accounts
have no RLS path at all.

## Invariants

These are the things that quietly break everything if violated.

- **The answer key never reaches the client.** `toCandidatePaper` is an
  ALLOW-LIST, not a delete-list — a column added to `test_items` later must not
  silently start shipping. Its tests assert on serialized bytes, since a
  property check is defeated by nesting.
- **The parent report carries the score and nothing else.** `toParentReport`
  is an allow-list like `toCandidatePaper`: name, date, time used, total and
  per-subject score with correct / wrong / not-attempted counts. No question,
  answer, skill, integrity fact, percentile or verdict — its test checks the
  bytes. The consent taken on the call must say a summary may be sent to the
  parent; there is no on-screen consent since 2026-10-11.
- **Constraints and triggers enforce, not application code.** The reissue cap,
  the MCQ/numeric item shape, answer idempotency, and the assessment state
  machine all live in Postgres. `npm run db:verify` proves the database
  actually rejects what it claims to.
- **Roles and staff names live in `app_metadata`, never `user_metadata`** — the
  latter is editable by the signed-in user. Read via `getUser()`, never `getSession()`,
  which trusts a cookie the browser can edit.
- **No cut-off is computed anywhere.** The score is reported; a human sets the
  bar, outside the app. Do not let this drift inward.
- **v1 displays fraud signals as plain facts and does not score them.**
  Weighted integrity bands, collusion detection and item discrimination are
  deferred until there are hundreds of attempts to calibrate against
  (spec §12). Do not reintroduce them.
- **A frozen paper is immutable.** `assessment_items` is insert-only even for
  superadmin; a question changing under a candidate mid-attempt is the failure
  that table exists to prevent.
- **Answer keys are superadmin-only.** Non-superadmin staff read `test_items`
  only for items that have appeared on a paper (migration 0008), so the review
  queue is invisible to them. The paper draw goes through `live_pool()`, which
  returns `id, subject, difficulty, part` and no answer — never `select` the
  table for a draw, or a newly promoted item becomes undrawable.
- **A paper carries its own size and time.** `assessments.question_count`,
  `limit_minutes` and `class_level` are set by `issue_assessment` (migration
  0014) and read by the timer, the test screens and the report. There is no
  global question count or time limit any more; `limitMsFor` turns a paper's
  minutes into the limit, and the timer functions require it. A 15-question
  attempt from before 0014 keeps its 15 minutes.
- **Two parts, one rule each.** Basics: `taught_in ≤ N−1`, the existing rule.
  Syllabus (maths and science only): `taught_in = N−1` *and* `term = 1`,
  because a candidate tested in October has not been taught class N−1's second
  term. Both are in `src/lib/classes.ts` and in `live_pool()`. A class gets 30
  questions only when its live pool fills every quota of `SHAPE_30`
  (`choosePaperShape`), otherwise 15; `issue_assessment` checks the paper's
  subject-and-part make-up for either shape.
- **Telecallers never see question text.** `loadPaper` blanks both the stem
  and the options for that role — options alone identify an item, and
  `correctDisplay` renders "C. <option text>". This is the one access rule that
  lives in application code rather than the database, because RLS cannot mask
  columns per role. It was inert until the report gained a Question column;
  `report.itest.ts` is what stops it becoming inert again.
- **Staff accounts are managed on service role, gated in `src/server/staff.ts`.**
  Creating, re-roling or deleting a login is only possible through the auth
  admin API, so RLS never sees it — the second access rule in application
  code. Every export takes the actor from `currentStaff()` and refuses a
  non-superadmin; nobody may change their own account, which is also what
  keeps one superadmin in existence. `staff.itest.ts` fails if the gate goes.
  The database reads roles from the JWT, so a demotion or removal reaches RLS
  only when that token expires (≤ 1 hour).
- **The paper is scoped to the class being admitted to.** `leads.class_level`
  is the class the student joins (8–12), not the one they are in;
  `test_items.taught_in` is the class in which the content is taught (6–11,
  6 meaning "open to everyone" and what an untagged item carries), in the
  NCERT book this year's admits used; where old and new editions disagree, the
  later class. An admit to
  class N draws `taught_in ≤ N−1`. The rule is stated once in
  `src/lib/classes.ts` and enforced in `issue_assessment`, which checks the
  finished paper against `live_pool(p_class)` — a SECURITY DEFINER function,
  because the RPC runs as the caller and migration 0008 hides unissued items
  from non-superadmin staff, so a direct check on `test_items` would pass
  vacuously. Coverage is a per-class property: `items:lint` refuses a bank that
  strands a class and `/items` shows the table. There is no overload of
  `live_pool()` without a class; a draw that does not name one cannot run.
- **Candidate data is kept 12 months, because that is what the parent consents to.**
  `RETENTION_MONTHS` in `src/lib/retention.ts` and the consent taken on the
  recorded call must move together; the app has shown no consent text since
  2026-10-11. A new table holding candidate data must
  either cascade from `leads` or be added to `purgeExpired` by hand —
  `identify_attempts` has no foreign key and is the standing reminder.
  An imported lead's `created_at` is its import date, never the source's
  date (that is `lead_origins.source_date`) — or the purge would delete a
  2025 sheet row the night it arrived.
- **Every lead and applicant belongs to one org, and staff see only their own org's.**
  Orgs are LWS branches (`organizations`, migration 0030: LWS Pune, LWS Delhi); superadmin sees
  every org. A staff account's org is `app_metadata.org_id`, beside the role (`staff:org`), read
  by `auth_org()`; an account with no org sees nothing. `leads`, `hiring_applicants` and
  `lead_feeds` carry `org_id`: a session's insert takes its own org whatever it sends (superadmin
  may name one), a service-key insert must name it, and a lead never changes org. `can_see_lead()`
  and `can_see_applicant()` add "in my org", so everything hanging off either inherits it. The
  doors that skip RLS check it themselves: the sheet photo (`omr_sheet_readable`/`_writable`),
  `record_paper_scan`, the resume, `issue_hiring_test`, `leads_on_mobile`, and the import merge,
  which matches a number within one org (the same parent at Pune and Delhi is two leads). The
  question banks and lead source names are shared. GoPost's feed writes into its row's org
  (Pune's). A new root table holding an org's data needs `org_id` and these checks
  (`orgs.itest.ts`, `db:probe -- 0030`).
- **A telecaller sees only leads assigned to them; visibility is stated once.**
  `can_see_lead()` on `leads` (migration 0012), and every table hanging off a
  lead — assessments, attempts, answers, events, identify_attempts, comments,
  origins — asks "can I see the parent row?" through its own policy, since a
  policy's subquery is itself under RLS. Only counsellors and superadmin
  assign, and only to a telecaller: the `leads_guard` trigger, not the page.
- **Lead history is append-only, and its author comes from the session.**
  `lead_comments` has no update or delete policy; `lead_comments_stamp`
  overwrites whatever author the client sends. Stage changes write their own
  line (`leads_stage_history`); the insert policy refuses kind `stage` from
  anyone else.
- **An import adds; it never overwrites.** One number is one lead. A number
  on one lead gets the new origin and notes, and a name or interest only
  where it had none — stage and assignment are untouched. A number on several
  leads (siblings) is reported, not guessed at. `import_leads` is one
  transaction: a bad row writes none of the file.
- **Hindi is a second rendering of a maths or science item, never a new item.**
  `stem_hi` and `options_hi` sit on `test_items` and share its key, numeric answer and option order,
  so moving an option between letters or dropping a number makes a wrong question that grades as a
  right one; `items:lint` checks both, per option. English is never translated
  (`test_items_hindi_shape`). A paper carries Hindi only when every maths and science question on it
  has one (`paperHasHindi` in `toCandidatePaper`, the same allow-list). A plain `items:seed` never
  writes the Hindi columns; only `items:hindi -- --file`, the reviewer's sign-off, does, through
  `set_hindi()` (all or nothing). The paper's text is read live from `test_items`, so the
  `test_items_hindi_frozen` trigger refuses a Hindi change while a candidate is mid-test on it; a
  change of meaning is a retirement, not an edit. The staff report shows the English only.
- **The homepage shows mock-ups, never data.** The animation is drawn from the
  app's components with invented names. A question shown there must come from
  the public sample paper, never the bank, whose answer it would publish. `robots.ts` allows `/` exactly (`/$`) and nothing else; the root's match
  in `publicPaths` is exact, because a prefix match on `/` opens every path.
- **Homepage messages are superadmin's, and kept.** `contact_messages`
  (migration 0017): written only on service role by the form's action, read only
  by superadmin, and the one column anyone may change is `read_at` (a column
  grant, not a policy). Nobody deletes them, by the user's choice: they are not
  candidate data and the purge does not touch them. The rate limit (5 an hour
  per address, 30 an hour in all) is a trigger, since serverless instances share
  no memory.
- **A paper test is a counsellor's, and its sheet's frame never moves.** `assessments.mode` is
  `online` or `paper` (migration 0018). The `assessments_paper_guard` trigger — not the issue
  function, since staff may write `assessments` directly — refuses a paper test from anyone but a
  counsellor or superadmin (printing shows every question), draws `paper_no` from `paper_no_seq`
  whatever the client sent, and refuses any later change to mode or number (a paper test flipped
  online would make its unsent token a link). `loadByToken` opens only `online` tokens, and
  `loadPaperTest` returns nothing to a telecaller; `paper.itest.ts` holds both. The OMR sheet's
  geometry is the same on every paper — registration grid, code block, 30 rows, 18 numeric
  slots — because the scanner reads the paper code before it knows the paper; only which rows get
  A–D bubbles and which slots are drawn changes. Change the frame only with `LAYOUT_VERSION`. A
  paper test holds at most 18 numeric questions (`NUMERIC_SLOTS`, checked in `issue_assessment`
  through `live_pool()`'s `format`), and `items:lint` refuses a numeric answer the box cannot hold
  (0–9999.99, two decimals).
- **A scan is filed once, by a counsellor, and the database grades it.** `record_paper_scan`
  (migration 0019, SECURITY DEFINER) refuses anyone but a counsellor or superadmin, an online
  test, a second scan, a closed window, a missing photo and answers that do not fit the paper,
  then grades the stored answers itself — the browser never sends a score, and
  `paperScan.itest.ts` holds the SQL to `grade.ts`'s numbers. A double mark (`double_mark`) grades
  wrong, never blank. The reader never guesses: an unclear bubble, a double mark or an unclear
  numeric column goes to a person, and Save stays off until none is left. The sheet photo is
  `omr-sheets/<assessment id>.jpg`, private, read by counsellors and superadmin only, writable
  only while the paper is still open, so a filed scan's photo is its record; the purge deletes it
  by name, since storage does not cascade (`retention.itest.ts`).
- **The teacher screening test is a second track that shares no table with admissions.**
  `hiring_items` (migration 0020) holds real exam questions from PYQ Vault; `can_hire()` (teacher
  or superadmin) is its gate. `is_staff()` lists telecaller, counsellor and superadmin only, so a
  teacher is refused by every admissions policy without one being touched — never add teacher to
  it. In app code the middleware keeps a teacher on `/hiring` (`roleMayOpen`), and role checks are
  allow-lists (`canManageLeads`, `isAdmissionsStaff`, `canHire` in `src/lib/staff.ts`): never write
  `role !== 'telecaller'` again — it lets every role added later through. The bank's shape
  rules are constraints (`npm run db:probe -- 0020`); signed-in users only read it.
  An applicant is stamped with who added them and their org, and a teacher sees every applicant
  in their org (0030; before it, only their own); `issue_hiring_test()` is the only way a test is made and draws the paper itself, and
  no two papers in a subject hold the same set. The clock does not pause, the database sets the
  deadline and grades (`submit_hiring_attempt`), and a test's state only moves forward
  (migrations 0021–0022, `db:probe -- 0021`, `hiring.itest.ts`). The applicant's browser gets
  `toApplicantPaper`, an allow-list like `toCandidatePaper`, as server-built HTML (`mathToHtml`).
  After the test (0023): a decision that only superadmin moves into or out of hired and rejected
  (a trigger), insert-only `hiring_notes`, and one resume per applicant in the private
  `hiring-resumes` bucket, recorded by `attach_resume()` (`db:probe -- 0023`). **Applicants are
  never purged** (the owner's call, 2026-10-24); the 12-month rule is admissions' only, so a new
  hiring table needs no purge entry, and the resume bucket is not in `purgeExpired`.
- **A lead's name is optional until a test is issued, then permanent.**
  `issue_assessment` refuses a nameless lead (the candidate confirms the name
  on screen), and `leads_guard` refuses removing a name once set.
- **Issuing a test moves a New or CNR lead to Contacted, and never moves one back.**
  A trigger on `assessments` (migration 0024), so online, paper and direct writes
  all count; the history line is the issuer's. A lead added by hand starts at
  Contacted (`createLead`); imports set their own stage, New unless the file says.
- **Five stages, and the pipeline is where a lead moves.** New → CNR → Contacted →
  In EIS → Not interested: `STAGES` in `src/lib/leads.ts`, in pipeline order, and
  the `leads_stage_known` CHECK (migration 0026; Qualified became In EIS). On
  `/leads` the bar shows every stage's count and `?stage=` picks the one listed
  below, 50 rows a page (`listPipeline`). A row moves its lead one click on
  (`NEXT_STAGE`) or anywhere from its ⋯ menu; the lead's own page shows the
  stage and does not change it. Detail lookups go 100 leads at a time (the
  1,000-row and URL traps). Ticked leads move together through `move_leads`
  (migration 0029): counsellor and superadmin only, at most 500, one transaction,
  ids in the body, RLS still deciding, a history line per lead that moved. A
  selection lasts only while the stage, page and search stay put (`StageList` is
  keyed by them), so nothing ticked out of sight is moved.
- **A stage lists newest enquiry first, by `leads.enquired_on`, which the database keeps.**
  Migration 0027: the latest `lead_origins.source_date`, so a repeat enquiry moves a
  lead up and an older one never moves it back; a lead an import creates takes its
  first origin's date however old (the `lead_origins_enquired` trigger tells it by
  `created_at = now()`, the same transaction); a lead typed in by hand takes the day,
  in India, and keeps it. It sorts and labels rows only; the retention clock stays
  `created_at`.
- **Downloading leads is a counsellor's and superadmin's, and it takes the stage on screen.**
  `POST /leads/export` (`src/lib/leadExport.ts`, after GoPost's): every lead of the stage
  under the filters, or those that reached the app (`created_at`) since your last download
  of that stage, or the leads ticked on screen (ids in the body, at most 500), which neither
  reads nor moves the download point. `record_lead_download` (migration 0028) refuses anyone else and stores the
  point per person and stage, after the file is built; reads page by 1,000. The CSV starts
  with a BOM built by `String.fromCharCode` (the escape for it, written in source, landed as the raw character
  once), keeps formula characters inert and writes mobiles as "98765 43210".
- **GoPost's leads arrive by the import's rule, and the feed's cursor moves with them.**
  GoPost serves LWS Pune's leads at its `/api/feeds/admissions` behind
  `GOPOST_LEADS_SECRET` (`ADMISSIONS_LEADS_SECRET` there); this app holds no key
  to GoPost's database. `import_feed_page` (migration 0025, service role only)
  writes a page, its sources (by channel: "Instagram", "Website"…, no "GoPost") and the cursor in one
  transaction, and refuses a page that does not start where the feed stopped.
  The merge is `internal.merge_lead_rows`, which `import_leads` calls too, so a
  sheet and the feed cannot drift apart; `internal` is not a schema the API
  serves. Only new leads travel: an edit or a "Not a lead" in GoPost afterwards
  does not reach here. `gopostIntake.itest.ts` uses its own feed row and
  sources, never `gopost`'s.

## Commands

```
npm run dev                                  npm run build:check
npm run lint          npm run typecheck      npm test
npm run test:integration                     npm run items:lint
npm run db:verify     npm run db:verify-rls -- <email> <password>
npm run db:probe [-- <name>]                 (rollback-only SQL probes, safe on production)
npm run items:seed                   npm run items:seed -- --live --file <batch.json>
npm run items:hindi -- --stamp|--sheet|--file <batch>   (Hindi: fill source, review sheet, load)
npm run staff:add -- <email> <password> <telecaller|counsellor|superadmin|teacher> <org-slug> ["Full Name"]
npm run staff:list    npm run staff:org -- <email> <org-slug>    npm run staff:rm -- <email>
npm run issue -- "Name" 9876543210 <8|9|10|11|12>
npm run parent-pack                          (syllabus + sample paper PDFs, one per class)
npm run hiring:import [-- <subject>]         (PYQ Vault → content/hiring/<subject>.json; reads its public API)
npm run hiring:seed  [-- --live --file <subject>]   (load the hiring bank; --live promotes one reviewed subject)
npm run leads:gopost [-- --dry-run]          (GoPost's leads by hand, from where the feed stopped; counts only)
```

Before/after screenshot sheets go in `screenshots/<date>-<topic>/` at the project root (the
user's standing preference, 2026-10-11): the combined sheet(s) at the top, single shots in
`shots/`. The folder is git-ignored; never point the user at a temp directory instead.

Day-to-day staff management is the `/staff` page; the `staff:*` scripts are the
break-glass path and the only way to create the first superadmin.

Migrations are applied deliberately, never by a deploy — dry run first, then apply:
`npx supabase db push [--dry-run] --db-url "postgresql://postgres.<ref>:<pw>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"`
That is the IPv4 session pooler. The direct host `db.<ref>.supabase.co` is
IPv6-only; from this machine its lookup fails intermittently and, by address,
the connection is refused (2026-10-01).

## Traps

- **`git add` stops at one bad path, and a chained commit takes what was staged.**
  Naming a file already staged for deletion failed the add; the next
  `add && commit` swept that deletion into a docs commit and pushed a build that
  could not compile (df69aab, 2026-10-12; production stayed on the last good
  deploy). Run `git status` before each commit, never `add … && commit` blind.

- **Class order does not settle a Tailwind conflict; the stylesheet does.**
  `cx(input, 'border-rose-400')` stayed grey, because `border-slate-300` is
  emitted later. Override a shared style with a variant (`aria-[invalid=true]:…`)
  or change the shared style, never by appending a rival class.

- **Never run `next build` while `next dev` is live.** It overwrites the
  `.next` the dev server serves from; every asset 404s with nothing explaining
  why. `npm run build:check` writes to `.next-verify`.
- **The two database probes skip (exit 2) when real leads exist.** They write
  rows. Development tools, not a production health check — and production always
  has leads now, so `db:verify` proves nothing there. A rule that needs rows the
  real data cannot supply goes in `supabase/probes/` (`npm run db:probe`): one
  `DO` block that always ends by raising, so everything it wrote rolls back and
  no other session ever sees it.
- **`db:verify` runs as service role and proves nothing about RLS.** That is
  what `db:verify-rls` is for — it signs in as a real staff member.
- **`.vercel link` appends `.env*` to `.gitignore`**, which would untrack
  `.env.example`. A `!.env.example` negation guards it.
- **A headless check that clicks before React hydrates tests nothing.** Twice the scan page's
  camera button and the login form were clicked while `next dev` was still compiling: the form
  submitted natively (`GET /login?`) and the button had no handler, which read as app bugs. Wait
  for `__reactProps` on the element before driving it.
- **Check exit codes, not pipe output.** `cmd | tail && echo $?` reports
  `tail`'s status. This hid a red lint through one commit.
- **Do not infer that an integration is absent from having used a manual path.**
  CLAUDE.md claimed for a day that Git deploys were not connected, because
  `npx vercel --prod` had been used and no one checked. The project was created
  by importing the repo (DEPLOY.md step 3), which connects Git by definition.
  `gh api repos/<repo>/deployments` settles it in one call.
- **A push is not a deploy.** From 09-27 Vercel blocked every production
  deploy (`TEAM_ACCESS_REQUIRED`: commit author not a team member) while notes
  recorded each push as shipped; production sat on 09-23 code that migration
  0011 had broken. After every push, check the deployment's state:
  `gh api repos/lwspune/admissions-ai/commits/<sha>/status` must say
  "Deployment has completed", not "Deployment was blocked".
- **A route the middleware protects is a route that never runs for a cron.**
  A scheduled request carries no session, so `/api/cron/*` had to join the
  PUBLIC list or the purge would have been redirected to `/login` forever,
  emitting 307s nobody reads. Anything on that list guards itself.
- **An upsert rewrites every column it names.** `items:seed` used to send
  `status` unconditionally, so a plain re-seed demoted the entire live bank to
  `review` and left nothing drawable — visible only later, as staff unable to
  issue a paper. Seeding now preserves an existing status; only
  `--live --file <batch>` promotes.
- **Promoting items can turn the integration suite red.** It runs against the
  production pool, so its expectations follow the content: once every class
  had syllabus items, twelve tests still expected a 15-question paper, and the
  suite sat red unnoticed from one promotion to the next. Run
  `npm run test:integration` after every `items:seed -- --live`.
- **`staff:rm` fails for anyone who has issued a test** (`assessments.issued_by`
  has no `on delete` rule; see the backfill ledger). When cleaning up a
  temporary staff account, delete its test leads (which cascade to their
  papers) first, then the account.
- **Narrowing who can see rows silently breaks every "does this exist?" check.**
  Once telecallers could not see each other's leads, the add form's duplicate
  check — a `select` by mobile — would have found nothing and created the
  duplicate it exists to prevent. Existence checks across a visibility
  boundary go through a SECURITY DEFINER function that returns a count and
  nothing else (`leads_on_mobile`). When narrowing a policy, list every
  caller that *counts* rows, not only those that read them.
- **A read stops at 1,000 rows, and an `in` filter stops at a few kilobytes of URL.**
  Supabase returns at most 1,000 rows per request whatever the query asks, and
  PostgREST puts `in(…)` in the URL: 1,000 ids was a 400. Both were silent
  until the GoPost import put 2,604 leads in the table; the purge would have
  failed every night from October 2027 (fixed 2026-10-26). Any read that can
  pass 1,000 rows pages with `.range()` and a unique tie-breaker in `.order()`;
  any `in` over a list that grows goes in chunks (100 uuids, 200 mobiles).
- **An error code can turn a refusal into a 30-second hang.** `supabase-js`
  retries a 503 or 520 with backoff for about half a minute, and PostgREST
  answers some SQLSTATEs with a 503: `serialization_failure` did, so a feed page
  refused for a stale cursor timed the test out instead of failing (0025, the
  same day). Raise a refusal with the default code (P0001, a 400) or a 4xx one.
- **A quiet feed and a broken one look the same.** GoPost answered `limit=500` with an
  empty page past its 2,579th lead, and the hourly sync logged "0 new, no error" while
  2,171 leads waited (2026-10-26). Asking for 200 broke the same way on 10-28, with 27 waiting,
  while 50 and 150 worked: it is GoPost's, size-dependent, and no page size is safe. So the sync
  asks for 50, checks every empty page with a one-lead ask, and on a hidden lead reads on in
  pages of 25 (`narrowed=true` in the log); if 25 hides them too it records an error, which
  /leads shows. When the sync says nothing is new, still check GoPost's count against ours.

## Decisions

### 2026-10

- **2026-10-28 — Orgs: LWS Pune and LWS Delhi, each seeing only its own.** The user asked for a
  teacher to see every applicant in their org, and said the project was meant to be multi-org;
  nothing recorded that, and the app had no org anywhere. Their calls, on my recommendations: full
  orgs rather than only opening hiring; an org is an LWS branch; superadmin sees every org; the
  question banks and lead source names stay shared; Amit Mishra (counsellor) goes to LWS Delhi and
  loses sight of Pune's leads. Everything before is Pune's, GoPost's feed included. Step 1
  (migration 0030) is the data and the rules; accounts were given their org before it ran, so no
  one saw an empty list. By my choice: the org is read from the JWT like the role, falling back to
  the account for an older token; a superadmin's new account and import go to their own org until
  step 2 adds the screens (an org on `/staff`, a badge and filter on `/leads` and `/hiring`, an org
  choice when superadmin adds or imports). Teachers now see "by …" on each applicant too.

- **2026-10-28 — GoPost's feed hid leads again; the sync now checks an empty page.** The user
  saw no new leads. Since 26 Oct 17:29 UTC every hourly run had read "0 new, no error" while
  27 waited: GoPost answered our 200-lead page empty (100 too; 50, 75, 150 whole). On the
  user's yes, not a smaller number again but a check: see the trap. Dry-run against the live
  feed found all 27, and with 200 put back first it fell back to 25 and found them too.
  The cause is in GoPost's `admissions_leads_after` and is GoPost's to fix.

- **2026-10-28 — Download for Excel takes the ticked leads too.** The user asked for it. Their
  call, on my options: only as a first item in the Download for Excel menu ("Selected leads
  (n)"), not also on the dark bar. By my choice: a selected download records nothing, so it
  never moves the "new since your last download" point, and the selection moved up to the page
  (remembering the view it was made on) so the menu can see it. The same change made the menu
  open from the left on phones, where it had run off the screen. Checked live data locally:
  two ticked In EIS leads came out as exactly those two, and the point stayed put.

- **2026-10-28 — Ticked leads move stage together.** The user asked for a bulk move. Their calls,
  on my recommendations: only the ticked leads (no "move all matching the filters", which would
  copy the filters' logic into a large write that is hard to undo), counsellors and superadmin
  only like assigning, and "Move to" beside "Assign to" on the dark bar, with a confirm. The same
  change fixed the bar's Assign button, which was white on white and showed no word (the Tailwind
  trap), and ended selections surviving a switch of stage or page. Bulk assign still sends its ids
  in the URL: in the backfill ledger.

- **2026-10-27 — Leads filter by enquiry date.** The user asked for a date filter on New leads.
  Their calls: the enquiry date (`enquired_on`, what each row shows), not the day a lead reached
  the app, which is one import morning for every GoPost lead; and From/To boxes without preset
  buttons, to add if the same range keeps being typed. It sits in `filtered()`, so like source and
  interest it narrows every stage's count, the list and the download. Checked live data locally:
  20–26 Oct is 75 of 4,727 New leads.

- **2026-10-26 — GoPost's NDA age calculator leads came in too, all of them.** The user asked
  whether the sync worked; it had imported nothing since morning, because GoPost's feed answered
  our 500-lead page with an empty one (see Traps). Ours asks for 200 now, and on the user's "go all"
  the 2,171 waiting were imported by hand as New and unassigned: 2,159 from the age calculator
  (mostly aspirants from across India, some junk names), 10 popup form, 2 WhatsApp. New went to
  4,727. Three near-identical "Satvik" entries that look like tests came in with them.

- **2026-10-26 — Leads download for Excel, as in GoPost.** The user asked for it, pointing at
  GoPost's logic: all, or new since your last download. Their calls: both follow the stage and
  filters on screen, and only counsellors and superadmin may download (a file of every number
  walks out easily). The point is per person and per stage. Checked with a real download of all
  2,556 New leads (the 1,000-row cap paged past). Same evening, also on the user's word: 14 leads
  matching the institute's student list (student or guardian number) went to Not interested.

- **2026-10-26 — Leads show and sort by when they enquired.** The user asked for the date, to
  prioritise. created_at is the import morning for all 2,577 GoPost leads, so each row shows
  "Enquired 25 Oct" (the source's date) or "Added 22 Oct" (typed in), and every stage lists newest
  first; the user chose the latest enquiry over the first when a lead has several. 44 had enquired
  in the week before, against about 2,100 from April–May. The new order put a lead named
  "🕊️vicky…" on page 1 and exposed a hydration mismatch in `Avatar`: `word[0]` is half an emoji.
  Initials now take the first letter or digit (`src/lib/initials.ts`). Same day: the 26 tested leads
  went to Contacted, and 8 "written cleared" numbers to Not interested with a note, on the user's
  word, so a GoPost re-send cannot bring them back as New.

- **2026-10-26 — Leads are a pipeline, not a filtered list.** The user's calls: stages New
  leads → CNR → Contacted → In EIS → Not interested ("In EIS is Qualified itself", so Qualified
  went, migration 0026, with no lead in it), not a stage filter; buttons on each lead move it,
  both ways; the lead's own page lost its Stage dropdown, so the pipeline is the one place a stage
  changes; search, the source filter, assigning and the Issue link stay. The first version, five
  columns side by side, shipped the same afternoon and the user rejected it on sight: cramped,
  tall cards and four empty columns beside one long one. What they wanted: the stages as a
  clickable bar, and the chosen stage's leads across the whole page. So a chevron bar with every
  stage's count, the chosen stage below as full-width rows, 50 a page; on each row a one-click
  next step (New and CNR → Contacted, Contacted → In EIS; the user agreed these), a ⋯ menu for the
  rest, and Issue link greyed out with its reason on hover. By my choice: the interest and
  telecaller filters kept (never offered for removal) behind "More filters", the import note off
  the row (it is in the history), and `/leads` at full width. The homepage mock's "Qualified"
  badge became "In EIS". The lesson: for a layout, show a mock-up before building, and judge the
  result as the user will see it, not only that it works.

- **2026-10-26 — GoPost's leads come here every hour, as New.** The user's calls: every lead
  GoPost holds for LWS Pune with an Indian mobile, whatever the course (CDS and AFCAT
  included); consent is implied, since the parent answered the ad and shared the number to be
  contacted; GoPost's class goes in the note as written ("12th passed"), never as the admitting
  class; assignment comes later, so the leads arrive unassigned and only counsellors and
  superadmin see them until someone assigns them. GoPost serves a feed, this app reads it
  (the way GoPost reads PYQ Vault), so neither holds a key to the other's database and a run
  that fails just waits for the next. Each GoPost channel is its own source. The dry run before
  the first import: 2,579 leads, 2,577 new, 2 already here, no siblings. GoPost's deploys had
  been blocked since 26 Oct 00:54 (its Vercel team, `fable-island`); the user cleared it.

- **2026-10-26 — Leads arrive New; the test goes out from Contacted.** The user's flow, ahead of
  GoPost's leads arriving here: imported leads are New, someone speaks to the family, and the link
  is issued from Contacted. A counsellor's hand-added lead goes straight to Contacted. By my
  choice, issuing moves the stage rather than requiring it (a refusal would add a click and
  nothing else), anyone's hand-added lead counts, not only a counsellor's, and the 26 leads already
  at New with a test are left for the backfill ledger. Next: GoPost's leads, hourly, as New, with
  assignment later.

- **2026-10-24 — Hiring gets a decision, notes and a resume, and its applicants are kept for good.**
  The user's calls: six decisions (in progress, shortlisted, on hold, hired, rejected, withdrawn),
  hired and rejected set by superadmin only, PDF and Word resumes, no lock on a decided applicant,
  and no purge of applicants at all, because past applicants inform future hiring. That reverses
  the 12-month purge of 2026-10-19, which had not yet deleted anyone. Staff upload resumes;
  applicant self-upload on the test link was left out, because it would be the first upload open
  without a session. HIRING_TEST_SPEC.md, step 4.

- **2026-10-19 — A screening test for teacher applicants, built here beside admissions.** The
  user's calls: hiring screens applicants before anyone calls them, many are out of station, and
  copying is acceptable because the interview grills them. Fifteen moderate real-exam questions in
  20–25 minutes — maths from NDA, physics and chemistry from MHT-CET, three typed answers from JEE
  Mains, English from CDS — and no two applicants get the same set. A new teacher role issues it
  and sees only the applicants they added. Built in Admissions AI rather than as unlisted PYQ Vault
  mocks (which were offered), as its own tables. Step 1 (2026-10-19): the bank — 1,050 questions
  imported from PYQ Vault's public API, seeded at review, shown at `/hiring/questions`. v1 leaves
  out figures, tables, shared stems and English passages; every pool still had hundreds to spare.
  KaTeX 0.16.45 (PYQ Vault's version) is the one new package: the questions are LaTeX.
  Step 2 (same day): the test itself, at `/h/<token>`, on migrations 0021–0022. By my choice, not
  yet the user's: the clock does not pause (copying is accepted, so the pause machinery buys
  nothing), starting re-checks the number, and a started paper keeps its full time whatever the
  24-hour window says. The browser check found a stale page load writing "opened" over a submitted
  test; the state now only moves forward (0022), and the same race in the admissions test is in
  the backfill ledger.
  Step 3 (same day): the teacher role, `/hiring` and `/hiring/[id]`, and the purge. Teacher
  accounts wait until the branch ships: the live code before it shows one as "No role".

- **2026-10-16 — Scanning paper tests: a live viewfinder, a photo fallback, the photo kept.** The
  user's calls: the live camera scanner as well as a photo per sheet, a saved scan is final like a
  submitted online test, and the sheet photo is kept 12 months. The reader is nda-tracker's
  (validated on real phone photos there) in TypeScript; this sheet is read in two steps — the
  printed paper code first, from the frame every paper shares, then that paper's answers — and
  both ways up, accepting only the one whose code reads cleanly. Checked on a photo of the real
  PDF with pen marks, perspective and shadow (all 30 answers exact, every planted double mark and
  part-filled bubble flagged) and through Edge's fake camera; a real phone and a real printer are
  still the user's to try. The printed layout did not change, since a sheet was already printed.

- **2026-10-16 — Paper tests, for candidates who sit the test at the institute.** The
  user's call: some candidates come in, so a counsellor or superadmin can issue the test on
  paper — the same frozen draw, class rule, shape and three-issue cap — print the question paper
  from the browser and download an OMR answer sheet. Scanning the filled sheet comes next; until
  it ships a paper test has no score. A paper test stays open three days for the scan, has no
  working link, and its six-digit number is printed and pre-bubbled on the sheet. The sheet is
  ported from nda-tracker's OMR layout but fixed for every paper: 2.5 mm bubbles, 30 rows, 18
  numeric boxes (four digits, a printed point, two decimals), because 20,000 simulated draws per
  class gave 4–7 numeric questions typically and never more than 15, and a paper-test draw is
  redrawn past 18. jsPDF (4.2.1, as nda-tracker) draws the sheet in exact millimetres, loaded
  only on download; the question paper is browser print, which handles Hindi. Telecallers see
  neither button: printing shows every question.

- **2026-10-11 — A public homepage, to gauge interest from other institutes.**
  The user's call, before deciding anything commercial: an animated tour of the
  test, report, leads and admin screens, and a contact form whose messages
  superadmin reads on `/messages`, with an unread count in the nav. The product is
  named "Aptitude Test", with no institute name. Search engines may index `/`,
  nothing else. The form asks name, phone, email and message (a phone or an email
  is enough), and messages are never deleted. The tour is mock-ups, not
  screenshots, so it does not go stale. A visitor who asks for less motion gets
  still, finished frames; everyone else gets a pause button. The first version
  had a hero, a four-screen tour and feature cards; the user cut it the same
  night to one line ("Aptitude testing and lead management for education
  institutes"), one animation, and "Get in touch" opening the form. The next day
  the animation went from the admin screen alone to all four screens cycling in
  one frame, with dots in place of tabs.

- **2026-10-11 — The address is `aptitudetestai.vercel.app`.** The user's pick;
  `aptitudetest.vercel.app` belongs to someone else's aptitude site. Added as a
  project domain beside `admissions-ai-omega.vercel.app`, which stays attached
  because links and PDFs already sent on WhatsApp point at it. Only production
  `NEXT_PUBLIC_APP_URL` changed, then a rebuild (`NEXT_PUBLIC_` is baked in at
  build time, so changing the variable alone does nothing). Checked live: a link issued from a
  lead page, its syllabus PDF and the WhatsApp text all carry the new address,
  and it opens signed out on phone and desktop. Still a `vercel.app` link, so the
  custom-domain item in SUGGESTIONS stays open. Later the same day, at the user's
  request, the old domain became a 308 redirect to the new one (a Vercel domain
  setting, path and query kept), switched on while no test was open: a page
  loaded from the old host would have its answer saves redirected cross-origin.
  Staff signed in on the old host sign in again, since the session cookie is per host.
- **2026-10-11 — Maths and science in Hindi, by a switch; English stays English.**
  The user's call: Hindi only, a switch that starts in English, they review every batch, and the
  parent PDFs get Hindi editions too. A translated English question would test something else, so
  English is never translated. The switch shows only on a fully translated paper. Translations are
  drafted in `content/items/hi/` against NCERT's Hindi-medium terms and loaded batch by batch on
  the user's sign-off (migration 0016). A bad translation found later is corrected only when no test
  holding it is open, or retired and replaced if it changed the meaning; a retired item is never
  drawn again but stays on papers already issued. The switch and each answer's language are
  recorded and shown to staff, unscored. The parent PDFs got Hindi editions too (`-hi.pdf`, sent
  from `/downloads`; the issue message keeps the English one), with chapter titles read from
  NCERT's own Hindi-medium PDFs, not translated: study sites had several wrong.
- **2026-10-11 — The test link opens on the number check; consent is the call.**
  The user's call: four screens before the first question was friction, and
  consent is already taken on the recorded call. The consent and handover
  screens are gone; the link is two steps, number then instructions, and the
  instructions name who should answer (the handover's one job). This reverses
  the 2026-09-22 reasoning that the on-screen consent was the DPDP verifiable
  consent, so the call must now carry what the screen said: what is recorded,
  12 months, and that a score summary may be sent to the parent.
- **2026-10-11 — One look across the app.** Inter, an indigo accent taken from
  the parent sheet, white cards on a tinted page, a shared staff frame, and
  shared components in `src/components/`. Locked to light: the root declared
  "light dark" while every colour was written for light, so a dark-mode phone
  got dark grey inputs on a white page. Low-contrast `slate-400` text went with
  it. No institute name on candidate screens, as on the parent sheet.

- **2026-10-07 — A link stays open three hours, not two.** The user's call.
  The window is the time to start, not to take, the test; with the 30-minute
  paper two hours left about ninety minutes to hand the phone over. Only the
  column default changed (migration 0015; `issue_assessment` inserts without
  `expires_at`), so links issued before keep two hours. The message, the
  expired-link notice, the parent PDFs and the spec say three.
- **2026-10-07 — The parent PDFs are on the site, and go out with the test
  link.** Staff had no way to get them from the app. They now build into
  `public/parent-pack/`, open without a login (a parent has no session; the
  files hold no candidate data or bank item), with `X-Robots-Tag: noindex`.
  The issue message adds the admitting class's PDF after the test link, which
  stays first because WhatsApp previews the first link; `/downloads` lists all
  five for every staff role, for sending before a test too. Message wording
  lives in `src/lib/parentPack.ts`, tested.
- **2026-10-07 — English is language; logic puzzles left it.** The user spotted
  a row-counting question and a syllogism labelled English on the parent sheet.
  Syllogisms, seating and ranking, and family relations had been filed under
  English as "logical deduction" (15 of 38 items were puzzles), though the spec's
  English list never named them. By the user's choice seven live items were
  retired and replaced with language questions at the same levels
  (`english-batch-02`), and nine parent samples rewritten; analogies, odd one
  out, series and codes stay, as the spec names them. Retired, not edited or
  deleted: papers that drew them still show them. A file may now say
  `"status": "retired"`, which the seed honours even inside a promoted batch,
  and `items:lint` refuses the puzzle skills in English. Two of the seven were
  written the same day in `basics-batch-01`, following the existing pattern
  instead of the spec; the README now says to check English against it.
- **2026-10-07 — Parent sheets print bare lists.** Basics as four numbered
  lists of broad topic names (science grouped into six), the syllabus part as
  numbered chapter names; no class, book, chapter number or intro. Parents
  asked about the details more than they used them. The build still checks
  every topic and chapter against the books the child used.
- **2026-10-06 — The paper grows to 30 questions, half of maths and science
  from the class N−1 syllabus.** The user's call, after the parent pack: 10
  English, 10 maths, 10 science in 30 minutes. English is all basics (6/2/2);
  maths and science are 5 basics (3/1/1) and 5 syllabus (3/1/1), the syllabus
  part from exactly class N−1's first-term NCERT chapters (*Ganita Prakash*
  Part 1 is literally the first term); class 11 science is physics and
  chemistry. All 30 are interleaved, each labelled "Basics" or "Class N−1"; the
  user preferred that to two titled parts. A class keeps the 15-question paper
  until its syllabus batch is signed off and live, so nothing broke while the
  questions are written; the reports split each subject's score by part only
  on a paper that has both. The v1 spec said 15; it now says either. By the
  end of 2026-10-07 all five batches (content classes 7–11) were signed off and
  live, so every admitting class is on 30; *Curiosity* 7's Adolescence chapter
  was left out by choice. The integration suite issues a 15-question paper by
  hand, since the draw no longer produces one.
- **2026-10-06 — "Taught in" means the NCERT book this year's admits used,
  and nine items were retagged for it.** Mapping the syllabus to chapters found
  NCERT's new books (classes 6–8 by 2025–26, 9 in 2026–27) teach percentages,
  profit and loss, interest, ratio, food chains and floating in class 8 and
  probability in class 9, while the bank said 6–8. A CBSE class 8 admit could be
  asked percentages they had never been taught. With the user's go-ahead eight
  items went to 8 and one to 9, seeded to production; the later class is the
  fair direction for State Board admits too. On 2026-10-07 the same reasoning
  moved averages (4 items) to 8 and the speed of sound (1) to 9, also with the
  user's go-ahead; class 8 difficult maths fell to 2 items, and `basics-batch-01`
  took it to 7 the same day.
- **2026-10-06 — Parents get a class-wise syllabus and sample paper, written
  apart from the bank.** One PDF per admitting class: format, what the paper
  draws on, a sample paper of the real shape, answers with working (where they
  live and how bare they print: the 2026-10-07 entries above). The user chose
  five papers, no institute name, no word on calculators, and the April 2027
  joiners as the cohort; chapters are checked in the edition each child used. Samples are new questions, never bank items: a bank
  item on a sample is on real papers with its answer published. A topic's class
  is read from the bank's tags at build time, and the build refuses a skill the
  syllabus does not map. A class 12 sheet lists the same topics as class 11,
  because no item is tagged 11.
- **2026-10-06 — Answer keys are balanced across A–D, at authoring time.**
  Options are served in the order they were written, and 73% of keys were A
  (science 27 of 28), so answering A to everything scored about 9 of 15. 43
  items had the key swapped with one distractor, explanation letters swapped
  to match; "None of the above"-style options and numbers listed in order
  stayed put. Shuffling options per paper was not chosen: a stored answer is a
  letter, so a per-paper order would have to be frozen with the paper. The five
  production attempts were remapped to the same option text and regraded to
  their stored scores. `items:lint` now refuses a subject with over 40% of its
  keys on one letter (`keySkew`).
- **2026-10-06 — Parents may be sent the score, never the questions.**
  Students asked for a report. The sheet (`/reports/[leadId]/summary`, saved
  as PDF from the browser and sent on WhatsApp) shows the score, per-subject
  scores and counts, date and time used; the user cut class, institute name,
  logo, subject descriptions and any note. The consent screen previously said
  the result is not shown to the candidate; it now says a summary may be sent
  to the parent. Earlier candidates consented to the old wording — sending
  theirs is the user's call. The lead list now offers Issue link / Reissue /
  Report on each row, so issuing needs no click into the lead.

- **2026-10-01 — Class 8 admits added; the rule did not change.** An admit
  to class 8 draws content taught up to class 7: 71 of 105 items, every
  stratum fillable. The cost is exposure in the thin cells — maths/difficult
  has 4 items (each on ~1 paper in 4, against ~1 in 12 for class 9) and
  science/difficult 3, which three issues to one candidate exactly exhaust.
  More difficult maths at `taught_in` ≤ 7 is the remedy, not a different
  rule (done 2026-10-07: 7 items). Scores across classes were never comparable and still are not; the
  app sets no cut-off.

Keep this log to roughly the last two weeks. Older entries are in
[DECISIONS_HISTORY.md](DECISIONS_HISTORY.md) (batch 1: 2026-09, archived 2026-10-07);
everything **2026-10-01 onward** stays here.
