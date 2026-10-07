# English batch 02 — language questions for the logic puzzles — 7 items

**Date:** 2026-10-07
**Status:** Signed off by the user 2026-10-07 and promoted with
`npm run items:seed -- --live --file english-batch-02.json`.
**Composition:** 1 easy / 2 moderate / 4 difficult, all MCQ, `taught_in` 6 — the same levels as
the seven items they replace.

## Why

Syllogisms, seating and ranking, and family-relation puzzles had been filed under English as
"logical deduction". They test deduction, not language, and the spec's English list (analogies,
odd one out, sentence completion, sequencing, error identification, reading) does not name them.
The user chose to replace them with language questions (2026-10-07). Analogies, odd one out,
series and codes stay: the spec names them.

**Retired, live until 2026-10-07** (`"status": "retired"` in their files; papers that drew them
still show them): E-E-06 syllogism · E-M-15 family relation · E-M-35 "only those who passed" ·
E-D-05 "every member attends" · E-D-19 race order · E-D-20 "not all cadets" · E-D-37 "some … some".
Until this batch is promoted, live English is 18 / 8 / 5, which still fills every paper (6 / 2 / 2).

`items:lint` now refuses a syllogism, logical-deduction, quantifier-logic or relationship-reasoning
skill in English. It cannot see a puzzle filed under another skill (E-D-05 was "inference"), so
the review still has to ask: does this need English, or only logic?

## The keys

All seven need a reader: none is calculable. Keys: A 1 · B 2 · C 1 · D 3, which leaves live English
at A 10 · B 9 · C 11 · D 8 once promoted. Lint clean; the highest word overlap with any parent
sample is 0.35 (the shared "Which part of this sentence has an error?").

| Ref | Level | Skill | Stem (abbreviated) | Key |
|---|---|---|---|---|
| E-E-39 | easy | one-word-substitution | A building where soldiers live | **D** barracks |
| E-M-40 | moderate | error-identification | "The captain asked us that why we were late" | **B** that why we were |
| E-M-41 | moderate | sentence-sequencing | pit, seeds, watering, shoots | **A** QRSP |
| E-D-42 | difficult | reading-inference | Officer waiting, fresh labels, floor still wet | **D** he knew the team was coming |
| E-D-43 | difficult | synonym-in-context | The colonel's remarks were pointed | **B** clearly aimed |
| E-D-44 | difficult | error-identification | "Hardly had the bus left the stop than it began" | **C** than it began to rain |
| E-D-45 | difficult | sentence-completion | Though the plan looked ___ on paper, it proved ___ | **D** sound … unworkable |

## The parent samples, rewritten with them

Nine samples were the same kinds of puzzle, all difficult; each is now a difficult language
question with the same answer letter, so every sheet keeps its spread of keys.

| Sample | Was | Now | Key |
|---|---|---|---|
| P8-E5 | Some pilots are engineers… | Error: "report at sharp 6 am" | **C** |
| P8-E10 | Asha 7th from left, 12th from right | Inference: Riya changes her white shoes | **B** expected rain and mud |
| P9-E5 | Five in a row, Tara in the middle | Tone: "Despite repeated warnings, the gate was again left unlocked" | **A** critical |
| P9-E10 | All rifles are cleaned weekly… | One word: speaks many languages | **B** polyglot |
| P10-E10 | No soldier is careless… | Error: "an useful piece of advice" | **B** |
| P11-E5 | All cadets wake at 5 am… | Meaning: two teams "so close" | **D** evenly matched |
| P11-E10 | P taller than Q… second tallest | Two blanks: rescue was ___, team's ___ | **C** dangerous … caution |
| P12-E5 | "only daughter of my mother" | Idiom: with a pinch of salt | **B** did not fully believe them |
| P12-E10 | Every pilot has passed… Arjun has not | Inference: dinner at 8 instead of 7.30 | **B** usually at 7.30 |
