# Basics batch 01 — 15 English, 5 difficult maths — 20 items

**Date:** 2026-10-07
**Status:** Signed off by the user 2026-10-07 and promoted with
`npm run items:seed -- --live --file basics-batch-01.json`.
**Composition:** English 9 easy / 3 moderate / 3 difficult, all MCQ; maths 5 difficult (1 numeric),
`taught_in` 6 or 7. Every item: `part: basics`.

## Why these

- **English.** A 30-question paper takes 6 easy, 2 moderate and 2 difficult English items, from a
  bank of 10 / 7 / 6, so each easy item sat on about 60% of papers. This batch takes English to
  **19 / 10 / 9**: about 32%, 20% and 22%.
- **Difficult maths for class 8 admits.** They could draw only 2 (M-D-41 and M-D-45), so each was
  on half their papers. Five more at `taught_in` ≤ 7 make **7**.

Each item was checked against the parent samples of its skill, which parents hold with answers.
Eight first drafts were too close to one (the same target word, frame, series or argument form)
and were rewritten before this sheet; `content/items/README.md` now makes that reading a step.

## The keys

**The four calculable maths items and the letter series were recomputed in code** (lighthouses 7,
consecutive evens 16, tank 90, clock 100°, 1 March 2027 a Monday, EK). **The other 15 need a
reader**: the 14 English items besides the series, and nothing else. Keys across A–D: English A 4 ·
B 4 · C 4 · D 3; maths A 1 · B 1 · C 1 · D 1 plus one numeric. `items:lint` is clean (one mild
length warning on E-D-38, 44 characters against 43).

## English

| Ref | Level | Skill | Stem (abbreviated) | Key |
|---|---|---|---|---|
| E-E-24 | easy | synonym-in-context | "a meagre ration of rice" | **B** small |
| E-E-25 | easy | antonym | A generous person is the opposite of a ___ one | **A** miserly |
| E-E-26 | easy | subject-verb-agreement | The news from the front ___ good today | **C** is |
| E-E-27 | easy | preposition-usage | absent ___ the morning parade | **A** from |
| E-E-28 | easy | idiom-meaning | "a piece of cake" | **D** very easy |
| E-E-29 | easy | tense | while I ___ my homework, the lights went out | **B** was doing |
| E-E-30 | easy | analogy | Carpenter : wood :: tailor : ? | **C** cloth |
| E-E-31 | easy | odd-one-out | Mercury, Venus, Moon, Mars | **C** Moon |
| E-E-32 | easy | letter-coding | LAMP → PMAL; SHIP → ? | **A** PIHS |
| E-M-33 | moderate | sentence-completion | an account so ___ the investigators could not tell | **B** vague |
| E-M-34 | moderate | letter-series | AC, BE, CG, DI, ___ | **C** EK |
| E-M-35 | moderate | logical-deduction | Only those who passed may join; Karan is a member | **B** he has passed |
| E-D-36 | difficult | evaluating-an-argument | CCTV installed, reported thefts halved | **D** reporting made harder |
| E-D-37 | difficult | quantifier-logic | Some cadets are athletes; some athletes swim | **D** none follows |
| E-D-38 | difficult | supported-conclusion | One class of 40 → the whole academy | **A** one class may not represent it |

## Maths (all difficult)

| Ref | Taught | Skill | Stem (abbreviated) | Key |
|---|---|---|---|---|
| M-D-48 | 6 | hcf-and-lcm | Lighthouses every 6, 8, 12 s; coincidences in 3 minutes | **7** |
| M-D-49 | 7 | linear-equation | Three consecutive evens sum to 30 more than the smallest; largest | **C** 16 |
| M-D-50 | 6 | multi-step-arithmetic | Tank 3/5 full, 24 L out, 1/3 full; capacity | **D** 90 |
| M-D-51 | 6 | clock-angles | Angle between the hands at 4:40 | **A** 100° |
| M-D-52 | 6 | calendar-reasoning | 1 Jan 2027 a Friday; 1 March 2027 | **B** Monday |
