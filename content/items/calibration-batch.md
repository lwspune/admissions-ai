# Calibration Batch — 15 items

**Date:** 2026-09-22
**Purpose:** Establish the difficulty register and house style **before** the remaining 285 items are authored.
**Status:** Approved 2026-09-22. Three items revised post-approval to clear length tells flagged by
`npm run items:lint` — see S-E-01, S-E-02 and E-D-05. Machine-readable source: `calibration-batch.json`.
**Composition:** Exactly one paper's worth — 3 easy / 1 moderate / 1 difficult per subject, per spec §8.

This markdown is the **review artifact**. Once approved, these are seeded to `test_items` with
`status='review'` and you promote them to `live` (spec §11.3).

**How to review:** for each item, check three things — (1) is the key actually right, (2) is the
difficulty tier plausible for a 15-year-old applying to NDA coaching, (3) does any distractor look
either obviously wrong or accidentally defensible. Mark items you want changed; I'll revise before
writing the bulk.

**Format notes:** stems under 40 words, text-only, no diagrams, English only. MCQ is 4 options.
Numeric items have no options and a stated tolerance. "Target p" is the proportion of candidates
expected to answer correctly — the tier definition from spec §11.2.

---

## Maths

### M-E-01 · easy · MCQ · number-series
**Target p:** 0.80

> Find the next number in the series:
> **3, 6, 11, 18, 27, ___**

| | |
|---|---|
| A | 36 |
| B | 38 |
| C | 37 |
| D | 40 |

**Key: B (38)**

**Rationale.** The differences are 3, 5, 7, 9 — consecutive odd numbers. The next difference is 11, so
27 + 11 = 38.
- **A (36)** — repeats the previous difference of 9 instead of advancing it. The single most common error.
- **C (37)** — treats the differences as increasing by 1 each time (3, 5, 7, 9, 10).
- **D (40)** — skips an odd number, using 13 as the next difference.

---

### M-E-02 · easy · numeric · percentage
**Target p:** 0.82

> In a class of 40 students, 25% did not appear for a test.
> How many students **appeared** for the test?

**Answer: 30** · tolerance 0

**Rationale.** 25% of 40 = 10 absent, so 40 − 10 = 30 appeared. Two steps, and the second step is the
one that discriminates — a candidate who computes 10 and stops has answered the question that wasn't
asked. Numeric format means that error scores 0 rather than being cued by an option list.

---

### M-E-03 · easy · MCQ · ratio-proportion
**Target p:** 0.75

> Three friends share ₹1,200 in the ratio 2 : 3 : 7.
> How much does the friend with the **largest** share receive?

| | |
|---|---|
| A | ₹700 |
| B | ₹600 |
| C | ₹840 |
| D | ₹300 |

**Key: A (₹700)**

**Rationale.** Total parts = 2 + 3 + 7 = 12. One part = ₹100. Largest share = 7 × 100 = ₹700.
- **B (₹600)** — sums the parts wrongly as 14; 1200 ÷ 14 × 7 = 600. Lands on a clean number, which is
  what makes it dangerous.
- **C (₹840)** — reads "7" as 70%, so 1200 × 0.7. The classic ratio/percentage confusion.
- **D (₹300)** — computes correctly but returns the middle share, ignoring "largest".

---

### M-M-04 · moderate · MCQ · time-and-work
**Target p:** 0.55

> A tap fills a tank in 6 hours. A second tap fills the same tank in 12 hours.
> If both taps are opened together, how long will the tank take to fill?

| | |
|---|---|
| A | 4 hours |
| B | 9 hours |
| C | 18 hours |
| D | 3 hours |

**Key: A (4 hours)**

**Rationale.** Rates add: 1/6 + 1/12 = 3/12 = 1/4 of the tank per hour, so 4 hours.
- **B (9 hours)** — averages the two times. The dominant wrong answer, and the reason this is moderate
  rather than easy: it *feels* right and requires knowing that rates, not times, are additive.
- **C (18 hours)** — adds the times. Fails the sanity check that two taps must be faster than one.
- **D (3 hours)** — halves the faster tap's time.

---

### M-D-05 · difficult · numeric · multi-step-arithmetic
**Target p:** 0.30

> A shopkeeper marks an item 40% above its cost price, then gives a 25% discount on the marked price.
> If the item cost ₹800, what is the **selling price** in rupees?

**Answer: 840** · tolerance 0

