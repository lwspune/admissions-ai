# Legacy IQ Paper (2025) — 15 items ported

**Date:** 2026-09-22
**Source:** `C:\Vilas\LWS_Pune\LTSE\IQ_Test\01\` — `IQ Test_Qs.docx` (20 questions, 20 minutes,
Max Marks 20, OMR-marked), plus its two answer keys `IQ Test Answer Key.docx` (Apr 2025) and
`IQ Test_Qs_A5_ak.docx` (Nov 2025).
**Status:** Awaiting review. Machine-readable source: `legacy-iq-2025.json`.
**Composition:** 12 maths (8 easy / 3 moderate / 1 difficult), 3 English (2 easy / 1 moderate),
0 science.

These are the institute's own items, which makes them worth more than anything authored from
scratch: they have been through a real sitting. They arrive with **five wrong answer keys** and
some weak distractors, both corrected below.

---

## Why 5 of the 20 were dropped

| Q | Question | Reason |
|---|---|---|
| 5 | Odd one out: Apple / Mango / Banana / Carrot | Recall at p ≈ 0.95. Discriminates nothing, and duplicates `S-E-02` (classification) and `E-E-02` (odd-one-out) |
| 12 | Count the triangles in the figure | **The figure is gone.** It survives in the `.docx` only as a mangled VML blob. v1 is text-only by decision (spec §3) |
| 15 | A cube has how many faces? | Recall, not reasoning. p ≈ 0.97 |
| 19 | Next in 2, 6, 12, 20, 30, ___ | **Same sequence as Q1.** Both are n(n+1); Q1 asks the 5th term, Q19 the 6th. Two of twenty marks measuring one skill |
| 20 | Yellow + blue = ? | Recall at p ≈ 0.95. It was the paper's only science-adjacent item, and it isn't really science |

**The paper contains no science.** By our taxonomy it is roughly 13 maths, 5 reasoning, 1 English,
1 colour-mixing. If the 5/5/5 split in spec §1 is to survive, the science items have to be
authored — none can be mined from here. See "What this says about the spec" below.

---

## Corrected answer keys

I re-derived all 20 from scratch and then re-derived the 13 computable ones again in code
(`0 mismatches`). The two shipped keys disagree with each other and each is wrong somewhere:

| Q | Correct | Apr 2025 key | Nov 2025 A5 key |
|---|---|---|---|
| 3 | **C) U** | C ✓ | **A) S ✗** |
| 4 | **A) 3:35** | **B) 3:45 ✗** | A ✓ |
| 7 | **C) 3:25** | **D) 1:5 ✗** | C ✓ |
| 12 | *unanswerable* | guesses C) 17 | "(Missing Figure)" ✓ |
| 17 | **C) 12** | **"not in options" ✗** | C ✓ |

The April key is unedited model output. On Q4, Q7 and Q17 it announces that the right answer is
not among the options — and in all three cases it plainly is. On Q7 it computes 3/25, sees that
option C *is* 3/25, and selects D anyway.

**Clean key for the printed paper:** `B A C A D A C B C B C — B A C A C B C A` (Q12 void).

> **Still outstanding, and not something the port fixes:** if any candidate was ever marked
> against the April key, they lost Q4, Q7 and Q17 regardless of what they wrote — 15% of the
> paper — with Q12 scored on a guess. The Nov 2025 A5 key is the good one apart from Q3.

---

## Distractors changed

Three items had option sets that let a candidate answer without solving. Each change is recorded
in the item's own `rationale` field as well, so it survives independently of this document.

- **M-M-15** (Q11, inverse proportion) — was `14 / 15 / 16 / 18`. The characteristic error here is
  `12 × 6/8 = 9`, applying direct proportion where the relationship is inverse; **9 was not
  offered**, so a candidate making the error was forced back to re-think and could recover by
  elimination. `15` → `9`.
- **M-D-17** (Q7, ratio chaining) — was `1:3 / 2:3 / 3:25 / 1:5`. `1:5` derives from no error.
  Replaced with `25:3`, the same correct work reported the wrong way round — now the sharpest
  distractor in the bank. It also removed a length tell, since `3 : 25` was the longest option.
- **E-E-07** (Q14, anagram) — was `BROWN / BOARD / WORD / BROWD`. `BOARD` and `WORD` use letters
  not in OBRNW, so two of four options fall to character-counting alone. All three distractors now
  use exactly the same five letters (verified programmatically).

Two further weak spots are **left in place and flagged in the rationales** rather than silently
patched: `M-E-11` option D (89,223) and `M-E-13` option D (28) correspond to no derivable error.
They are filler. Replace them when you next touch the maths bank.

---

## Difficulty re-tiering

The source paper is flat — everything is worth 1 mark and nothing is marked hard. Tiering against
spec §11.2 is therefore my judgement, and the part of this batch most worth your disagreement:

- **Moderate**, not easy: **Q4** (needs degrees→minutes, not clock reading), **Q11** (inverse vs
  direct proportion — the same trap class as `M-M-04`), **Q16** (7 cats/7 mice; the intuitive
  answer, 14 minutes, is wrong), **Q3** (the pattern lives in alphabet *positions*, not letters).
- **Difficult:** **Q7** only. Two invertible conversions through an intermediate unit. It is the
  best item in the paper.
- Everything else is easy, and several are very easy. That is fine — the easy stratum needs 60 per
  subject and these are honest anchors.

---

## Collisions to watch

- **`M-E-07` (60 km in 90 min) and `S-E-03` (12 km in 40 min)** are the same conversion in
  different clothes, and they sit in *different subjects* — so the assembler can and eventually
  will draw both onto one paper. Not a defect today with a 30-item bank, but worth a rule later.
- **`E-E-06` (valid syllogism) and `E-E-05`/`E-D-05` (invalid converse)** can co-occur. That one is
  arguably a feature: a candidate who has learned "syllogism ⇒ True" answers the second one wrong.
- **`M-E-08` and `M-E-12`** are both linear equations, easy tier. Kept deliberately — `M-E-12` puts
  the variable on both sides — but they should not share a paper once the bank is deep enough to
  avoid it.

---

## What this says about the spec

The institute's actual house style, as evidenced by the one paper it has been using, is a
**quantitative reasoning test**: 65% maths, a little verbal logic, no science. Our spec mandates
5 maths / 5 English / 5 science.

Both are defensible; they are not the same test. Worth deciding before 285 items get authored
against a split that the institute doesn't really practise — because the science items are the
ones that will be invented from nothing rather than drawn from experience.

---

## Bank after this batch

```
maths     easy 11   moderate 4   difficult 2
english   easy  5   moderate 2   difficult 1
science   easy  3   moderate 1   difficult 1
                                    30 items
