# Admissions AI

Aptitude screening for NDA coaching admissions. Staff issue a 15-question,
15-minute reasoning test to a candidate; the parent receives the link on
WhatsApp, the candidate takes it within two hours, and it grades itself.

- [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) — what it does and why
- [SUGGESTIONS.md](SUGGESTIONS.md) — open items, traps, the gate
- [BRAINSTORM.md](BRAINSTORM.md) — the wider admissions funnel this sits in

**Handles minors' personal data. This repository must stay private.**

---

## Running locally

```bash
npm install
cp .env.example .env.local   # then fill it in — see below
npm run dev
```

`.env.local` needs the Supabase project URL, anon key and service-role key,
plus `NEXT_PUBLIC_APP_URL` and a `CRON_SECRET`. It is gitignored and must stay
that way — the service-role key bypasses every RLS policy.

Create the first staff account, since the Supabase dashboard cannot set the
role that RLS reads:

```bash
npm run staff:add -- you@example.com <password> superadmin
npm run staff:list      # flags any account with no role
```

Seed the item bank:

```bash
npm run items:seed -- --live
```

Issue a test link without the console, for local testing:

```bash
npm run issue -- "Candidate Name" 9876543210
```

## The gate

Run all of these before calling anything done.

| Command | What it covers |
|---|---|
| `npm run lint` | ESLint, including the react-hooks rules |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | 111 unit tests over the pure modules |
| `npm run test:integration` | 35 tests against a real database |
| `npm run items:lint` | Item shape, duplication, answer-length tells |
| `npm run build:check` | Production build, into `.next-verify` |
| `npm run db:verify` | Schema and constraints (empty database only) |
| `npm run db:verify-rls -- <email> <pass>` | RLS as a real staff session (empty database only) |

**Never run `next build` while `next dev` is live.** It overwrites the `.next`
directory the dev server is serving from, every asset 404s, and nothing in the
output explains why. `npm run build:check` writes to `.next-verify` instead.

The two database probes write rows, so they refuse to run against a database
holding real leads and exit 2 — a skip, not a failure. They are development
tools, not a production health check.

## Database

Migrations live in `supabase/migrations` and are applied deliberately, never by
a deploy:

```bash
npx supabase db push --db-url "postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres"
```

Rules are enforced by constraints and triggers rather than application code —
the reissue cap, the MCQ/numeric item shape, answer idempotency, and the
assessment state machine. `npm run db:verify` checks the database actually
rejects what it claims to.

## Deploying

See [DEPLOY.md](DEPLOY.md). Two things that will bite:

- **`NEXT_PUBLIC_APP_URL` must be the deployed origin.** The staff console
  builds the candidate link from it; left at localhost, every link it produces
  is unusable.
- **Vercel previews get public URLs and inherit production environment
  variables by default.** A preview would then issue live tests against real
  candidate data. Scope environment variables per environment.
