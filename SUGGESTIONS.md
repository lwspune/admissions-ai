# Open items

Living checklist for Admissions_AI. Newest concerns first within each section.
Spec: [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) · Context: [BRAINSTORM.md](BRAINSTORM.md)

---

## Do before anyone real uses this

- [ ] **Rotate the Supabase `service_role` key and the database password.** Both, plus the anon key,
      were pasted into a chat transcript on 2026-09-22. The anon key is public by design; the other two
      are not. Settings → API → Reset, then update `.env.local`.
- [ ] **Change the seeded staff password.** `admin@lwspune.test` was created with a known password
      that is also in that transcript. `npm run staff:list` shows accounts and flags any with no role.
- [ ] **Check the database password is not reused elsewhere.** It looks like it may be shared with
      other institute systems. This database should have its own.
- [ ] **Take the test on a real Android phone over mobile data.** The 4-inch / Android 8 / 3G case is
      exactly where per-question save and the pausing timer earn their keep, and it has never been
      exercised. Background the tab mid-question, return, submit.
- [ ] **Exercise the staff console buttons in a browser.** `createLead` and `issueForLead` are verified
      only through their data path (the RLS probe). React server actions cannot be driven from curl, so
      the form submissions themselves are untested.
- [ ] Private GitHub repo + Vercel project. Nothing is pushed yet. Per-environment env vars, previews
      pointed at a separate staging Supabase project — see spec §11 for the trap.

## Known gaps

- [ ] **The report does not exist.** Scores are graded and stored, and nothing displays them. This is
      the next build item and the thing that makes any of it readable to a counsellor.
- [ ] **The bank holds 15 items, not 300.** Every candidate currently gets the same paper, and a
      reissue repeats questions by design (exclusion falls back rather than failing). Authoring the
      other 285 is the bulk of the remaining work.
- [ ] **No visual design pass.** The candidate screens are unstyled-but-correct. Parents will see the
      consent screen while deciding whether the institute looks competent.
- [ ] **The pause signal has not been triggered by a real tab switch.** `changed_after_pause` is
      verified by posting pause/resume events directly; the `visibilitychange` wiring that emits them
      is written but unexercised in a browser.
- [ ] No cohort analytics, no per-issuer pass rates, no 12-month purge job. All specced, none built.

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
- **Files are CRLF.** There is no `.gitattributes`, so git normalises line endings and exact-text
  patching of committed files fails in confusing ways.
- **`verify-schema` runs as service role and therefore proves nothing about RLS.** That is what
  `verify-rls` is for — it signs in as a real staff member.

## The gate

```
npm run lint          npm run test              npm run items:lint
npm run typecheck     npm run test:integration  npm run build:check
npm run db:verify     npm run db:verify-rls -- <email> <password>
```
