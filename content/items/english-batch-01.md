# English Batch 01 — 15 items

> **Options re-lettered 2026-10-06** to balance answer keys across A–D. Option letters in this review sheet are as reviewed and may no longer match; the `.json` is current.

**Date:** 2026-09-23
**Status:** Awaiting review. Machine-readable source: `english-batch-01.json`.
**Composition:** 5 easy / 5 moderate / 5 difficult, all English. All MCQ.

**Why the shape is flat, not easy-heavy.** Every earlier batch was weighted to easy because that
stratum needs 60 per subject. English did not have that problem — it had one difficult item,
`E-D-05`, which therefore appeared on 100% of papers. Adding easy items would not have touched
that. This batch takes English from 5/2/1 to **10/7/6**.

> **Same caveat as the science batch, and it applies here too: none of these fifteen keys can be
> checked by machine.** There is no arithmetic to recompute. `items:lint` confirms shape,
> duplication and length tells; the rationale is the argument and your reading is the verification.

---

## Easy (5)

| Ref | Skill | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|
| E-E-09 | synonym-in-context | "a terse reply" | **A** brief | "Angry" — the connotation, not the meaning |
| E-E-10 | antonym | opposite of "scarce" | **A** plentiful | "Expensive" — what scarcity *causes* |
| E-E-11 | subject-verb-agreement | "Neither of the boys ___ finished" | **A** has | "Have", pulled by the plural noun next to the verb |
| E-E-12 | preposition-usage | "accused ___ neglecting his duty" | **A** of | "For", borrowed from *blamed for* / *punished for* |
| E-E-13 | idiom-meaning | "pull up their socks" | **A** work harder | The literal reading, plausible on a parade ground |

## Moderate (5)

| Ref | Skill | Stem (abbreviated) | Key | Why moderate |
|---|---|---|---|---|
| E-M-14 | analogy | Thermometer : temperature :: barometer : ? | **A** pressure | "Weather" is what it *predicts*, not what it measures |
| E-M-15 | relationship-reasoning | "the daughter of the only son of my father" | **A** Daughter | Unwinding the phrase from the inside out |
| E-M-16 | reading-inference | Anand closes his **unopened** book and leaves | **A** ran out of time | One adjective contradicts the tempting answer |
| E-M-17 | identifying-assumptions | Cancel the parade, rain is forecast | **A** rain would disrupt it | "Forecast is never wrong" overshoots what is required |
| E-M-18 | logical-connectors | "trained every morning. ___, he failed" | **A** Nevertheless | "Therefore" asserts the opposite relation |

**E-M-15 had to be rewritten to remove an ambiguity, and it is worth knowing why.** The familiar
version of this puzzle says *"my grandfather's only son"* — which is ambiguous, because it leaves
open whether the speaker descends through that son or through a daughter. Under the first reading
the girl is the speaker's sister; under the second she is his cousin. Both are defensible, so the
item would have had two right answers. *"The only son of my father"* is the speaker himself and
admits one reading.

## Difficult (5)

| Ref | Skill | Stem (abbreviated) | Key | Why difficult |
|---|---|---|---|---|
| E-D-19 | logical-deduction | Five runners, four constraints | **B** Bhavna | No single clue fixes a position; the last clue moves Ravi above Amit |
| E-D-20 | quantifier-logic | "Not all cadets passed" | **A** at least one failed | Everyday usage hears "not all" as "rather few" |
| E-D-21 | evaluating-an-argument | Breakfast → higher scores | **A** they also sleep more | Correlation vs cause; the attack is an alternative explanation |
| E-D-22 | supported-conclusion | Car ban: centre up, outskirts down | **A** shoppers shifted | Both halves of the data must be held together |
| E-D-23 | identifying-tone | Lighter, cheaper, "tests still under way" | **A** cautiously positive | Tone carried by placement, not by any evaluative word |

**E-D-21 is the most valuable item in the bank so far.** Reading a correlation as a cause is the
single most common reasoning failure in public argument, and the item tests the right repair:
the strongest objection is an alternative explanation, not a denial of the data.

**E-D-20 is the one most likely to draw a complaint.** Strictly, "not all passed" is satisfied by
one failure among a hundred passes, and option C — "most cadets did not pass" — is how the phrase
is often *heard*. If you would rather the test not reward strict logic over ordinary usage, this is
the item to cut. I have kept it because a screening test for officer training is exactly where
reading a statement precisely should count.

---

## Verification

- **No key here is machine-checkable.** Unlike the maths batches, there is nothing to recompute.
- `npm run items:lint` → 75 items, 0 errors, 0 warnings.
- Exposure over 1,000 simulated draws with this batch included: **1,000 distinct papers**, and
  **no item appears on every paper** — down from 6 two batches ago. The most exposed item is now
  `E-E-02` at 32%.

## Bank after this batch

```
maths     easy 20   moderate 7   difficult 5      (target 60 / 20 / 20)
english   easy 10   moderate 7   difficult 6
science   easy 12   moderate 4   difficult 4
                                    75 items
```

No stratum is now at its floor. The thinnest are science moderate and science difficult at 4 each,
which is where the next batch should go — but nothing is urgent in the way English difficult was.

To promote this batch once reviewed:

```
npm run items:seed -- --live --file english-batch-01.json
```

---

## Class tags (2026-09-27)

`taught_in` is the class in which the content is first taught (NCERT sequence, checked against the
Maharashtra board where they differ); an admit to class N draws `taught_in ≤ N−1`. 6 is the floor
and means open to every admit. Raised tags are a curriculum judgement — overrule in the `.json`
and re-run `npm run items:lint`.

| Ref | taught_in | Why |
|---|---|---|
| E-E-09 | 6 | reasoning or everyday content; open to every admit |
| E-E-10 | 6 | reasoning or everyday content; open to every admit |
| E-E-11 | 6 | reasoning or everyday content; open to every admit |
| E-E-12 | 6 | reasoning or everyday content; open to every admit |
| E-E-13 | 6 | reasoning or everyday content; open to every admit |
| E-M-14 | 6 | reasoning or everyday content; open to every admit |
| E-M-15 | 6 | reasoning or everyday content; open to every admit |
| E-M-16 | 6 | reasoning or everyday content; open to every admit |
| E-M-17 | 6 | reasoning or everyday content; open to every admit |
| E-M-18 | 6 | reasoning or everyday content; open to every admit |
| E-D-19 | 6 | reasoning or everyday content; open to every admit |
| E-D-20 | 6 | reasoning or everyday content; open to every admit |
| E-D-21 | 6 | reasoning or everyday content; open to every admit |
| E-D-22 | 6 | reasoning or everyday content; open to every admit |
| E-D-23 | 6 | reasoning or everyday content; open to every admit |
