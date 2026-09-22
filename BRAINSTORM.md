# Admissions AI — Brainstorm Record

**Date:** 2026-09-19
**Status:** Brainstorming. Nothing built. Paused mid-discussion.
**Scope:** Admissions funnel redesign for next year's intake (NDA coaching institute, year 2).

---

## 1. Context

**Year 1 problem:** student quality was poor. Being the first year, admissions were lenient.

**Year 2 goal:** admit above-average students demonstrating strong Officer Like Qualities (OLQs).

### Existing funnel (year 1)

| Layer | Who | Touch | Job |
|---|---|---|---|
| 1 | Telecaller | Low | Call leads, give course info, gauge intent. Pass high-intent to counsellor. |
| 2 | Counsellor | High | In-depth information, detailed discussion, convert the lead. |

### Proposed addition

| Layer | Who | Job |
|---|---|---|
| 3 | Teacher | Interview to gauge academic inclination + OLQs. |

---

## 2. Decisions reached so far

### Telecaller layer becomes a screening layer (user's proposal, accepted)

- Telecallers are conversation-skilled, not assessors. So they **administer** objective items, they don't **judge**.
- Sequence within a single call: **rapport → gauge interest/intent → then quiz.** Quizzing never opens the call.
- Items: basic arithmetic (add/sub/mult/div), English spellings, meanings.
- Purpose: reject **fundamentally weak** students early, at the cheapest layer.
- Explicit scope limit: this measures the **floor, not the ceiling**. It removes the bottom slice. It will never identify above-average officer material — that stays the teacher layer's job. Do not let it drift into being the quality bar.

### Call capture: own-device, no CPaaS provider (user's decision)

Rejected the provider route (Exotel / Ozonetel / MyOperator / Knowlarity / Acefone / Tata Smartflo). Chosen architecture:

1. Web app in the phone browser — telecaller taps **Call**, a `tel:` link opens the dialer with the number prefilled.
2. App logs the attempt server-side: lead ID, telecaller ID, timestamp.
3. **OEM system dialer auto-records** the call to a device folder.
4. **Autosync / FolderSync** uploads that folder continuously to Google Drive.
5. Backend reads the Drive folder via Drive API and attaches files to leads.

