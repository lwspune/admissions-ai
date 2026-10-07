# Aptitude Screening Test — Specification (v1)

**Date:** 2026-09-22 · **Status:** Spec. Nothing built.
**Context:** [BRAINSTORM.md](BRAINSTORM.md) — this is gate 2 of the year-2 admissions funnel.
**Items:** [content/items/calibration-batch.md](content/items/calibration-batch.md) — 15 items awaiting review.

A 15-question, 15-minute reasoning test. Staff create it per candidate, WhatsApp the link to the
parent's number, the candidate takes it within 2 hours, it grades itself, staff read a report.

**Scope discipline:** v1 captures fraud signals and *shows* them. It does not score them. Anything that
needs hundreds of attempts before it means anything is parked in §12, not built.

---

## 1. Decisions

| | |
|---|---|
| Funnel | Gate 2 — after the telecaller's in-call verbal screen, for high-intent leads only |
| Issuers | Telecaller and counsellor |
| Content | Reasoning-shaped, English only, text-only. **Scoped by class:** an admit to class N (8–12) is tested on content taught up to class N−1 (added 2026-09-27; class 8 added 2026-10-01) |
| Paper | 15 questions — 5 each Maths / English / Science, interleaved. Per subject: 3 easy, 1 moderate, 1 difficult. **From 2026-10-06, 30 questions once a class's syllabus batch is live:** 10 each; English all basics (6/2/2); maths and science 5 basics (3/1/1) + 5 from class N−1's first-term NCERT syllabus (3/1/1). All interleaved, each labelled Basics or Class N−1 |
| Time | 15 minutes of active time (30 for the 30-question paper; each paper records its own). Timer pauses when the tab is hidden |
| Window | 2 hours from creation. Hard backstop — the attempt dies with the window |
| Delivery | Staff copy the link, paste into WhatsApp. **Sent to the parent's number.** No messaging API |
| Identity | Candidate enters the number the link was sent to, then a handover screen names who should answer |
| Layout | One question per screen, Prev/Next, 15-dot palette, back-navigation allowed |
| Saving | Per-question server save. Resume supported |
| Marking | +1 correct · −0.25 wrong MCQ · 0 wrong numeric · 0 skipped |
| Bank | 100 items per subject, random draw excluding items the lead has already seen |
| Cut-off | **None in the system.** Scores are reported; the bar is set by a human, outside the app |
| Fraud | Capture and display. Never block, never score |
| Reissue | Max 3 per lead. Single-use, unguessable tokens |
| Candidate sees | Consent → handover → test → "Thank you, we'll be in touch." No score on screen. Staff may later send the parent a score-only sheet (added 2026-10-06) — never questions or answers |
| Stack | Next.js (App Router) + TypeScript + Supabase, GitHub → Vercel |

**Assumptions — correct me if wrong:** staff auth is Supabase Auth with role in `app_metadata`;
retention is 12 months; numeric answers carry a per-item tolerance and no typed units.

---

## 2. Stack and layout

```
src/app/
  t/[token]/          # PUBLIC candidate test — the only unauthenticated route
  (staff)/leads/      # create lead, issue, copy link, reissue
  (staff)/reports/    # per-candidate report
  api/
src/lib/
  grade.ts            # pure — scoring
  timer.ts            # pure — active-time accounting
  assemble.ts         # pure — the 3/1/1 draw
supabase/migrations/
content/items/        # authored items, reviewed before seeding
```

The three pure modules hold all the logic worth testing. They take plain data and return plain data,
so they test without a database — that's where the TDD effort goes (§11).

---

## 3. Data model

Six tables. Constraints do the enforcing, not application `if`s.

**`leads`** — `id` · `name` · `contact_mobile` (the parent's number, where the link goes and the
identity key) · `student_mobile` NULL · `city` / `school` / `board` NULL · `class_level` smallint
CHECK ∈ 8–12, **the class being admitted to**, required to issue (migrations 0011, 0013) · `consented_at` ·
`created_by` · `created_at`.

No unique constraint on `contact_mobile` — siblings share a parent's number. Instead the create form
shows existing leads on that number and makes the user choose "open existing" or "add sibling."

**`test_items`** — `id` · `subject` CHECK ∈ (maths, english, science) · `skill` · `difficulty` CHECK ∈
(easy, moderate, difficult) · `taught_in` smallint CHECK ∈ 6–11, the class in which the content is
taught (6 = open to every admit) · `format` CHECK ∈ (mcq, numeric) · `stem` · `options` jsonb ·
`answer_key` · `numeric_answer` · `numeric_tolerance` · `rationale` NOT NULL · `status` CHECK ∈
(review, live, retired).

