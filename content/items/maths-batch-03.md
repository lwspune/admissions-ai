# Maths Batch 03 — 15 items

**Date:** 2026-09-23
**Status:** Awaiting review. Machine-readable source: `maths-batch-03.json`.
**Composition:** 0 easy / 7 moderate / 8 difficult. 8 numeric, 7 MCQ.

**No easy items on purpose.** Maths easy already holds 20 — the deepest stratum in the bank — while
maths difficult held 5, the thinnest. This batch takes maths to **20 / 14 / 13**. Easy remains 40
short of its 60 target and will need its own batches later, but it was not where the variety was
scarce.

**Unlike the science and English batches, every key here is machine-checkable**, and all fifteen
were recomputed from the stem in code before this document was written.

---

## Moderate (7)

| Ref | Skill | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|
| M-M-33 | weighted-average | 8 kg at ₹40 mixed with 12 kg at ₹60 | **52** *(numeric)* | Plain average 50 — ignores more of the dearer rice |
| M-M-34 | average | Five numbers avg 20; one replaced by 35, avg 23 | **A** 20 | 15 — the *change* in the total, taken for the number |
| M-M-35 | interest-comparison | CI minus SI, ₹10,000 at 10%, 2 years | **100** *(numeric)* | Needs both formulas; answer is the gap, not either |
| M-M-36 | relative-speed | Boat 12 km/h, river 3 km/h, 30 km downstream | **A** 2 hours | 2½ h — dividing by 12, ignoring the current |
| M-M-37 | percentage-of-a-percentage | 60% boys, 25% of boys play football | **A** 15% | 85% (adding) or 35% (subtracting) — same-base error |
| M-M-38 | sets-and-overlap | 40 tea, 30 coffee, 12 both | **58** *(numeric)* | 70 — adding without removing the double count |
| M-M-39 | pattern-rule | 2\*3=13, 3\*4=25, 4\*5=41 | **A** 61 | Sum of squares; three examples given so one rule fits all |

**M-M-39 gives three worked examples deliberately.** With only one, several rules fit and the item
would have no defensible answer — a failure mode worth avoiding by construction rather than by luck.

## Difficult (8)

| Ref | Skill | Stem (abbreviated) | Key | Why difficult |
|---|---|---|---|---|
| M-D-40 | successive-discounts | 20% then 10% off ₹2,000, as one discount | **28** *(numeric)* | 30 (adding) is seductive; the second applies to a reduced price |
| M-D-41 | speed-distance-time | 180 m train at 54 km/h crosses a bridge in 20 s | **120** *(numeric)* | Unit conversion *and* the train's own length in the distance |
| M-D-42 | time-and-work | A (12 d) and B (18 d); A leaves after 4 days | **A** 8 | Three stages; an error at any one still gives a whole number |
| M-D-43 | mixture-replacement | 40 L milk, 4 L replaced twice | **32.4** *(numeric)* | 32 — treating the second scoop as pure milk |
| M-D-44 | average | 8 boys avg 45 kg; two join, avg 47 kg | **55** *(numeric)* | Asks for a sub-group average; stopping at 110 is common |
| M-D-45 | lcm-with-remainder | Smallest number leaving 3 on ÷6, ÷8, ÷12 | **27** *(numeric)* | Remainder must be set aside, then restored; 24 is the near-miss |
| M-D-46 | probability | 3 red, 5 blue, two drawn without replacement | **A** 3/28 | 9/64 is the *with*-replacement answer |
| M-D-47 | profit-and-loss | Two watches at ₹960, +20% and −20% | **A** a loss of 4% | The symmetry argues loudly for "no profit or loss" |

**M-D-47 is the best item in the batch.** Equal percentages on unequal cost prices do not cancel:
the 20% lost is computed on the dearer watch, so the trader loses overall. "No profit or loss" is
what the figures *look* like they say.

**M-D-46's distractor B is doing real work.** "Without replacement" changes both the numerator and
the denominator of the second fraction; candidates commonly adjust one or neither, and 9/64 is what
you get from adjusting nothing.

---

## Verification

- All 15 keys recomputed from the stem in code. Three came back as float noise —
  `100.00000000000182`, `27.999999999999993`, `32.400000000000006` — and were then confirmed exactly
  with integer arithmetic: `100`, `28%`, `32.4`. This is the fourth batch where floating point has
  flagged a correct key; the check is worth keeping precisely because it forces the second look.
- `npm run items:lint` → 105 items, 0 errors, 0 warnings.
- Exposure over 2,000 draws: 2,000 distinct papers, no item on every paper, most exposed 32%.

## Bank after this batch

```
maths     easy 20   moderate 14   difficult 13     (target 60 / 20 / 20)
english   easy 10   moderate  7   difficult  6
science   easy 15   moderate 10   difficult 10
                                   105 items of 300
```

Thinnest now: **english difficult (6)** and **english moderate (7)**. Largest absolute gap:
**english easy (50 short)**, then maths easy (40 short) and science easy (45 short).

To promote this batch once reviewed:

```
npm run items:seed -- --live --file maths-batch-03.json
```
