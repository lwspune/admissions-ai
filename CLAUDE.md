# Admissions AI

Gate 2 of an NDA coaching institute's admissions funnel: a 15-question,
15-minute reasoning test. Staff issue it per candidate, the link goes to the
**parent's** WhatsApp, the candidate takes it within two hours, it grades
itself server-side.

| Doc | For |
|---|---|
| [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) | What it does and why. The v1 contract |
| [SUGGESTIONS.md](SUGGESTIONS.md) | Open items, traps, what is unverified |
| [BRAINSTORM.md](BRAINSTORM.md) | The wider funnel this sits inside |
| [DEPLOY.md](DEPLOY.md) | Deployment and credential rotation |

**Live:** https://admissions-ai-omega.vercel.app · repo `lwspune/admissions-ai` (private)
Supabase project `ohcvimrxaeeqbmnucbcn` · Vercel team `apj-school`.

**Git integration is connected: a push to `main` deploys to production.** Other
branches get a preview deployment, which Vercel's own login protects, so a
preview is not a second open copy of the system. `npx vercel --prod` still
works as a manual path. Migrations are never part of a deploy (see below), so a
push ships code against whatever schema is already live — **and the reverse
bites too**: applying a migration while its code sits on a branch leaves
production running against a schema it does not know about. Ship them close
together, schema first only when the old code tolerates it.

`vercel.json` registers one cron: `/api/cron/purge`, daily at 03:00 UTC.
Hobby caps cron frequency at once per day.

---

## Architecture

Next.js App Router + TypeScript + Supabase. Three layers, deliberately separated:

**`src/lib/` — pure.** Plain data in, plain data out, no IO. This is where the
logic worth testing lives, which is why it tests without a database.
`grade` · `timer` (active-time accounting) · `assemble` (the 3/1/1 draw) ·
`serialize` (**the security boundary**) · `report` · `items` (seed-status rules) ·
`retention` (the 12-month rule) · `mobile` · `token` · `ip` · `types`

**`src/server/` — service layer.** Marked `server-only`, which turns "imported
into a client bundle" into a build error. `supabase` (service-role client) ·
`auth` (session-bound client) · `assessments` (issue) · `items` (the bank) · `attempt` (open,
identify, start, save, record, submit) · `report` · `retention` (the purge)

**`src/app/`** — `t/[token]/` and `api/cron/` are the only unauthenticated routes;
the latter guards itself with `CRON_SECRET`. `api/t/*` are
thin wrappers over `src/server`. `leads/`, `login/`, `reports/[leadId]/`, `items/` (superadmin only) are staff, guarded by
`src/middleware.ts`.

**Two clients, never interchangeable.** Staff paths use the session-bound
client so **RLS** decides access; the candidate API uses service role because
it has no session to act for. A staff feature reaching for service role is a
bug — it moves the access rule out of the database and into an `if`.

## Invariants

These are the things that quietly break everything if violated.

- **The answer key never reaches the client.** `toCandidatePaper` is an
  ALLOW-LIST, not a delete-list — a column added to `test_items` later must not
  silently start shipping. Its tests assert on serialized bytes, since a
  property check is defeated by nesting.
- **Constraints and triggers enforce, not application code.** The reissue cap,
  the MCQ/numeric item shape, answer idempotency, and the assessment state
  machine all live in Postgres. `npm run db:verify` proves the database
  actually rejects what it claims to.
- **Roles live in `app_metadata`, never `user_metadata`** — the latter is
  editable by the signed-in user. Read via `getUser()`, never `getSession()`,
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
  returns `id, subject, difficulty` and no answer — never `select` the table
  for a draw, or a newly promoted item becomes undrawable.
- **Telecallers never see question text.** `loadPaper` blanks both the stem
  and the options for that role — options alone identify an item, and
  `correctDisplay` renders "C. <option text>". This is the one access rule that
  lives in application code rather than the database, because RLS cannot mask
  columns per role. It was inert until the report gained a Question column;
  `report.itest.ts` is what stops it becoming inert again.
- **Candidate data is kept 12 months, because the consent screen says so.**
  `RETENTION_MONTHS` in `src/lib/retention.ts` and the consent text in
  `CandidateFlow` must move together. A new table holding candidate data must
  either cascade from `leads` or be added to `purgeExpired` by hand —
  `identify_attempts` has no foreign key and is the standing reminder.

## Commands

```
npm run dev                                  npm run build:check
npm run lint          npm run typecheck      npm test
npm run test:integration                     npm run items:lint
npm run db:verify     npm run db:verify-rls -- <email> <password>
npm run items:seed                   npm run items:seed -- --live --file <batch.json>
npm run staff:add -- <email> <password> <telecaller|counsellor|superadmin>
npm run staff:list    npm run staff:rm -- <email>
npm run issue -- "Name" 9876543210
```

Migrations are applied deliberately, never by a deploy:
`npx supabase db push --db-url "postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres"`

## Traps

- **Never run `next build` while `next dev` is live.** It overwrites the
  `.next` the dev server serves from; every asset 404s with nothing explaining
  why. `npm run build:check` writes to `.next-verify`.
- **The two database probes skip (exit 2) when real leads exist.** They write
  rows. Development tools, not a production health check.
- **`db:verify` runs as service role and proves nothing about RLS.** That is
  what `db:verify-rls` is for — it signs in as a real staff member.
- **`.vercel link` appends `.env*` to `.gitignore`**, which would untrack
  `.env.example`. A `!.env.example` negation guards it.
- **Check exit codes, not pipe output.** `cmd | tail && echo $?` reports
  `tail`'s status. This hid a red lint through one commit.
- **Do not infer that an integration is absent from having used a manual path.**
  CLAUDE.md claimed for a day that Git deploys were not connected, because
  `npx vercel --prod` had been used and no one checked. The project was created
  by importing the repo (DEPLOY.md step 3), which connects Git by definition.
  `gh api repos/<repo>/deployments` settles it in one call.
- **A route the middleware protects is a route that never runs for a cron.**
  A scheduled request carries no session, so `/api/cron/*` had to join the
  PUBLIC list or the purge would have been redirected to `/login` forever,
  emitting 307s nobody reads. Anything on that list guards itself.
- **An upsert rewrites every column it names.** `items:seed` used to send
  `status` unconditionally, so a plain re-seed demoted the entire live bank to
  `review` and left nothing drawable — visible only later, as staff unable to
  issue a paper. Seeding now preserves an existing status; only
  `--live --file <batch>` promotes.

## Decisions

### 2026-09

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

Keep this log to roughly the last two weeks; archive older months to
`DECISIONS_HISTORY.md`.
