# Syllabus batch — Class 8 content (for admits to Class 9) — 30 items

**Date:** 2026-10-07
**Status:** Signed off by the user 2026-10-07 and promoted with
`npm run items:seed -- --live --file syllabus-class-08.json`.
**Composition:** maths 15, science 15; each 9 easy / 3 moderate / 3 difficult. 10 numeric, 20 MCQ.
Every item: `part: syllabus`, `term: 1`, `taught_in: 8`.

**Admits to Class 9 are on the 30-question paper.** Their 15 extra parent
sample questions are in `content/parent-pack/sample-papers.json`.

## 1. Sign off the first-term chapters

Admits to Class 9 joining in April 2027 are in Class 8 now, on NCERT's new books. *Ganita Prakash* 8
Part 1 is the first-term book; the 2026–27 half-yearly covers *Curiosity* 8 chapters 1–7.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Ganita Prakash* 8, Part 1 | 1 A Square and A Cube · 2 Power Play · 3 A Story of Numbers · 4 Quadrilaterals · 5 Number Play · 6 We Distribute, Yet Things Multiply · 7 Proportional Reasoning-1 | Part 2 (percentages, maps, inverse proportion, data and the rest) |
| *Curiosity* 8 | 2 The Invisible Living World · 3 Health: The Ultimate Treasure · 4 Electricity: Magnetic and Heating Effects · 5 Exploring Forces · 6 Pressure, Winds, Storms, and Cyclones · 7 Particulate Nature of Matter | 1 (an introduction) and 8–13 |

Chapter 3, A Story of Numbers, is listed on the parent sheet but has no question yet.

## 2. The keys

**16 of the 30 keys were recomputed in code**: every maths item but one and the two pressure
calculations. **The other 14 need a reader**: M8-E-06 (which quadrilateral) and every science item
except S8-E-07 and S8-D-13. Keys across A–D: maths A 2 · B 2 · C 2 · D 2; science A 3 · B 3 · C 4 ·
D 3. `items:lint` is clean after rewriting the options of S8-E-01, S8-M-10 and S8-D-15, and the stem
of M8-E-02, which echoed a published parent sample.
## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| M8-E-01 | 1 | easy | √196 | **14** |
| M8-E-02 | 1 | easy | Which is a perfect cube | **D** 64 |
| M8-E-03 | 2 | easy | 2⁵ | **C** 32 |
| M8-E-04 | 2 | easy | 3⁴ × 3² | **A** 3⁶ |
| M8-E-05 | 4 | easy | Fourth angle with 80°, 95°, 105° | **80** |
| M8-E-06 | 4 | easy | All sides equal, all angles 90° | **D** Square |
| M8-E-07 | 6 | easy | 6(a + 4) | **B** 6a + 24 |
| M8-E-08 | 7 | easy | 5 notebooks ₹120; 8 notebooks | **192** |
| M8-E-09 | 5 | easy | Divisible by 9 | **A** 2,718 |
| M8-M-10 | 6 | moderate | 52 × 48 by an identity | **2496** |
| M8-M-11 | 2 | moderate | (2³)² ÷ 2⁴ | **4** |
| M8-M-12 | 7 | moderate | ₹600 in 2 : 3; B's share | **C** ₹360 |
| M8-D-13 | 1 | difficult | Smallest multiplier to make 72 a square | **2** |
| M8-D-14 | 4 | difficult | Parallelogram ∠A = 70°; ∠B | **B** 110° |
| M8-D-15 | 7 | difficult | 180 km on 12 L; distance on 20 L | **300** |

## Science

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| S8-E-01 | 2 | easy | Turns milk into curd | **A** Bacteria |
| S8-E-02 | 2 | easy | Why yeast is used in bread | **B** It gives off carbon dioxide |
| S8-E-03 | 3 | easy | How a vaccine protects | **C** Trains the body to fight the germ |
| S8-E-04 | 4 | easy | A fuse works by the | **D** heating effect of current |
| S8-E-05 | 4 | easy | Electromagnet loses magnetism when | **B** current is switched off |
| S8-E-06 | 5 | easy | Non-contact force | **C** Magnetic force |
| S8-E-07 | 6 | easy | 200 N on 4 m² | **50** |
| S8-E-08 | 7 | easy | Particles farthest apart | **D** Gas |
| S8-E-09 | 7 | easy | Perfume spreads by | **A** diffusion |
| S8-M-10 | 5 | moderate | Grooved shoe soles | **C** Increase friction and grip |
| S8-M-11 | 6 | moderate | Wind blows from | **A** high to low pressure |
| S8-M-12 | 2 | moderate | Disease caused by a virus | **D** Common cold |
| S8-D-13 | 6 | difficult | 300 N on 0.5 m × 0.3 m | **2000** |
| S8-D-14 | 4 | difficult | Why the heater coil, not the copper, gets hot | **B** Much higher resistance |
| S8-D-15 | 7 | difficult | Sugar dissolves, level hardly rises | **C** Particles fill spaces |