The draw reads `live_pool(p_class)`, which returns live items with `taught_in ≤ p_class − 1`, and
`issue_assessment` refuses a paper unless all 15 items come back from that pool for the lead's class.

A CHECK enforces the format pairing — an MCQ must have options and a key and no numeric answer; a
numeric item the reverse. `rationale` is NOT NULL because a wrong answer key is the failure that hides
for six months, and forcing the author to state why the key is right is what surfaces it at review.

**`assessments`** — `id` · `lead_id` · `token` UNIQUE (22-char random base62) · `issue_seq` CHECK
BETWEEN 1 AND 3 · `issued_by` · `created_at` · `expires_at` (= created_at + 2h) · `state` ·
`voided_by` / `voided_reason` NULL.

`UNIQUE(lead_id, issue_seq)` + the CHECK caps reissues at 3 in the database.

**`assessment_items`** — `assessment_id` · `position` 1–15 · `item_id`. PK `(assessment_id, position)`,
UNIQUE `(assessment_id, item_id)`. The paper is drawn at issue time and frozen; it must never change
under a candidate mid-attempt.

**`attempts`** — `id` · `assessment_id` UNIQUE · `started_at` · `active_ms` · `deadline_at` ·
`submitted_at` · `submit_reason` (manual / timer / window) · `score` · `correct` / `incorrect` /
`skipped` · `maths_score` / `english_score` / `science_score` · `user_agent` · `ip` · `screen`.

**`attempt_answers`** — `attempt_id` · `position` · `choice` · `numeric_value` · `active_ms` ·
`change_count` · `changed_after_pause` bool · `last_answered_at`. PK `(attempt_id, position)`, which
makes the per-question save a plain idempotent upsert.

**`attempt_events`** — `id` · `attempt_id` · `at` (server receipt time) · `kind` · `position` ·
`payload` jsonb. Append-only. Index `(attempt_id, at)`.

Item statistics are a **query over these tables**, not a table. "% correct per item" is a GROUP BY.

---

## 4. Lifecycle and timing

```
issued → opened → started → submitted
   └──────────────┴──▶ expired (2h)        superadmin ──▶ voided
```

1. The 2-hour window runs from `assessments.created_at`. Absolute, never extended.
2. An attempt **cannot start with under 15 minutes left** in the window — otherwise someone opening at
   1h58m gets a two-minute test and a meaningless score. They see "ask for a fresh link."
3. Once started: 15 minutes of active time. The timer pauses on `visibilitychange`.
4. **The window is the backstop.** The attempt ends at 15 active minutes *or* `expires_at`, whichever
   comes first. That is what keeps the pausing timer bounded.
5. `deadline_at` is **server-computed** on start and on every resume:
   `min(now + (15min − active_ms), expires_at)`. The client shows a countdown; the server decides. A
   tampered client clock buys nothing.
6. On expiry the attempt auto-submits with whatever is saved. A partial attempt is data.

**Reissue:** allowed only while nothing has been submitted. Voids the old token and draws a fresh paper
excluding items that lead has already seen. A prior abandoned attempt is kept and shown on the report.

---

## 5. Candidate flow

Public route `/t/[token]`. Mobile-first, must work on a 4-inch Android 8 screen over 3G.

| Screen | |
|---|---|
| **Consent** | Addressed to the parent, who received the link. What's collected (answers, timing, device and network info), why, kept 12 months, internal-only. "I am the parent/guardian and I consent" |
| **Identity** | "Enter the mobile number this link was sent to." Must match `contact_mobile`. Rate-limited: 5 tries per token, 20/hour per IP |
| **Handover** | "Please hand the phone to **Rohan Patil**, who should answer on their own." Naming the expectation makes breaking it a choice rather than an ambiguity |
| **Instructions** | 15 questions, 15 minutes, +1 / −0.25 on multiple-choice, no penalty on numeric, you can go back. The timer starts on Start, not on page load |
| **Test** | One question per screen. Prev / Next. 15-dot palette. Countdown. Numeric items get `inputmode="numeric"` |
| **Submit** | Palette overview, unanswered-count warning |
| **Done** | "Thank you — we'll be in touch." No score, no answers, no review — that would leak the bank to the next candidate |

Failure states each get a plain-language screen, never a raw error: link expired, already used, number
doesn't match, window closing too soon, already submitted.

**Resume** restores saved answers, palette state and server-computed remaining time. No re-consent.

