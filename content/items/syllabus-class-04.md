# Syllabus batch — Class 4 content (for admits to Class 5) — 30 items

**Date:** 2026-11-16
**Status:** for review. Promoted with `npm run items:seed -- --live --file syllabus-class-04.json`
once signed off.
**Composition:** maths 15, science (EVS) 15; each 9 easy / 3 moderate / 3 difficult. 6 numeric, 24 MCQ.
Every item: `part: syllabus`, `term: 1`, `taught_in: 4`. EVS shows as "Science", by the user's choice.

Admits to class 5 go on the 30-question paper with this batch and `basics-batch-04` (with the 35
items moved to class 4, listed there). Their parent sample paper (30 questions, `P5-*`) is in
`content/parent-pack/sample-papers.json`, with Hindi in `sample-papers.hi.json`; parents get it
with its answers, so please read it with this sheet.

## 1. Sign off the first-term chapters

Admits to class 5 joining in April 2027 are in class 4 now, on NCERT's new books: *Maths Mela* 4 and
*Our Wondrous World* 4, both first printed March 2025 and reprinted for 2026–27.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Maths Mela* 4 | 1 Shapes Around Us · 2 Hide and Seek · 3 Pattern Around Us · 4 Thousands Around Us · 5 Sharing and Measuring · 6 Measuring Length · 7 The Cleanest Village | 8–14 |
| *Our Wondrous World* 4 | 3 Nature Trail · 4 Growing up with Nature · 5 Food for Health | 1–2 (community and neighbourhood: social studies) and 6–10 |

**Source:** Halwasiya Vidyavihar's 2026–27 class 4 plan, which follows book order and names its
half-yearly portions outright: maths chapters 1–7, EVS chapters 1–5. That is one school, so it is
less certain than class 7's; chapters 6 (Aug) and 7 (Sep) are the latest in its term, and could be
dropped if you prefer the class 6 rule of "done by August".

Hindi chapter titles are from NCERT's *गणित मेला* 4 and *हमारा अद्भुत संसार* 4 (the chapter
openings and the unit notes, since the contents pages did not extract cleanly), and the terms
from those books.

**Kept inside what the chapters teach:** numbers to 9,999, halves and quarters only, metres and
centimetres (no km or mm), right angles (no degrees), adding and subtracting (no multiplication).

## 2. The keys

**10 of the 30 keys were recomputed in code**: every calculable maths item. **The other 20 need a
reader**: M4-E-05, M4-E-08, M4-M-11, M4-M-12, M4-D-15 (halves, shapes, views and odd-even, checked
by hand) and all 15 science items. Keys across A–D: maths A 2 · B 2 · C 3 · D 2 (6 numeric); science A 4 · B 4 · C 4 ·
D 3.

Worth a second look:
- **S4-D-13** (bees and flowers depend on each other) and **S4-D-15** (webbed footprints by a pond)
  go a step past the book's examples (the web of life; footprints in the mud). Say if they reach too
  far for a 9-year-old.
- **S4-E-03** uses "eagle"; the Hindi says चील, which is a kite. Both are birds of prey with sharp
  claws, but if you prefer गरुड़ or बाज़, say so.
- **In the Hindi:** "trunk" (सूँड़), "sunbird" (शकरखोरा) and "kingfisher" (किलकिला, in a sample)
  did not come out of the Hindi PDFs' text; these are the usual words.

## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| M4-E-01 | 4 | easy | "four thousand three hundred six" | **B** 4,306 |
| M4-E-02 | 4 | easy | Biggest of 5,099 · 5,909 · 5,990 · 5,900 | **C** 5,990 |
| M4-E-03 | 3 | easy | Which is odd | **C** 27 |
| M4-E-04 | 3 | easy | Even numbers from 1 to 10 | **5** |
| M4-E-05 | 5 | easy | A roti in 4 equal parts: each is | **A** a quarter |
| M4-E-06 | 5 | easy | Quarters in a whole | **4** |
| M4-E-07 | 6 | easy | Centimetres in 1 m | **100** |
| M4-E-08 | 1 | easy | No corners, no straight edges | **D** sphere |
| M4-E-09 | 7 | easy | 345 girls + 278 boys | **623** |
| M4-M-10 | 6 | moderate | Half a metre in cm | **50** |
| M4-M-11 | 5 | moderate | Same as one half | **B** two quarters |
| M4-M-12 | 2 | moderate | Round tin seen from above | **A** a circle |
| M4-D-13 | 7 | difficult | 612 children, 178 fewer | **434** |
| M4-D-14 | 1 | difficult | Straight edges of a cube | **C** 12 |
| M4-D-15 | 3 | difficult | Odd number of marbles, one more | **D** even |

## Science (EVS)

| Ref | Ch | Level | Stem (abbreviated) | Key |
|---|---|---|---|---|
| S4-E-01 | 3 | easy | Elephant picks up food with | **C** its trunk |
| S4-E-02 | 3 | easy | Sparrow's short, strong beak | **A** cracks seeds |
| S4-E-03 | 3 | easy | Eagle catches prey with | **D** sharp claws |
| S4-E-04 | 4 | easy | Neem leaves in grain pots | **A** keep insects away |
| S4-E-05 | 4 | easy | Natural dyes from | **B** flowers and leaves |
| S4-E-06 | 5 | easy | Most energy | **C** rice |
| S4-E-07 | 5 | easy | Pulses, milk, eggs help the body | **A** grow and build itself |
| S4-E-08 | 5 | easy | Jowar, ragi, bajra are | **D** millets |
| S4-E-09 | 5 | easy | All three food kinds in the right amounts | **B** balanced food |
| S4-M-10 | 3 | moderate | Sunbird's long, thin beak | **B** drinks nectar |
| S4-M-11 | 5 | moderate | Protects from diseases | **C** fruits and vegetables |
| S4-M-12 | 3 | moderate | Beak and claws tell us | **A** what it eats |
| S4-D-13 | 3 | difficult | Bees and flowers | **D** depend on each other |
| S4-D-14 | 5 | difficult | Only rice and potatoes: missing | **B** body-building and protective food |
| S4-D-15 | 3 | difficult | Webbed footprints by a pond | **C** a duck |
