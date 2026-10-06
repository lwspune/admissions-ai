# Syllabus batch — Class 9 content (for admits to Class 10) — 30 items

**Date:** 2026-10-06
**Status:** Signed off by the user 2026-10-07 (chapter list, keys and S9-D-14 accepted as written); promoted with
`npm run items:seed -- --live --file syllabus-class-09.json`.
**Composition:** maths 15, science 15; each 9 easy / 3 moderate / 3 difficult (three times what a
paper draws: 3/1/1). 8 numeric, 22 MCQ. Every item: `part: syllabus`, `term: 1`, `taught_in: 9`.

**When this goes live, admits to Class 10 move to the 30-question paper.** The lint and `/items`
both report Class 10 as ready with this batch; every other class stays on 15 questions.

## 1. Sign off the first-term chapters

Admits to Class 10 joining in April 2027 are in Class 9 now, on NCERT's new books (2026–27). A
candidate tested in October has covered roughly the first half of the year, so syllabus questions
come only from these chapters. **This list is the decision to check first**; every item below was
written against it.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Ganita Manjari* 9 | 1 Orienting Yourself: The Use of Coordinates · 2 Introduction to Linear Polynomials · 3 The World of Numbers · 4 Exploring Algebraic Identities · 5 I'm Up and Down, and Round and Round (circles) | 6–8 (perimeter and area, probability, sequences) and Part 2 (9–14) |
| *Exploration* 9 | 2 Cell – The Building Block of Life · 3 Tissues in Action · 4 Describing Motion Around Us · 5 Exploring Mixtures and their Separation · 6 How Forces Affect Motion | 1 (an introduction to secondary science, nothing to test) and 7–13 |

The maths cut follows a published 2026–27 half-yearly syllabus (chapters 1–5), narrower than the
book's Part 1 (1–8). The science cut is the usual split of the 13 chapters. Both err towards
fewer chapters: the fair direction for a mid-year candidate.

## 2. The keys

**23 of the 30 keys were recomputed in code** from the stem, independently of the authored answer:
every maths item and every science item with a calculation. All 23 match. **The other 7 are
factual science** (S9-E-06 to S9-E-09, S9-M-10 to S9-M-12) — these need a reader's eye.

Keys across A–D: maths A 2 · B 3 · C 3 · D 3; science A 3 · B 3 · C 4 · D 2. `items:lint` is clean;
four mild warnings remain where the key is the longest option by one to six characters.

## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|---|
| M9-E-01 | 1 | easy | Quadrant of (−3, 5) | **B** Second | Fourth — signs swapped |
| M9-E-02 | 1 | easy | Distance (1, 2) to (4, 6) | **5** *(numeric)* | 7 — adding the differences |
| M9-E-03 | 1 | easy | Midpoint of (2, −4) and (8, 6) | **D** (5, 1) | (10, 2) — forgetting to halve |
| M9-E-04 | 2 | easy | Zero of 3x − 12 | **C** 4 | −4 — sign slip |
| M9-E-05 | 2 | easy | p(−3) for p(x) = 5 − 2x | **11** *(numeric)* | −1 — dropping the minus of −3 |
| M9-E-06 | 3 | easy | Which is irrational: √16, 0.75, 22/7, √12 | **D** √12 | 22/7 — mistaken for π |
| M9-E-07 | 3 | easy | Which fraction terminates: 1/3, 2/7, 7/20, 5/6 | **C** 7/20 | Denominator test not known |
| M9-E-08 | 4 | easy | (x + 5)² | **B** x² + 10x + 25 | x² + 25 — missing middle term |
| M9-E-09 | 5 | easy | Arc subtends 80° at centre; angle on the circle | **A** 40° | 160° — doubling the wrong way |
| M9-M-10 | 5 | moderate | Radius 10, chord 6 cm from centre; chord length | **16** *(numeric)* | 8 — stopping at the half-chord |
| M9-M-11 | 4 | moderate | 103 × 97 by an identity | **D** 9991 | 10009 — adding the 3² |
| M9-M-12 | 2 | moderate | Height 12 + 1.5w; weeks to reach 30 cm | **12** *(numeric)* | 20 — ignoring the starting height |
| M9-D-13 | 5 | difficult | Cyclic ABCD, ∠A = 2x + 10, ∠C = 3x − 5 | **B** 80° | 100° — that is ∠C |
| M9-D-14 | 4 | difficult | Factor of x² − 5x − 14 | **C** x + 2 | x + 7 / x − 2 — signs reversed |
| M9-D-15 | 1 | difficult | P divides A(2, 1)–B(8, 7) in 1 : 2 | **A** (4, 3) | (6, 5) — ratio read backwards |

## Science

| Ref | Ch | Level | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|---|
| S9-E-01 | 4 | easy | 4 m east then 3 m west; displacement | **B** 1 m east | 7 m — distance, not displacement |
| S9-E-02 | 4 | easy | 12 km then 8 km in two hours; average speed | **10** *(numeric)* | — |
| S9-E-03 | 4 | easy | 10 → 25 m/s in 5 s; acceleration | **D** 3 m/s² | 2 m/s² — starting speed over time |
| S9-E-04 | 6 | easy | Momentum of 2 kg at 3 m/s | **6** *(numeric)* | 5 — adding |
| S9-E-05 | 6 | easy | Force for 5 kg at 2 m/s² | **C** 10 N | 2.5 N — dividing |
| S9-E-06 | 2 | easy | Powerhouse of the cell | **D** Mitochondrion | Nucleus — "controls the cell" |
| S9-E-07 | 2 | easy | In plant cells, not animal cells | **C** Cell wall | Cell membrane — both have it |
| S9-E-08 | 3 | easy | Tissue carrying water up from roots | **A** Xylem | Phloem — carries food |
| S9-E-09 | 5 | easy | Separate sand from water | **A** Filtration | Evaporation — for dissolved solids |
| S9-M-10 | 2 | moderate | Raisins swell in water | **A** Osmosis | Sugar moving in — it moves out |
| S9-M-11 | 4 | moderate | Horizontal line on a velocity–time graph | **B** Constant velocity | Standing still — the position–time reading |
| S9-M-12 | 5 | moderate | Separate the dyes in black ink | **C** Chromatography | Filtration — cannot split a solution |
| S9-D-13 | 4 | difficult | From rest, 2 m/s² for 4 s; distance | **16** *(numeric)* | 32 — forgetting the half |
| S9-D-14 | 6 | difficult | 50 kg pushes 25 kg off at 2 m/s; recoil | **C** 1 m/s | 4 m/s — mass ratio inverted |
| S9-D-15 | 4 | difficult | 20 m/s, decelerates at 5 m/s²; stopping distance | **B** 40 m | 80 m — full speed for 4 s |

**S9-D-14 assumes chapter 6 covers conservation of momentum.** The chapter teaches momentum and
action–reaction; if your copy stops short of conservation, this item should move to term 2 or be
replaced.