**Hard constraint: Android only, OEM recorder only.** Since Android 10 (and definitively Google's May 2022 Play policy), third-party apps cannot capture far-end audio. The recorder is not ours to build. Xiaomi/Redmi, Realme, Oppo, Vivo, Samsung and Google Phone all ship working call recording, widely used in India; most play an audible recording announcement, which helps with the DPDP notice. **iPhone is a flat no.**

**Recommended setup:** company-owned handsets, single model (4–6 × Redmi/Realme at ~₹8–10k), company SIMs, settings locked down, syncing to a **Workspace Shared Drive owned by the institute** — never a personal Drive, or the files leave when the person does. Roughly ₹50k one-time versus per-minute forever.

---

## 3. Open decisions

### Capacity-constrained or demand-constrained? (blocks everything else)

- **Capacity-constrained** (more qualified applicants than seats): the teacher layer is a **ranking** instrument. Relative bar, fill top-down, rejection is cheap.
- **Demand-constrained** (need every enrollment to hit the number): a hard reject gate is financially dangerous — every "no" is revenue already paid for twice.

Year-2 institutes are usually the second while wishing they were the first. If so, the honest design is a **sorter, not a filter**: stream into foundation / regular / elite batches. Reject only the unteachable and the attitude problems.

### Where does the teacher interview sit relative to money?

- Before counsellor — wastes teacher time on low-intent leads. Bad.
- After counsellor, before payment — cleanest integrity, worst conversion.
- **After token payment, before full fee** — the token filters seriousness, and a refundable token makes the reject graceful. Suggested default.

Regardless: **the teacher never delivers the rejection.** That call goes through the counsellor with a scripted alternative path.

### Not yet discussed

- How the counsellor layer changes.
- Whether the teacher interview is live or partly async.
- The rest of the user's idea (paused before it was described).

---

## 4. Recommendations made, not yet decided on

### Run the telecaller screen in shadow mode first

Strongest recommendation of the session. There is **zero validation data** for this new instrument — nobody knows what 4/10 predicts. Administer it, record the score, but **pass everyone through anyway** for the first few hundred leads. Then compare the score against what the counsellor and teacher independently concluded, and against who actually enrolled and performed. **Then** set the cut where the data says. Costs a few weeks; the alternative is an unvalidated filter quietly destroying the funnel with no way to notice.

### Design constraints for the quiz items

- **Only items with one unambiguous answer.** "Spell 'discipline'" works; "meaning of X" invites the telecaller to judge partial credit and produces inter-caller variance instead of signal. Multiple choice read aloud is safest.
- **Randomized bank, rotated** — five fixed questions will be on local WhatsApp within two weeks. Reuse the existing Question_Bank project; let each item accumulate a difficulty stat from real responses.
- **Make cheating evident, not impossible** — calculators, prompting parents, a sibling in the room. It can't be stopped over a phone, but the recording captures the six-second pause and the background voice. Coarse filter, some leakage is fine, don't over-engineer.
- **Confirm who is actually on the phone.** The number on file is often the parent's and the student is in school. Hard script step: if it's the parent, book a slot with the student.

### The teacher interview: measure trainability, not knowledge

Current marks are inflated and unverifiable. What a 30-minute interview can actually measure:

- **Teach-then-test** — teach a small unfamiliar concept for 4 minutes, then pose a problem on it. Learning velocity in a compressed window is the best available predictor of how they'll respond to teaching.
- **Error recovery under hint** — give a problem they'll fail, then hint. Do they update, or defend? Separates rigid from coachable.
- **Evidence of self-study** — not "do you study 6 hours" (they'll lie) but "show me your notebook / what did you do last Sunday, hour by hour." Specificity is hard to fake.
- **Articulation in their own language.** Don't penalise English — an English penalty quietly selects for family income rather than potential.

### Be skeptical about gauging OLQs at intake

At 16, a polished "officer-like" performance mostly measures parental coaching and a YouTube SSB video. The SSB itself takes five days and a psychologist, and still errs. Honest proxies instead:

- **Sustained commitment evidence** — anything held 12+ months (sport, NCC, an instrument, a responsibility at home). Grit leaves a paper trail.
- **Physical baseline** — simple, observable, unfakeable.
- **Responsibility taken**, unprompted, in their own account of their life.
- **Who is driving this — the kid or the parent.** The most predictive single question, and the best predictor of a mid-year dropout.

**Interview the parent separately and deliberately.** Parent dysfunction and unrealistic expectations cause as much attrition as weak students. You are admitting a family, not a student.

### Pair intake screening with probation

A 30-minute interview has modest predictive power. **Thirty days of observed behaviour** has enormous predictive power, and it's free because they're already in the classroom.

Published bar, stated in the admission agreement up front: the first two internal tests plus attendance/discipline in weeks 1–6 determine whether the student continues in the flagship batch, moves to foundation, or exits with a defined refund. More accurate than any interview, easier to defend to a parent (it's their child's own performance, not a teacher's opinion), and it fixes what was probably the actual year-1 failure — **no exit mechanism once someone was in.**

### Consider the screen as a magnet, not just a gate

The same instrument packaged as an **entrance + scholarship test** generates leads instead of consuming them: top-of-funnel marketing, a stronger counsellor close ("you've qualified" beats "please pay"), scholarship slabs that price-discriminate toward the students you want, and a ranked pool for streaming.

### Incentives will quietly break this

Counsellors are paid on conversion; the new layer reverses conversions. Predictable: coaching the student on answers, lobbying the teacher, escalating for an override. **The first override kills the gate** — every teacher learns it's theatre.

Mitigations to discuss: score counsellors on *qualified* conversions (survivors at day 60), not gross; publish an override policy with a named owner and a logged reason; audit a sample of interviews.

### Rejection has a blast radius

In a local market, a rejected family talks. Every "no" needs a graceful **"not yet"**: foundation/bridge batch, re-test in 90 days, or an honest referral elsewhere. "You're not ready for *this* batch" travels far better than "you're not good enough" — and is often true.

### Standardisation

Teachers will each have their own bar. Without a rubric with anchors, calibration sessions, and a scoring scale, it's vibes — and it becomes political.

---

## 5. Where AI actually earns its place

Resist "AI interviews the student" — the interview is where human judgment and relationship-building matter, and parents will hate it. Higher-value, lower-risk:

- **Lead scoring trained on year-1 outcomes.** A full cohort with known results already exists. Regress intake signals against who actually performed, retained and paid. That produces the rubric from own data rather than intuition. Highest leverage item; almost nobody does it.
- **Interview → structured scores.** Teacher talks, transcript becomes a rubric-scored record. Removes the paperwork that would otherwise kill teacher compliance by week 3.
- **Inter-rater drift detection.** Flag when teacher A's bar drifts from teacher B's. This is what makes a rubric real rather than decorative.
- **Async first-round scoring** — recorded responses plus a test, auto-scored, with a human reviewing only the borderline band.
- **Cross-layer consistency checks** — telecaller notes vs counsellor notes vs interview. Contradictions are strong signal.
- **Telecaller call QA** — cheap, immediate ROI, independent of the whole interview question.

**The recordings are a bigger asset than the screening score** — transcribed, they give QA, script adherence, objection mining, honest intent scoring, and training data. Main technical risk: **code-mixed Hindi/Marathi/English ASR quality.** Worth a spike on real call audio before building anything that assumes clean transcripts.

---

## 6. Known risks and costs of the chosen architecture

Accepted knowingly by dropping the provider:

- **Lead theft.** No number masking — every lead's raw number sits permanently in a telecaller's call log. Routine and expensive in this sector. Company SIMs keep the callback number with the institute but do not fix this.
- **The audit becomes opt-in by the audited.** If a telecaller disables recording, clears the folder, kills the sync app, or stays off wifi, there is nothing — and no way to know which calls are missing.
- **Device heterogeneity** — mitigated by buying a single model.
- **OS updates** can silently break recording or change the folder/filename format.
- **File ↔ lead matching is the real engineering problem.** Match on (phone number, timestamp) against the call-attempt log, with filename parsing as a secondary signal. OEM filename schemes are inconsistent and change.

### Compliance

- **DPDP Act 2023** — recording personal data of **minors**, a specially protected category requiring verifiable parental consent. Needed: a spoken consent line at call start (the OEM announcement covers much of this), consent captured as a record, a stated retention period, and purpose limitation. Cheap now, painful to retrofit onto an existing archive.
- Minors' data on a telecaller's **personal** phone synced to their **personal** Google account is a compliance and leak problem — company device plus Workspace account is the fix.
- **TRAI / DND** rules on outbound calling, sharper if any lists are purchased.

---

## 7. Next actions

1. **Half-day handset test before buying five.** Buy or borrow one Redmi/Realme: enable auto call recording → make a real call → confirm **both voices** are audible → note the exact folder path and filename format → install Autosync pointed at a Workspace Drive folder → confirm files appear within a minute or two → make a call with wifi off, reconnect, confirm backfill → check file size and format (~1MB per 5 min; transcode if WAV). If that passes, the architecture is proven and the rest is just the lead app.
2. **Settle capacity vs demand constrained** — seat target vs expected qualified applicants.
3. **Characterise the year-1 failure** — was it *academic* weakness or *discipline/motivation* weakness? They need different instruments.
4. **Confirm teacher availability** — salaried staff or visiting faculty? Decides whether a live teacher interview is feasible at all.
5. **Volume estimate** — calls/day at peak, number of telecallers.
6. **Finish describing the rest of the idea** — counsellor layer changes, live vs async interview.

### Build principle agreed

**One lead record with every touch appended to it** — call, recording, score, telecaller notes, counsellor notes, interview scores, outcome. A screening app separate from the lead timeline means two systems that disagree within a month, and the year-end analysis that makes all of this worthwhile becomes impossible.

### Volume arithmetic to respect

1000 leads → ~300 counsellor-qualified → 150 interviews × 30 min = **75 hours of senior teacher time**, in a window where teachers are also teaching. It collapses. Hence the telecaller screen, and possibly a further async layer before the teacher.

### Still worth keeping from the provider world

**Missed-call / IVR lead capture** on the advertising number — a separate cheap service, and the highest-quality lead source available.