```

Target is 60 / 20 / 20 per subject. `npm run items:lint` → 30 items, 0 errors, 0 warnings.

---

## Class tags (2026-09-27)

`taught_in` is the class in which the content is first taught (NCERT sequence, checked against the
Maharashtra board where they differ); an admit to class N draws `taught_in ≤ N−1`. 6 is the floor
and means open to every admit. Raised tags are a curriculum judgement — overrule in the `.json`
and re-run `npm run items:lint`.

| Ref | taught_in | Why |
|---|---|---|
| M-E-06 | 6 | reasoning or everyday content; open to every admit |
| M-E-07 | 7 | speed = distance ÷ time — Class 7 Motion and Time |
| M-E-08 | 7 | one-step linear equation — Class 7 Simple Equations |
| M-E-09 | 6 | reasoning or everyday content; open to every admit |
| M-E-10 | 6 | reasoning or everyday content; open to every admit |
| M-E-11 | 6 | reasoning or everyday content; open to every admit |
| M-E-12 | 8 | variable on both sides — Class 8 Linear Equations in One Variable |
| M-E-13 | 6 | reasoning or everyday content; open to every admit |
| M-M-14 | 6 | reasoning or everyday content; open to every admit |
| M-M-15 | 8 | inverse proportion — Class 8 |
| M-M-16 | 6 | reasoning or everyday content; open to every admit |
| M-D-17 | 7 | chained ratio — Class 7 ratio and proportion |
| E-E-06 | 6 | reasoning or everyday content; open to every admit |
| E-E-07 | 6 | reasoning or everyday content; open to every admit |
| E-M-08 | 6 | reasoning or everyday content; open to every admit |