**Rationale.** Marked price = 800 × 1.40 = 1120. Selling price = 1120 × 0.75 = 840.

The item is difficult because percentages applied to *different bases* resist shortcutting. The
seductive error is netting the percentages — 40 − 25 = 15, giving 800 × 1.15 = 920 — which treats both
percentages as applying to cost price. Numeric format is deliberate here: in MCQ form, seeing 840 and
920 side by side prompts a re-check that the candidate wouldn't otherwise do.

---

## English

### E-E-01 · easy · MCQ · analogy
**Target p:** 0.85

> **Doctor** is to **Hospital** as **Teacher** is to ___

| | |
|---|---|
| A | School |
| B | Student |
| C | Book |
| D | Lesson |

**Key: A (School)**

**Rationale.** The relation is *professional → place of work*. A teacher works in a school.
- **B (Student)** — professional → person served. A real relation, but not the one given.
- **C (Book)** — professional → tool used.
- **D (Lesson)** — professional → thing produced.

Every distractor is a genuine teacher-relation; the item tests whether the candidate identifies
*which* relation the first pair establishes, which is what makes an analogy a reasoning item rather
than a vocabulary one.

---

### E-E-02 · easy · MCQ · odd-one-out
**Target p:** 0.78

> Which word does **not** belong with the others?

| | |
|---|---|
| A | Frequently |
| B | Rarely |
| C | Often |
| D | Regularly |

**Key: B (Rarely)**

**Rationale.** Frequently, often and regularly all indicate high frequency. Rarely indicates low
frequency — the odd one on the dimension the set establishes.

