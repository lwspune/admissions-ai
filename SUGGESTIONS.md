# Open items

Living checklist for Admissions_AI. Newest concerns first within each section.
Spec: [APTITUDE_TEST_SPEC.md](APTITUDE_TEST_SPEC.md) · Context: [BRAINSTORM.md](BRAINSTORM.md)

---

## Do before anyone real uses this

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
- [ ] **Look at `/items` and the report's new Question column in a browser.** Both shipped
      2026-09-22 and neither has been seen by a human. `/items` needs a superadmin session, so it
      cannot be checked from a script — unauthenticated it redirects to `/login?next=%2Fitems`,
      which is all that has been proved.
- [x] ~~Private GitHub repo + Vercel project.~~ **DONE 2026-09-22** — `lwspune/admissions-ai`
      (private, verified by a 404 to anonymous requests) deployed to
      https://admissions-ai-omega.vercel.app. Production env vars set; Preview left unset so
      previews fail loudly rather than becoming a second copy of the live system.

## Known gaps

- [x] ~~**Vercel Git integration is not connected.**~~ **WRONG — it is, and always was.**
      Corrected 2026-09-22: pushing branch `items/legacy-iq-2025-port` produced Preview deployment
      `6593653103` for that exact commit, and `main` commits `881bd48` / `e68f42e` / `fe36391` each
      have a `vercel[bot]` Production deployment. **A push to `main` deploys to production.**
      Previews sit behind Vercel's own login, so they are not a second open copy. The earlier
      claim came from assuming the manual `npx vercel --prod` runs were the only mechanism.
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
      against a 60/20/20 target per subject). Verified against the database, not the JSON files.
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
