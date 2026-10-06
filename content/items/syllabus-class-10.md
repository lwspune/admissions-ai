# Syllabus batch — Class 10 content (for admits to Class 11) — 30 items

**Date:** 2026-10-07
**Status:** Awaiting review. Seeded at `review`; nothing here is drawn until promoted with
`npm run items:seed -- --live --file syllabus-class-10.json`.
**Composition:** maths 15, science 15; each 9 easy / 3 moderate / 3 difficult. 9 numeric, 21 MCQ.
Every item: `part: syllabus`, `term: 1`, `taught_in: 10`.

**When this goes live, admits to Class 11 move to the 30-question paper**, and the parent pack
must move with them: its 15 extra Class 11 sample questions are written and waiting in
`content/parent-pack/pending-class-11.json`, to be merged into `sample-papers.json` in the same
step (the build refuses a 15-question Class 11 sample once the class is on 30).

## 1. Sign off the first-term chapters

Admits to Class 11 joining in April 2027 are in Class 10 now, on the **older NCERT books**: Class
10's new book arrives only in 2027–28. A published 2026–27 half-yearly syllabus covers Maths
chapters 1–8 and, in Science, Chemical Reactions, Acids Bases and Salts, Life Processes, Control and
Coordination, Light and Electricity in full, plus parts of Metals and Non-metals and of
Reproduction. The partial chapters are left out, as with Class 9: the fair direction.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Mathematics* 10 | 1 Real Numbers · 2 Polynomials · 3 Pair of Linear Equations in Two Variables · 4 Quadratic Equations · 5 Arithmetic Progressions · 6 Triangles · 7 Coordinate Geometry · 8 Introduction to Trigonometry | 9–14 |
| *Science* 10 | 1 Chemical Reactions and Equations · 2 Acids, Bases and Salts · 5 Life Processes · 6 Control and Coordination · 9 Light – Reflection and Refraction · 11 Electricity | 3, 4, 7, 8, 10, 12, 13 |

## 2. The keys

**21 of the 30 keys were recomputed in code**, independently of the authored answer: every maths
item but one, and every science item with a calculation. All 21 match. **The other 9 need a
reader**: M10-E-02 (which number is irrational) and the factual science items S10-E-01 to S10-E-06,
S10-E-09 and S10-M-12.

Keys across A–D: maths A 3 · B 3 · C 2 · D 3; science A 3 · B 3 · C 2 · D 3. `items:lint` is clean.
The lint caught, before this sheet was written, a stem repeating a Class 9 item word for word and an
option list where the key was the only two-digit number; both were rewritten.

## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|---|
| M10-E-01 | 1 | easy | HCF 6, LCM 180, one number 36; the other | **30** *(numeric)* | 5 — LCM ÷ 36, skipping the HCF |
| M10-E-02 | 1 | easy | Which cannot be written as p/q | **C** 3 + √5 | √49 — a root that is rational |
| M10-E-03 | 2 | easy | Zeroes of x² − 9x + 20 | **A** 4 and 5 | −4 and −5 — signs flipped |
| M10-E-04 | 2 | easy | Sum of zeroes of 2x² − 8x + 3 | **B** 4 | 3/2 — the product of the zeroes |
| M10-E-05 | 3 | easy | x + y = 10, x − y = 4; x | **7** *(numeric)* | 3 — that is y |
| M10-E-06 | 4 | easy | Real roots of x² + 4x + 5 = 0 | **C** None | Equal roots — discriminant misjudged |
| M10-E-07 | 5 | easy | 10th term of 3, 7, 11, … | **39** *(numeric)* | 43 — one step too many |
| M10-E-08 | 7 | easy | Distance (−2, 3) to (4, −5) | **D** 10 | 14 — adding; 100 — no square root |
| M10-E-09 | 8 | easy | sin 30° + cos 60° | **B** 1 | √3/2 — sin 60° and sin 30° confused |
| M10-M-10 | 5 | moderate | Sum of 20 terms of 2, 5, 8, … | **610** *(numeric)* | 1220 — not halving |
| M10-M-11 | 6 | moderate | DE ∥ BC, AD 3, DB 6, AE 4; EC | **D** 8 cm | 2 cm — ratio inverted |
| M10-M-12 | 8 | moderate | tan A = 3/4; sin A | **A** 3/5 | 4/5 — that is cos A |
| M10-D-13 | 4 | difficult | Consecutive integers with product 306 | **17** *(numeric)* | — |
| M10-D-14 | 7 | difficult | Ratio in which (−1, 6) divides (−3, 10)–(6, −8) | **A** 2 : 7 | 7 : 2 — reversed |
| M10-D-15 | 3 | difficult | Digits sum to 9; +27 reverses them | **B** 36 | 63 — the reversed number |

## Science

| Ref | Ch | Level | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|---|
| S10-E-01 | 1 | easy | Fe + CuSO₄ → FeSO₄ + Cu | **C** Displacement | Double displacement |
| S10-E-02 | 2 | easy | pH 2 | **A** Strongly acidic | Weakly acidic — scale direction |
| S10-E-03 | 2 | easy | Baking soda | **D** Sodium hydrogencarbonate | Sodium carbonate — washing soda |
| S10-E-04 | 5 | easy | Where digested food is absorbed | **B** Small intestine | Large intestine — water |
| S10-E-05 | 6 | easy | Hormone controlling blood sugar | **D** Insulin | Thyroxine — metabolism |
| S10-E-06 | 9 | easy | Rear-view mirror | **D** Convex | Concave — shaving mirror |
| S10-E-07 | 11 | easy | 0.5 A at 6 V; resistance | **12** *(numeric)* | 3 — multiplying |
| S10-E-08 | 11 | easy | 4 Ω and 6 Ω in series | **B** 10 Ω | 2.4 Ω — the parallel answer |
| S10-E-09 | 1 | easy | Burning magnesium leaves | **A** Magnesium oxide | Hydroxide — needs water |
| S10-M-10 | 11 | moderate | Two 6 Ω in parallel | **3** *(numeric)* | 12 — the series answer |
| S10-M-11 | 9 | moderate | Power of a 50 cm convex lens | **2** *(numeric)* | 0.02 — centimetres not converted |
| S10-M-12 | 6 | moderate | Hand pulled from heat before pain | **A** Reflex, spinal cord | Voluntary, brain |
| S10-D-13 | 9 | difficult | Object 30 cm, concave f = 20 cm; image | **B** 60 cm in front | 12 cm — reciprocals added |
| S10-D-14 | 11 | difficult | 4 A at 220 V for 10 min; kJ | **528** *(numeric)* | 8.8 — minutes not converted |
| S10-D-15 | 2 | difficult | 10 mL base : 8 mL acid; acid for 25 mL | **C** 20 mL | 31.25 mL — ratio inverted |

## 3. The parent pack's extra Class 11 sample questions

Waiting in `content/parent-pack/pending-class-11.json`: 5 English basics, 5 maths and 5 science
from the chapters above. All 8 calculable keys were recomputed in code and the lint is clean. They
go live with this batch.