Note on authoring: an earlier draft used calm/quiet/peaceful/**loud**, which would have calibrated at
p ≈ 0.95 and auto-flagged for retirement as a free mark (spec §11.4). This version keeps all four words
on the same semantic dimension so the item discriminates.

---

### E-E-03 · easy · MCQ · sentence-completion
**Target p:** 0.76

> Although he had practised for months, he ___ to qualify for the final round.

| | |
|---|---|
| A | failed |
| B | managed |
| C | hoped |
| D | deserved |

**Key: A (failed)**

**Rationale.** "Although" signals contrast: months of practice should predict success, so the clause
that follows must report the opposite. Only "failed" does.

All four options are grammatical with the infinitive "to qualify" — this is deliberate. If one option
were grammatically impossible, candidates could eliminate it without reading for meaning, and the item
would be measuring grammar instead of the logical connector.
- **B (managed)** — a positive outcome; sits against "Although".
- **C (hoped)** — an intention, not an outcome; leaves the contrast unresolved.
- **D (deserved)** — an evaluation, not an outcome.

---

### E-M-04 · moderate · MCQ · sentence-sequencing
**Target p:** 0.58

> Arrange the four sentences into a logical paragraph.
> **P.** He then walked to the station.
> **Q.** Rahul woke up late.
> **R.** The train had already left.
> **S.** He dressed in a hurry.

| | |
|---|---|
| A | Q S P R |
| B | Q P S R |
| C | S Q P R |
| D | Q S R P |

**Key: A (Q S P R)**

**Rationale.** Q must open — it is the only sentence with a named subject; the others use "he", which
requires an antecedent. The rest follows causally: woke late → dressed in a hurry → walked to the
station → the train had gone.
- **B (Q P S R)** — walks to the station before dressing.
- **C (S Q P R)** — opens on the pronoun before the name.
- **D (Q S R P)** — puts the train's departure before the arrival, which the past perfect "had already
  left" rules out.

Moderate because it requires two independent cues — pronoun reference and tense — not just event order.

---

### E-D-05 · difficult · MCQ · inference
**Target p:** 0.30

> Every member of the debate team attends the Saturday workshop.
> Meera attends the Saturday workshop.
> Which statement **must** be true?

| | |
|---|---|
| A | Meera is on the debate team. |
| B | Meera may or may not be on the debate team. |
| C | Meera is not on the debate team. |
| D | Everyone at the workshop is on the debate team. |

**Key: B**

**Rationale.** The premise says team members attend — not that *only* team members attend. The workshop
may be open to anyone. So Meera's attendance is consistent with membership and with non-membership, and
neither is established.

- **A** — affirming the consequent. This is the **expected majority answer**, and the entire point of
  the item: it separates candidates who read a conditional as one-directional from those who silently
  reverse it. This is close to a pure reasoning measure with almost no knowledge content, which makes
  it among the most valuable items in the batch.
- **C** — inverts the error.
- **D** — states the converse of the premise outright, which is exactly the unwarranted step A takes
  implicitly. (Revised: the original "the debate team has only one member" was unrelated to the premises
  and tempted nobody, and the hedged key was the longest option — a length tell. D is now both the
  longer option and the better distractor.)

**Watch on review:** the word "must" carries the item. If real candidates read past it, p may fall
below 0.20 and the item will need the word emphasised rather than the item discarded.

---

## Science

### S-E-01 · easy · MCQ · everyday-phenomenon
**Target p:** 0.75

> Wet clothes dry faster on a windy day than on a still day.
> The main reason is that the wind ___

| | |
|---|---|
| A | carries away the water vapour near the clothes |
| B | raises the temperature of the wet clothes |
| C | increases the air pressure around the wet clothes |
| D | adds heat energy directly to the wet clothes |

**Key: A**

**Rationale.** Evaporation slows as the air immediately around the clothes becomes saturated. Wind
replaces that saturated air, so evaporation continues at its initial rate. No formula, no definition —
the candidate applies a mechanism to an everyday observation.
- **B** — wind generally cools rather than warms; it also conflicts with everyday experience of wind.
- **C** — confuses air movement with pressure increase.
- **D** — the common "wind is warm" misconception; drying still happens with cold wind.

---

### S-E-02 · easy · MCQ · classification
**Target p:** 0.70

> Which of these is **not** a mixture?

| | |
|---|---|
| A | Atmospheric air |
| B | Sea water |
| C | Brass |
| D | Carbon dioxide |

**Key: D (Carbon dioxide)**

**Rationale.** Carbon dioxide is a compound — fixed composition, chemically bonded. The other three are
mixtures in varying proportions.
- **A (Atmospheric air)** — a mixture of gases; candidates who think "pure substance" because it is
  invisible. Lengthened from "Air" so the key is no longer the longest option.
- **B (Sea water)** — the most obvious mixture; included as an anchor.
- **C (Brass)** — an alloy, and therefore a mixture. The real discriminator: candidates who think
  "metal = element" pick this.

**Watch on review:** this is the most recall-adjacent item in the batch. It tests classification
reasoning rather than a memorised definition, but it sits closer to the excluded category than anything
else here. Flag it if you want it replaced with a purely inferential item.

---

### S-E-03 · easy · numeric · unit-and-magnitude
**Target p:** 0.68

> A cyclist covers 12 km in 40 minutes.
> What is the average speed in **kilometres per hour**?

**Answer: 18** · tolerance 0

**Rationale.** 40 minutes = 2/3 hour. 12 ÷ (2/3) = 18 km/h.

The discriminator is the unit conversion, not the division. Candidates who divide 12 by 40 and report
0.3, or who ignore the units and report 12, have missed what the question asked for.

**Watch on review:** I have tiered this easy, but the minutes-to-hours step may push real p toward 0.55
and make it moderate. It is the item in this batch I am least confident about, and a good test of
whether the tier definitions survive contact with real candidates.

---

### S-M-04 · moderate · MCQ · experimental-reasoning
**Target p:** 0.60

> To test whether a plant needs sunlight to grow, a student keeps one plant in bright light and an
> identical plant in a dark cupboard.
> For this to be a fair test, what must be kept the **same** for both plants?

| | |
|---|---|
| A | The water, soil and temperature |
| B | Only the type of pot |
| C | The amount of light received |
| D | Nothing else needs to be the same |

**Key: A**

**Rationale.** A fair test holds every variable constant except the one under investigation. Light is
the variable being tested, so everything else must match.
- **B** — recognises that something must be controlled, but picks the least relevant variable.
- **C** — the strongest distractor. It sounds like textbook fair-test language, but holding light
  constant would destroy the experiment. It catches candidates repeating a phrase rather than reasoning
  about what the experiment is for.
- **D** — no control of variables at all.

---

### S-D-05 · difficult · MCQ · applying-a-principle
**Target p:** 0.35

> A **sealed, rigid** steel container filled with air is heated.
> Which statement about the air inside is correct?

| | |
|---|---|
| A | The pressure increases and the volume stays the same |
| B | The volume increases and the pressure stays the same |
| C | Both the pressure and the volume increase |
| D | Both the pressure and the volume decrease |

**Key: A**

**Rationale.** "Rigid" fixes the volume. Heating raises the pressure at constant volume.

The item is difficult because "heating makes things expand" is a correct general intuition that must be
suppressed here by one word in the stem. It measures whether a candidate reads constraints before
applying a rule — which is close to what the coaching year will demand of them daily.
- **B** — the default expansion intuition, ignoring "rigid". Expected majority wrong answer.
- **C** — applies both effects without noticing they are mutually exclusive in a rigid container.
- **D** — confuses heating with cooling.

---

## Answer key summary

| ID | Subject | Skill | Tier | Format | Answer | Target p |
|---|---|---|---|---|---|---|
| M-E-01 | Maths | number-series | easy | MCQ | **B** (38) | 0.80 |
| M-E-02 | Maths | percentage | easy | numeric | **30** | 0.82 |
| M-E-03 | Maths | ratio-proportion | easy | MCQ | **A** (₹700) | 0.75 |
| M-M-04 | Maths | time-and-work | moderate | MCQ | **A** (4 hours) | 0.55 |
| M-D-05 | Maths | multi-step-arithmetic | difficult | numeric | **840** | 0.30 |
| E-E-01 | English | analogy | easy | MCQ | **A** (School) | 0.85 |
| E-E-02 | English | odd-one-out | easy | MCQ | **B** (Rarely) | 0.78 |
| E-E-03 | English | sentence-completion | easy | MCQ | **A** (failed) | 0.76 |
| E-M-04 | English | sentence-sequencing | moderate | MCQ | **A** (QSPR) | 0.58 |
| E-D-05 | English | inference | difficult | MCQ | **B** | 0.30 |
| S-E-01 | Science | everyday-phenomenon | easy | MCQ | **A** | 0.75 |
| S-E-02 | Science | classification | easy | MCQ | **D** (CO₂) | 0.70 |
| S-E-03 | Science | unit-and-magnitude | easy | numeric | **18** | 0.68 |
| S-M-04 | Science | experimental-reasoning | moderate | MCQ | **A** | 0.60 |
| S-D-05 | Science | applying-a-principle | difficult | MCQ | **A** | 0.35 |

**Balance check:** 12 MCQ / 3 numeric · 9 easy / 3 moderate / 3 difficult · 5 per subject.
Numeric items sit only where a numeric answer is natural (2 maths, 1 science), per spec §1.

**Mean target p across the paper ≈ 0.64.**

Two reference points for reading a score on this paper: a candidate guessing at random on all 12 MCQs
and skipping the numerics expects **+0.75**, and one getting everything wrong floors at **−3.00**.

Note that −¼ does not make guessing exactly neutral on a 4-option item — that would need −⅓. At −¼ the
expected value of a blind guess is +0.0625 per item, so guessing still pays very slightly. That is a
deliberate, conventional choice, not an oversight: it keeps the marking easy to state to a 15-year-old,
and since the system computes no cut-off, the small bias costs nothing.

---

## House style this batch establishes

Carry these into the remaining 285:

1. **Every distractor encodes a named reasoning error**, documented in the rationale. A distractor with
   no story behind it is a wasted option.
2. **No option is eliminable on grammar, length or format alone.** See E-E-03 — all four options had to
   be grammatical for the item to measure what it claims to.
3. **Difficulty comes from a constraint the candidate must notice** (M-D-05's two bases, E-D-05's
   "must", S-D-05's "rigid"), never from heavier arithmetic or rarer vocabulary. Difficulty by obscurity
   selects for tuition access; difficulty by careful reading selects for the thing being screened.
4. **Numeric format is used deliberately**, where seeing the options would leak a check the candidate
   should perform themselves.
5. **Easy does not mean free.** Target p ≈ 0.75–0.85, not 0.95. An item almost everyone answers
   correctly carries no information and auto-flags for retirement.
6. **Science applies principles to scenarios**, never recalls definitions, dates or named discoveries.

---

## Open for your review

- **S-E-02** is the most recall-adjacent item here. Replace with a purely inferential item?
- **S-E-03** may calibrate to moderate rather than easy.
- **E-D-05** depends on the candidate reading "must". Emphasise it typographically?
- Is the overall register right — too easy, too hard, or about right for the leads you expect?
- Are the target-p values plausible against what you know of last year's cohort? Your read on this
  population is better than my estimate, and every tier in the remaining 285 depends on it.