---

## 6. Marking and paper draw

```
correct → +1 · wrong MCQ → −0.25 · wrong numeric → 0 · skipped → 0
```

Section scores are the same sum over each subject's 5 items. A numeric answer is correct when
`abs(given − answer) <= tolerance`. Raw score is stored; **no pass/fail is computed.**

**Draw:** per subject, pick 3 easy + 1 moderate + 1 difficult at random from `status='live'`, excluding
anything the lead saw in a prior issue. Interleave into mixed subject order. Freeze.

With 100 items per subject and 5 drawn, overlap between two candidates is already negligible — a
screenshot on WhatsApp is worth close to nothing, which is the whole point.

---

## 7. Fraud signals — capture and show

Captured as `attempt_events`, batched every 5s and on pause so telemetry never blocks answering on a
slow network. Losing events must degrade the report, never the test.

`pause` / `resume` (duration, position) · `paste` · `copy` · `blur` / `focus` · `answer_set`
(position, from, to) · `nav` · `context` (user agent, screen — re-emitted if it changes).

The report computes five facts at read time. **Nothing is stored as a score and nothing is weighted:**

- pauses: count and total duration
- **answers changed immediately after a pause** — positions listed
- paste events: count
- device changed mid-attempt: yes / no
- time used vs. time available

A counsellor reading *"3 pauses totalling 6 minutes; the answer to Q7 changed after the second one"*
knows what to do with it. A number between 0 and 10 with guessed weights behind it does not.

---

## 8. Report

**One screen, no scrolling:** name, number, date, which issue (1 of 3) · total score out of 15 ·
section bars for Maths / English / Science, each out of 5 · the five facts from §7 · time used.

**Expandable detail:** per question — subject, skill, difficulty, the candidate's answer,
correct/wrong/skipped, dwell, change count, changed-after-pause.

**Question stems are hidden from telecallers.** Staff who see the same items repeatedly can coach
them, and the incentives push exactly that way.

Counsellors additionally get: score distribution across the cohort, **pass rate by issuer** (the direct
check on a telecaller coaching answers), per-item % correct, and the funnel — issued → opened → started
→ submitted → expired. **Non-attempt is a tracked outcome, not missing data.**

---

## 9. Item bank

**Skills.** *Maths:* number series, ratio, percentage, time–work–speed, averages, number properties.
*English:* analogies, odd-one-out, sentence completion, sequencing, error identification, short-passage
inference. Not syllogisms, seating or ranking, or family-relation puzzles: they need logic, not
English, and were moved out on 2026-10-07. *Science:* applying a principle to a scenario, cause and effect, classification, experimental
reasoning, unit sense.

**Excluded:** formula recall, definitions, dates, trivia, anything a 15-second search answers, anything
needing a diagram.

**Class tag (added 2026-09-27).** Every item carries `taught_in`, the class in which its content is
taught, 6 to 11. It describes the content, not the audience: "probability is taught in class 10" is
a fact the author states; whether a class 11 admit may see it is derived by the N−1 rule, in one
place. Most reasoning items sit at the floor (6) and reach every admit; the tag bites on science and
the odd maths item. Coverage is checked per class as well as per stratum — `items:lint` refuses a
bank that cannot fill a paper for some class and warns when a class would see the same items on
every paper — because a filter splits every stratum and the class that loses is the one whose
candidate sees a failure.

**Difficulty is a target p-value** (proportion answering correctly): easy 0.75–0.90 (~60 per subject),
moderate 0.45–0.70 (~20), difficult 0.20–0.40 (~20) — mirroring consumption. Initial tiers are authored
estimates; per-item % correct reclassifies them once real attempts exist.

**Process:** I author, you review. The [15-item calibration batch](content/items/calibration-batch.md)
is written and **blocks the other 285** — getting the register wrong on item 1 and finding out at item
300 is the expensive failure. Items land as `status='review'`; you promote them to `live`. A lint before
seeding checks the key is valid, options are four and distinct, no option is conspicuously longer than
the others, and the stem is under 40 words.

Flag an item for retirement when % correct exceeds 0.95 (a free mark) or falls under 0.15 (likely
miskeyed). **Flag for a human — never auto-retire**, or one weak cohort silently guts the bank.

---

## 10. Security, compliance, accessibility

**The answer key never reaches the client.** The paper is served stripped and grading is server-side
only, enforced by a dedicated serialiser plus a test asserting the key is absent from the payload.

