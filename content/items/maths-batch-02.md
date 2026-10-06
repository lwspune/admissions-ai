# Maths Batch 02 — 15 items

> **Options re-lettered 2026-10-06** to balance answer keys across A–D. Option letters in this review sheet are as reviewed and may no longer match; the `.json` is current.

**Date:** 2026-09-22
**Status:** Awaiting review. Machine-readable source: `maths-batch-02.json`.
**Composition:** 9 easy / 3 moderate / 3 difficult, all maths. 5 numeric, 10 MCQ.

**Why maths only.** The subject split is an open question — the institute's own paper is ~65%
maths with no science (see `legacy-iq-2025.md`), while spec §1 mandates 5/5/5. Maths needs
60/20/20 under *either* answer, so this batch makes progress that cannot be wasted by the
decision. English and science wait on it.

**How to review:** for each item check three things — (1) is the key right, (2) is the tier
plausible for a 15-year-old applying to NDA coaching, (3) does any distractor look either
obviously wrong or accidentally defensible. Every key here was computed independently from the
stem in code as well as derived by hand; that catches arithmetic, not misjudged difficulty, which
is where your reading matters most.

---

## Easy (9)

| Ref | Skill | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|
| M-E-18 | average | 42, 35, 60, 28, 50 over five innings | **43** *(numeric)* | Dividing by 4 after miscounting the innings |
| M-E-19 | fraction-comparison | Largest of 3/5, 5/8, 2/3, 7/12 | **C** (2/3) | All four sit between 0.58 and 0.67, so eyeballing fails |
| M-E-20 | profit-and-loss | Buy ₹1,200, sell ₹1,500 | **C** (25%) | 300/1500 = 20% — profit over *selling* price |
| M-E-21 | hcf-and-lcm | Bells at 12 and 18 minutes | **36** *(numeric)* | Returning the HCF (6), or the product (216) |
| M-E-22 | area-and-perimeter | Fencing a 24 m × 16 m field | **B** (80 m) | 384 m — the area. "Enclose" is the only cue |
| M-E-23 | simple-interest | ₹5,000 at 8% for 3 years | **1200** *(numeric)* | Returning 6,200, the amount rather than the interest |
| M-E-24 | number-classification | Odd one out: 8, 27, 45, 125 | **C** (45) | — |
| M-E-25 | unit-conversion | 2.5 litres in millilitres | **C** (2,500) | Every distractor is a power-of-ten slip |
| M-E-26 | numeric-coding | CAT = 3-1-20, so DOG = ? | **A** (4-15-7) | O counted as 14; or shifting every letter |

**M-E-24 is the one to check for ambiguity.** Odd-one-out items usually fail by admitting a second
rule that picks a different answer. 8, 27 and 125 are cubes and 45 is not — and 45 is not a perfect
square either, so there is no alternative reading. I rejected an earlier version using 27/64/100/125
for exactly this reason: 64 is both a cube and a square, which makes two answers defensible.

**M-E-25 is very easy** (p ≈ 0.9) and is here as a floor check, not for discrimination.

## Moderate (3)

| Ref | Skill | Stem (abbreviated) | Key | Why moderate |
|---|---|---|---|---|
| M-M-27 | ages | Father 3× son; in 10 years, 2× | **B** (10) | Two relationships at two points in time, held together |
| M-M-28 | probability | 4 red, 6 blue — P(red)? | **A** (2/5) | 2/3 is offered: red-to-blue used where the total belongs |
| M-M-29 | number-series | 5, 11, 23, 47, 95, ___ | **D** (191) | ×2+1, and the differences double — both routes give 191 |

**M-M-29 has a property worth keeping.** Read as ×2+1 or as doubling differences (6, 12, 24, 48, 96),
the series converges on 191 either way. A candidate who finds a valid route is not punished for
finding the one the author didn't have in mind — which is the usual quiet unfairness in series items.

## Difficult (3)

| Ref | Skill | Stem (abbreviated) | Key | Why difficult |
|---|---|---|---|---|
| M-D-30 | combined-rates | Pipe fills in 4 h, leak empties in 6 h | **12** *(numeric)* | One rate is negative; adding gives 2.4 h, faster than the pipe alone |
| M-D-31 | percentage-change-chain | +20% then −20% | **A** (4% less) | "The same" is the intuitive answer; the second base has moved |
| M-D-32 | reverse-percentage | 20% discount, still 20% profit on ₹2,000 | **3000** *(numeric)* | Two chained percentages on different bases, run backwards |

**M-D-31's arithmetic is trivial and it is still the hardest item here.** 1.2 × 0.8 = 0.96 is
one multiplication. The difficulty is entirely in noticing that the second percentage applies to
an already-inflated price. That is what we want a difficult item to be made of — not longer sums.

**M-D-30 is numeric on purpose.** The characteristic error yields 2.4 hours, which is faster than
the pipe with no leak at all. Seeing 2.4 and 12 side by side in an option list would prompt the
sanity check the item is trying to measure.

---

## Verification

- All 15 keys recomputed from the stem in code, independent of the working in the rationales.
  `M-D-30` needed exact rational arithmetic to confirm — in floating point `1/(1/4 − 1/6)` gives
  11.999999999999998, so the naive check flagged it. The answer is exactly 12.
- `npm run items:lint` → 45 items, **0 errors, 0 warnings** across all three batches.
- New lint check this batch: two options that read differently but mean the same quantity. While
  authoring M-M-28 I nearly shipped `2/3` and `4/6` as separate options — equal values, so they are
  eliminated together, and had one been the key the item would have had two right answers. Proved
  it goes red against exactly that case before trusting it.

## Bank after this batch

```
maths     easy 20   moderate 7   difficult 5        (target 60 / 20 / 20)
english   easy  5   moderate 2   difficult 1
science   easy  3   moderate 1   difficult 1
                                    45 items, 15 live
```

30 items sit at `status='review'` and are not drawable. To promote this batch once reviewed:

```
npm run items:seed -- --live --file maths-batch-02.json
```

---

## Class tags (2026-09-27)

`taught_in` is the class in which the content is first taught (NCERT sequence, checked against the
Maharashtra board where they differ); an admit to class N draws `taught_in ≤ N−1`. 6 is the floor
and means open to every admit. Raised tags are a curriculum judgement — overrule in the `.json`
and re-run `npm run items:lint`.

| Ref | taught_in | Why |
|---|---|---|
| M-E-18 | 7 | mean — Class 7 Data Handling |
| M-E-19 | 6 | reasoning or everyday content; open to every admit |
| M-E-20 | 7 | profit per cent — Class 7 Comparing Quantities |
| M-E-21 | 6 | reasoning or everyday content; open to every admit |
| M-E-22 | 6 | reasoning or everyday content; open to every admit |
| M-E-23 | 7 | simple interest — Class 7 Comparing Quantities |
| M-E-24 | 8 | recognising perfect cubes — Class 8 Cubes and Cube Roots |
| M-E-25 | 6 | reasoning or everyday content; open to every admit |
| M-E-26 | 6 | reasoning or everyday content; open to every admit |
| M-M-27 | 8 | ages as a linear equation — Class 8 |
| M-M-28 | 8 | single-draw probability — Class 8 Data Handling (chance and probability) |
| M-M-29 | 6 | reasoning or everyday content; open to every admit |
| M-D-30 | 8 | fill and leak rates — Class 8 inverse proportion |
| M-D-31 | 8 | successive percentage change — Class 8 Comparing Quantities |
| M-D-32 | 8 | discount and profit on marked price — Class 8 Comparing Quantities |
