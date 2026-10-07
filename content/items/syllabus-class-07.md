# Syllabus batch — Class 7 content (for admits to Class 8) — 30 items

**Date:** 2026-10-07
**Status:** Signed off by the user 2026-10-07 and promoted with
`npm run items:seed -- --live --file syllabus-class-07.json`.
**Composition:** maths 15, science 15; each 9 easy / 3 moderate / 3 difficult. 9 numeric, 21 MCQ.
Every item: `part: syllabus`, `term: 1`, `taught_in: 7`.

**Admits to Class 8 are on the 30-question paper.** Their 15 extra parent
sample questions are in `content/parent-pack/sample-papers.json`.

## 1. Sign off the first-term chapters

Admits to Class 8 joining in April 2027 are in Class 7 now, on NCERT's new books. *Ganita Prakash*
7 is printed in two parts by term; *Curiosity* 7 is one book, and the 2026–27 half-yearly covers
its chapters 1–6.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Ganita Prakash* 7, Part 1 | 1 Large Numbers Around Us · 2 Arithmetic Expressions · 3 A Peek Beyond the Point · 4 Expressions using Letter-Numbers · 5 Parallel and Intersecting Lines · 6 Number Play · 7 A Tale of Three Intersecting Lines | Part 1 ch. 8 (Working with Fractions; one source leaves it out of the half-yearly) and Part 2 |
| *Curiosity* 7 | 2 Exploring Substances: Acidic, Basic and Neutral · 3 Electricity: Circuits and their Components · 4 The World of Metals and Non-metals · 5 Changes around Us: Physical and Chemical | 1 (an introduction), **6 Adolescence** (in the half-yearly, left out by choice — add it back if you want it tested), 7–13 |

## 2. The keys

**16 of the 30 keys were recomputed in code**: every calculable maths item and the cells-in-series
item. **The other 14 need a reader**: all science items except S7-M-10. Keys across A–D: maths A 3 ·
B 2 · C 2 · D 2; science A 3 · B 4 · C 3 · D 4. `items:lint` is clean after rewriting the options of
S7-D-13, S7-M-12 and S7-E-09, whose correct answers stood out by length.

## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| M7-E-01 | 1 | easy | 3,05,00,000 in words | **A** Three crore five lakh |
| M7-E-02 | 1 | easy | Lakhs in a crore | **100** |
| M7-E-03 | 2 | easy | 18 − 3 × 4 + 2 | **8** |
| M7-E-04 | 2 | easy | 5 × (6 − 2) − 3 | **D** 17 |
| M7-E-05 | 3 | easy | Largest of 0.7, 0.65, 0.709, 0.69 | **C** 0.709 |
| M7-E-06 | 3 | easy | 2.5 + 0.75 | **3.25** |
| M7-E-07 | 4 | easy | 2a + b for a = 3, b = 5 | **11** |
| M7-E-08 | 5 | easy | Vertically opposite to 65° | **B** 65° |
| M7-E-09 | 6 | easy | Odd + odd is always | **B** even |
| M7-M-10 | 5 | moderate | Same-side interior angle to 70° | **A** 110° |
| M7-M-11 | 7 | moderate | Third angle with 50° and 60° | **70** |
| M7-M-12 | 4 | moderate | Perimeter of a square of side s | **C** 4s |
| M7-D-13 | 7 | difficult | Which lengths form a triangle | **D** 5, 6, 10 |
| M7-D-14 | 2 | difficult | Same as 7 × 48 − 7 × 8 | **A** 7 × 40 |
| M7-D-15 | 4 | difficult | Pen = 2x + 3, x = 6; two pens | **30** |

## Science

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| S7-E-01 | 2 | easy | Blue litmus in lemon juice | **A** Red |
| S7-E-02 | 2 | easy | Which is basic | **D** Soap solution |
| S7-E-03 | 2 | easy | Turmeric turns red in | **B** a basic solution |
| S7-E-04 | 3 | easy | What a switch does | **D** Opens or closes the circuit |
| S7-E-05 | 3 | easy | Good conductor | **A** Copper |
| S7-E-06 | 4 | easy | Property for drawing wires | **D** Ductility |
| S7-E-07 | 4 | easy | Magnesium oxide turns red litmus blue | **A** basic |
| S7-E-08 | 5 | easy | Which is a physical change | **B** Melting ice |
| S7-E-09 | 5 | easy | Rusting needs | **C** both air and water |
| S7-M-10 | 3 | moderate | Three 1.5 V cells in series | **4.5** |
| S7-M-11 | 2 | moderate | Neutralise acidic soil | **B** Quicklime |
| S7-M-12 | 4 | moderate | Why sodium is kept in kerosene | **C** Reacts vigorously with air and water |
| S7-D-13 | 5 | difficult | Gas from baking soda + vinegar | **C** Carbon dioxide |
| S7-D-14 | 3 | difficult | Two bulbs in series, one fuses | **B** It goes out |
| S7-D-15 | 5 | difficult | Dissolving sugar vs burning sugar | **D** Physical; chemical |