The token is 22 chars of `crypto.randomBytes` base62, single-use, killed on reissue. RLS on every table;
the public route goes through a service-role API with an explicit field allow-list. The service-role key
is server-side only, never in a `NEXT_PUBLIC_` var. All candidate input is validated at the API boundary.

**DPDP:** candidates are minors, a protected category. Sending the link to the parent's number puts the
consent screen on the parent's device before the child sees a question; the telecaller also takes
spoken consent on the recorded call. Consent is stored with number, timestamp and IP. Purpose-limited
to admission screening — not reused for marketing. 12-month purge, scheduled.

**Accessibility:** visible focus styles; ARIA labels on palette dots ("Question 7, answered"); WCAG AA
contrast; keyboard navigation through the test; the countdown announced at 5 min, 1 min and 30 s via a
polite live region rather than on every tick; touch targets ≥44px.

---

## 11. Tests, deploy, phases

**Unit, written first** — `grade`: all-correct, all-wrong (floor −¼ × the MCQ count — −3.75 on an
all-MCQ paper, −3.00 on the usual 12-MCQ one), all-skipped, numeric at the
exact tolerance boundary, wrong numeric scores 0 not −0.25, section totals. `timer`: active time
accrues only while visible, unpaired pause, deadline never exceeds `expires_at`, client clock skew
changes nothing. `assemble`: correct 3/1/1, no duplicates, excludes previously-seen items, clear
failure when a stratum is exhausted.

**Integration, against a real database** — issue → open → identify → start → answer → pause → resume →
submit · expiry auto-submit · window beating the active timer · reissue caps at 3 and kills the old
token · double-submit rejected · **the answer key is absent from every candidate-facing payload** ·
rate limiter locks after 5 tries.

**Golden path before anything is called done:** issue a test, take it on a real Android phone over
mobile data, background it mid-question, come back, submit, read the report.

**Deploy.** `Admissions_AI` is not a git repo yet — step zero is `git init` and a **private** GitHub
repo, since this handles minors' data. `main` → production, PRs → preview.

> **The trap:** Vercel preview deployments get public URLs and inherit production env vars by default,
> so a preview could issue live tests against real candidate data. Scope env vars per environment and
> point previews at a separate staging Supabase project, with deployment protection on.

Migrations are not auto-applied — `supabase db push` is a deliberate step before the deploy that needs
it. The 12-month purge runs as a Vercel Cron against a secret-guarded route.

**Phases.** 0 — repo, Supabase, schema, auth. 1 — the three pure modules, tests first. 2 — candidate
flow end to end, golden path on a real phone. 3 — staff console and report. 4 — fill the bank to 300.
Calibration-batch review gates phase 4, not the rest.

---

## 12. Deferred — build only if the data asks for it

Parked deliberately. Each needs volume before it means anything, and v1 has none:

- **A weighted integrity score / band.** Revisit once a few hundred attempts show which signals
  actually separate honest from dishonest. Guessed weights dressed up as a number are worse than the
  raw facts in §7.
- **Collusion detection** across candidates (shared-wrong / same-correct pairs, per nda-tracker's
  `integrity_incidents`). Needs hundreds of attempts and meaningful item overlap.
- **Item discrimination** (point-biserial). % correct is enough until the bank is large and busy.
- **Exposure-aware item selection.** Plain random from 100 is already near-zero overlap.
- **A full audit log table.** `voided_by` / `voided_reason` covers v1.
- **Deeper fingerprinting** (ASN, device memory, hardware concurrency).

---

## 13. Risks

| | |
|---|---|
| **Pausing timer is exploitable** — close the tab, look it up, return | Chosen knowingly. The 2h window bounds it, and answer-changed-after-pause is the most visible fact on the report |
| **Identity is just a number** — whoever holds the phone can take it | Accepted; no webcam by decision. Cross-check against the telecaller's call recording |
| **A parent is in the room by construction** | Cuts both ways: deters an outside tutor, but the parent is the likeliest prompter. **Do not treat their presence as proctoring** |
| **Parent's phone, parent's schedule** — may not be free within 2h | Reissue, 3 per lead. Watch issued→opened drop-off before assuming the window is right |
| **A wrong answer key** misgrades quietly for months | Mandatory rationale, review status, seeding lint, and the <0.15 % correct flag as the late net |
| **Difficulty register is wrong** for this population | The calibration batch gates the bulk authoring |
| **Preview deploys touching production data** | Per-environment env vars, separate staging project, deployment protection |
| **No validation data exists for this instrument** | BRAINSTORM's core warning. The system computes no cut-off by design |
