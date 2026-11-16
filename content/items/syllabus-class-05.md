# Syllabus batch — Class 5 content (for admits to Class 6) — 30 items

**Date:** 2026-11-16
**Status:** for review. Promoted with `npm run items:seed -- --live --file syllabus-class-05.json`
once signed off.
**Composition:** maths 15, science (EVS) 15; each 9 easy / 3 moderate / 3 difficult. 7 numeric, 23 MCQ.
Every item: `part: syllabus`, `term: 1`, `taught_in: 5`. EVS shows as "Science", by the user's choice.

Admits to class 6 go on the 30-question paper with this batch and `basics-batch-03` (with the 39
items moved to class 5, listed there). Their parent sample paper (30 questions, `P6-*`) is in
`content/parent-pack/sample-papers.json`, with Hindi in `sample-papers.hi.json`; parents get it
with its answers, so please read it with this sheet.

## 1. Sign off the first-term chapters

Admits to class 6 joining in April 2027 are in class 5 now, on NCERT's new books: *Maths Mela* 5
(first edition June 2025) and *Our Wondrous World* 5 (July 2025), both reprinted for 2026–27. The
old *Math-Magic* and *Looking Around* were last reprinted for 2024–25.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Maths Mela* 5 | 1 We the Travellers — I · 2 Fractions · 3 Angles as Turns · 4 We the Travellers — II · 5 Far and Near | 6–15 |
| *Our Wondrous World* 5 | 1 Water — The Essence of Life · 2 Journey of a River · 3 The Mystery of Food | 4–10 |

**Why these, and what is less certain than for class 6.** No 2026–27 school split-up I could read
gives a clean half-yearly list for these new books.
- **Maths:** TAFS's weekly plan follows book order, with chapters 1–5 done by its late-August
  mid-term (chapter 5 runs into September) and chapter 7 in October. Tiwari Academy says the
  half-yearly is chapters 1–7. So 1–5 is safe on both; 6 (The Dairy Farm) and 7 (Shapes and
  Patterns) could be added if you want.
- **EVS:** Balvikas (Panipat) teaches out of book order (ch. 1, 2, 9, 6, 3 before October). Book
  order would be 1–5. Chapters 1–3 are in both. Chapters 4–6 are about school, the country and
  unique places, which is social studies rather than science anyway.

Hindi chapter titles are from the contents pages of NCERT's *गणित मेला* 5 (`ehmm1ps`) and *हमारा
अद्भुत संसार* 5 (`ehev1ps`), and the Hindi terms from those books' chapters.

**Kept inside what the chapters teach:** no degrees (angles are turns and right angles), no number
past 99,999 (no lakhs), no decimals, and the EVS book's own words (water vapour, not evaporation).

## 2. The keys

**11 of the 30 keys were recomputed in code**: every calculable maths item. **The other 19 need a
reader**: M5-E-01 (reading a number), M5-E-05, M5-E-06, M5-D-13 (fractions and turns, checked by
hand) and all 15 science items. Keys across A–D: maths A 2 · B 2 · C 3 · D 1 (7 numeric); science
A 4 · B 4 · C 4 · D 3.

Worth a second look:
- **S5-E-03** (all the world's water in a glass: fresh water is about a teaspoon) is the book's own
  picture, so it tests whether the chapter was read.
- **S5-D-13** (oil on pickles keeps air out) and **S5-D-15** (ghee keeps because its water is gone)
  rest on the book's line that microbes need moisture, air and the right temperature. The book asks
  the ghee question itself but leaves the answer to the class.
- **In the Hindi:** "tributary" (सहायक नदियाँ), "delta" (डेल्टा) and "acute angle" (न्यून कोण) did not
  come out of the Hindi PDFs' text cleanly; these are NCERT's usual terms. Please check them.

## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| M5-E-01 | 1 | easy | 45,207 in words | **A** Forty-five thousand two hundred seven |
| M5-E-02 | 1 | easy | 6,782 to the nearest hundred | **6800** |
| M5-E-03 | 1 | easy | Greatest of 38,901 · 39,018 · 38,999 · 39,009 | **B** 39,018 |
| M5-E-04 | 2 | easy | Fraction equal to 1/2 | **D** 3/6 |
| M5-E-05 | 2 | easy | 1/3 or 1/2 of same-size bars | **B** 1/2 |
| M5-E-06 | 3 | easy | A quarter turn makes | **A** a right angle |
| M5-E-07 | 3 | easy | Quarter turns in a full turn | **4** |
| M5-E-08 | 4 | easy | 4,325 + 2,148 | **6473** |
| M5-E-09 | 5 | easy | Centimetres in 3 m | **300** |
| M5-M-10 | 1 | moderate | Rounds to 5,000 at the nearest thousand | **C** 4,780 |
| M5-M-11 | 4 | moderate | 49 + 50 + 51 without adding one by one | **150** |
| M5-M-12 | 5 | moderate | 2 m 35 cm in cm | **235** |
| M5-D-13 | 2 | difficult | 2/8 of a pizza or 1/4 of the same size | **C** both the same |
| M5-D-14 | 4 | difficult | Town A 1,855 km, town B 2,310 km, same road | **455** |
| M5-D-15 | 3 | difficult | Minute hand at 12, three quarter turns clockwise | **C** 9 |

## Science (EVS)

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| S5-E-01 | 1 | easy | Water cooled in a freezer turns into | **A** ice |
| S5-E-02 | 1 | easy | Which holds salty water | **C** The sea |
| S5-E-03 | 1 | easy | Earth's water in a glass: fresh water | **B** about a teaspoon |
| S5-E-04 | 1 | easy | The Sun's heat turns sea and river water into | **D** water vapour |
| S5-E-05 | 2 | easy | Streams that join a big river | **C** tributaries |
| S5-E-06 | 2 | easy | Flows all year round | **D** perennial |
| S5-E-07 | 2 | easy | Water stored behind a dam | **A** reservoir |
| S5-E-08 | 3 | easy | Tiny living things that spoil food | **D** microbes |
| S5-E-09 | 3 | easy | Chillies dried in the Sun so they | **B** do not spoil |
| S5-M-10 | 3 | moderate | Drying stops microbes by taking away | **B** moisture |
| S5-M-11 | 2 | moderate | River spreads into many streams at the sea | **C** delta |
| S5-M-12 | 1 | moderate | Drops inside a bag of water in the Sun | **A** the vapour cools |
| S5-D-13 | 3 | difficult | Oil on pickles helps by | **B** keeping air away |
| S5-D-14 | 2 | difficult | Why rivers flow to the sea | **A** higher to lower ground |
| S5-D-15 | 3 | difficult | Why ghee keeps longer than butter | **C** no water for microbes |
