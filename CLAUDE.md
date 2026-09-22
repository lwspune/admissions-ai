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
Supabase project `ohcvimrxaeeqbmnucbcn`. Deploys are manual (`npx vercel --prod`);
no Git integration yet.

---

## Architecture

Next.js App Router + TypeScript + Supabase. Three layers, deliberately separated:

**`src/lib/` — pure.** Plain data in, plain data out, no IO. This is where the
logic worth testing lives, which is why it tests without a database.
`grade` · `timer` (active-time accounting) · `assemble` (the 3/1/1 draw) ·
`serialize` (**the security boundary**) · `mobile` · `token` · `ip` · `types`

**`src/server/` — service layer.** Marked `server-only`, which turns "imported
into a client bundle" into a build error. `supabase` (service-role client) ·
`auth` (session-bound client) · `assessments` (issue) · `attempt` (open,
identify, start, save, record, submit)

**`src/app/`** — `t/[token]/` is the only unauthenticated route. `api/t/*` are
thin wrappers over `src/server`. `leads/`, `login/` are staff, guarded by
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

## Commands

```
npm run dev                                  npm run build:check
npm run lint          npm run typecheck      npm test
npm run test:integration                     npm run items:lint
npm run db:verify     npm run db:verify-rls -- <email> <password>
npm run items:seed -- --live
npm run staff:add -- <email> <password> <telecaller|counsellor|superadmin>
npm run staff:list    npm run issue -- "Name" 9876543210
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
- **2026-09-22 — Staff get a narrow `assessment_items` insert policy** rather
  than the console running on service role after an application-level check.
  Keeps the access rule in the database.

Keep this log to roughly the last two weeks; archive older months to
`DECISIONS_HISTORY.md`.
