# Deploying

First deployment, start to finish. Steps marked **you** need a browser login
that cannot be done from a terminal session.

**This repository must be private.** It handles minors' personal data, and the
candidate route is public by design — only the token protects it.

---

## 1. Rotate the credentials first — **you**

Do this before deploying, not after: you will be entering fresh values into
Vercel anyway, and the current ones were pasted into a chat transcript.

1. Supabase → Settings → API → **reset the `service_role` key**.
2. Supabase → Settings → Database → **reset the database password**.
3. `npm run staff:add` a new account, then delete the seeded `admin@lwspune.test`.
4. Update `.env.local` with the new values and re-run `npm run dev` to confirm.

The anon key is public by design and does not need rotating. Every table has
RLS with no anon policy, so it can read nothing on its own — `npm run db:verify-rls`
asserts exactly that.

## 2. Create the GitHub repository — **you**

```bash
# Install the GitHub CLI once, then:
gh auth login
gh repo create admissions-ai --private --source=. --remote=origin --push
```

Or through the web: create an empty **private** repo, then

```bash
git remote add origin https://github.com/<you>/admissions-ai.git
git push -u origin main
```

Before pushing, confirm nothing sensitive is in the history:

```bash
git log -p --all -S"SUPABASE_SERVICE_ROLE_KEY=ey" --oneline    # must print nothing
git ls-files | grep -i env                                      # only .env.example
```

## 3. Create the Vercel project — **you**

Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Framework
detection picks up Next.js; no build settings need changing.

## 4. Set environment variables — **you**

In Vercel → Settings → Environment Variables. **Scope each one deliberately.**

| Variable | Production | Preview |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | production project | *leave unset* |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | production project | *leave unset* |
| `SUPABASE_SERVICE_ROLE_KEY` | production project | *leave unset* |
| `NEXT_PUBLIC_APP_URL` | `https://<your-domain>` | *leave unset* |
| `CRON_SECRET` | the value in `.env.local` | *leave unset* |
| `GOPOST_LEADS_SECRET` | the value in `.env.local`; the same as `ADMISSIONS_LEADS_SECRET` on GoPost's project (`fable-island/lws-marketing-engine`) | *leave unset* |

`CRON_SECRET` also lives in Supabase Vault as `gopost_sync_secret`, beside
`gopost_sync_url` (`https://<your-domain>/api/cron/gopost`): pg_cron sends it
on the hourly GoPost read (migration 0025). Rotating `CRON_SECRET` means
updating that Vault secret too, or the hourly read stops with a 404:
`select vault.update_secret((select id from vault.secrets where name = 'gopost_sync_secret'), '<new value>');`
Rotating `GOPOST_LEADS_SECRET` means changing both Vercel projects together.

**Why Preview is deliberately empty.** Preview deployments get public URLs and
inherit production variables by default. A preview would then be a second,
unlisted copy of the live system, issuing real tests against real candidates.
Leaving Preview unset makes previews fail loudly instead. When you want working
previews, create a **separate staging Supabase project** and point them at it —
never at production.

Also enable Vercel → Settings → Deployment Protection, so preview URLs are not
open to anyone who guesses one.

**`NEXT_PUBLIC_APP_URL` is the one people get wrong.** The staff console builds
the candidate link from it. Left at localhost, every link a telecaller sends is
dead on arrival, and nothing in the app will tell them.

## 5. Point the database at production — **you or me**

Migrations are never applied by a deploy. After the first deployment:

```bash
npx supabase db push --db-url "postgresql://postgres:<new-password>@db.<ref>.supabase.co:5432/postgres"
```

Then seed the bank and create the real staff accounts against production.

## 6. Verify the deployment — **me, once it exists**

Send me the URL and I will check:

- [ ] `/login` loads; `/leads` redirects to it when signed out
- [ ] `/t/<token>` is reachable without a session, and unknown tokens show the
      plain-language notice rather than an error
- [ ] Every CSS and JS asset returns 200 — the failure mode that bit us locally
- [ ] The start payload contains no `answer_key`, `numeric_answer`, `rationale`,
      `difficulty`, `skill` or `ref`
- [ ] A link issued from the console carries the deployed origin, not localhost
- [ ] The anon key still reads nothing (`npm run db:verify-rls` against production)
- [ ] Preview deployments fail rather than touching production data

## Afterwards

- [ ] Take the test on a real Android phone over mobile data. Still never done.
- [ ] Custom domain, if the institute has one. A link from a recognisable
      domain gets opened; a `vercel.app` link from an unknown number does not.
      Renamed to `aptitudetestai.vercel.app` on 2026-10-11 meanwhile. To move:
      add the domain to the project, set production `NEXT_PUBLIC_APP_URL`, then
      **rebuild** (`npx vercel redeploy <prod-url> --target production`); the
      variable is baked in at build time. Keep the old domain attached, as a
      308 redirect to the new one (Settings → Domains → Edit → Redirect to):
      sent messages point at it. Switch the redirect on when no test is open.
- [ ] The 12-month purge job is specced but not built. It needs a Vercel Cron
      entry once it exists — that is what `CRON_SECRET` is for.
