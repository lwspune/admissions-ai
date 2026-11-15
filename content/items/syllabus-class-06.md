# Syllabus batch — Class 6 content (for admits to Class 7) — 30 items

**Date:** 2026-11-15
**Status:** for review. Promoted with `npm run items:seed -- --live --file syllabus-class-06.json`
once signed off.
**Composition:** maths 15, science 15; each 9 easy / 3 moderate / 3 difficult. 11 numeric, 19 MCQ.
Every item: `part: syllabus`, `term: 1`, `taught_in: 6`.

Admits to class 7 go on the 30-question paper with this batch and `basics-batch-02`. Their parent
sample paper (30 questions, `P7-*`) is in `content/parent-pack/sample-papers.json`, with Hindi in
`sample-papers.hi.json`; please read it with this sheet, because parents get it with its answers.

## 1. Sign off the first-term chapters

Admits to class 7 joining in April 2027 are in class 6 now, on NCERT's new books (*Ganita Prakash*
6 and *Curiosity* 6, since 2024–25). The first term was taken from Doon Public School's 2026–27
class 6 syllabus (CBSE, these books): maths chapters 1–5 and science chapters 1–6 before the Term I
examination; commercial sites agree on maths 1–5. The AEES 2026–27 split-up would have been a
second official source, but its site's certificate is revoked, so it was not read.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Ganita Prakash* 6 | 1 Patterns in Mathematics · 2 Lines and Angles · 3 Number Play · 4 Data Handling and Presentation · 5 Prime Time | 6–10 (Perimeter and Area, Fractions, Constructions, Symmetry, The Other Side of Zero) |
| *Curiosity* 6 | 2 Diversity in the Living World · 3 Mindful Eating: A Path to a Healthy Body · 4 Exploring Magnets · 5 Measurement of Length and Motion · 6 Materials Around Us | 1 (an introduction, left out as for class 7), 7–12 |

Hindi chapter titles are from the contents pages of NCERT's own *गणित प्रकाश* 6 and *जिज्ञासा* 6
(`fhgp1ps`, `fhcu1ps`), and the Hindi terms in the translations from those books' chapters.

## 2. The keys

**17 of the 30 keys were recomputed in code**: every maths item but M6-E-03 (a definition) and the
three numeric science items. **The other 13 need a reader**: M6-E-03 and the 12 science MCQs. Keys
across A–D: maths A 2 · B 2 · C 2 · D 1 (8 numeric); science A 3 · B 2 · C 4 · D 3 (3 numeric).

Worth a second look:
- **S6-E-05** (iodine → goitre). Deficiency diseases are in *Curiosity* 6 ch. 3 (scurvy, night
  blindness, goitre and rickets all appear in the Hindi edition's chapter).
- **S6-M-11** (transparent / translucent). The new book teaches it in ch. 6, Materials Around Us.
- **S6-D-13** (repulsion as the sure test of a magnet) and **S-D-42** in `basics-batch-02` rest on
  the same idea from two sides; one is syllabus, the other basics, so a paper can carry both.

## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| M6-E-01 | 1 | easy | Sum of the first six odd numbers | **36** |
| M6-E-02 | 1 | easy | Next triangular number after 15 | **B** 21 |
| M6-E-03 | 2 | easy | A 135° angle is | **D** obtuse |
| M6-E-04 | 2 | easy | North to south, clockwise, in degrees | **180** |
| M6-E-05 | 3 | easy | Which is a palindrome | **A** 12321 |
| M6-E-06 | 3 | easy | Digit sum of 4,072 | **13** |
| M6-E-07 | 4 | easy | Pictograph: 4½ symbols × 10 books | **45** |
| M6-E-08 | 5 | easy | Common multiple of 4 and 6 | **C** 24 |
| M6-E-09 | 5 | easy | Which pair is co-prime | **A** 8 and 15 |
| M6-M-10 | 1 | moderate | 10th square number | **100** |
| M6-M-11 | 5 | moderate | Divisible by 8 (all four divisible by 4) | **B** 5,136 |
| M6-M-12 | 2 | moderate | One-third of a straight angle | **60** |
| M6-D-13 | 5 | difficult | Multiples of both 4 and 6 up to 100 | **8** |
| M6-D-14 | 1 | difficult | First power of 2 above 1,000 | **C** 1,024 |
| M6-D-15 | 3 | difficult | Largest − smallest from 3, 0, 7, 5 | **4473** |

## Science

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| S6-E-01 | 2 | easy | Weak stem, climbs on a support | **C** Climber |
| S6-E-02 | 2 | easy | Parallel venation → roots | **A** Fibrous roots |
| S6-E-03 | 3 | easy | Iodine turns potato blue-black | **D** starch |
| S6-E-04 | 3 | easy | Rice, wheat, potatoes: main energy nutrient | **C** Carbohydrates |
| S6-E-05 | 3 | easy | Lack of iodine causes | **B** goitre |
| S6-E-06 | 4 | easy | Where pins cling to a bar magnet | **A** near its two ends |
| S6-E-07 | 4 | easy | Freely hung magnet rests | **D** north–south |
| S6-E-08 | 5 | easy | Millimetres in 5 cm | **50** |
| S6-E-09 | 6 | easy | Dissolves completely in water | **B** Sugar |
| S6-M-10 | 5 | moderate | A swing's motion | **C** Oscillatory |
| S6-M-11 | 6 | moderate | See clearly through | **D** Clear glass |
| S6-M-12 | 5 | moderate | Broken ruler, 3 cm to 11 cm | **8** |
| S6-D-13 | 4 | difficult | Sure test that a bar is a magnet | **A** it is pushed away |
| S6-D-14 | 5 | difficult | 3 m 40 cm in 20 cm pieces | **17** |
| S6-D-15 | 3 | difficult | Iodine positive and oily patch | **C** both starch and fat |
