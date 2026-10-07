# Syllabus batch — Class 11 content (for admits to Class 12) — 30 items

**Date:** 2026-10-07
**Status:** Signed off by the user 2026-10-07 and promoted with
`npm run items:seed -- --live --file syllabus-class-11.json`.
**Composition:** maths 15; science 15 (Physics 8, Chemistry 7, as decided: no Biology). Each
subject 9 easy / 3 moderate / 3 difficult. 13 numeric, 17 MCQ. Every item: `part: syllabus`,
`term: 1`, `taught_in: 11`.

**When this goes live, admits to Class 12 move to the 30-question paper.** The parent pack's 15
extra Class 12 sample questions wait in `content/parent-pack/pending-class-12.json`, to be merged
into `sample-papers.json` in the same step.

## 1. Sign off the first-term chapters

Admits to Class 12 joining in April 2027 are in Class 11 now, on the current NCERT books (no new
Class 11 books in 2026–27). One school's published 2026–27 breakup puts these chapters, and a few
more, in the half-yearly; this batch takes the part every source agrees on.

| Book | First term (drawn) | Not drawn |
|---|---|---|
| *Mathematics* 11 | 1 Sets · 2 Relations and Functions · 3 Trigonometric Functions · 4 Complex Numbers and Quadratic Equations · 5 Linear Inequalities · 6 Permutations and Combinations · 7 Binomial Theorem · 8 Sequences and Series | 9–14 (Straight Lines and Conic Sections start before the half-yearly in some schools; left out) |
| *Physics* 11 | 1 Units and Measurement · 2 Motion in a Straight Line · 3 Motion in a Plane · 4 Laws of Motion · 5 Work, Energy and Power | 6–14 (Rotational Motion and Gravitation are in one school's half-yearly; left out) |
| *Chemistry* 11 | 1 Some Basic Concepts of Chemistry · 2 Structure of Atom · 3 Classification of Elements and Periodicity in Properties · 4 Chemical Bonding and Molecular Structure · 7 Redox Reactions | 5, 6, 8, 9 |

## 2. The keys

**23 of the 30 keys were recomputed in code**, independently of the authored answer. All 23 match.
**The other 7 need a reader**: M11-E-05 (i⁴), M11-E-06 (an inequality), and the science items
S11-E-01 (unit of force), S11-E-02 (dimensionless quantity), S11-E-04 (horizontal velocity of a
projectile), S11-E-11 (atomic radius across a period) and S11-E-12 (linear molecule).

Keys across A–D: maths A 2 · B 3 · C 3 · D 2; science A 2 · B 2 · C 2 · D 2. `items:lint` is clean
after one rewrite: S11-E-02's correct option was the only long one.

## Maths

| Ref | Ch | Level | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|---|
| M11-E-01 | 1 | easy | {1,2,3,4} ∩ {3,4,5} | **A** {3, 4} | The union |
| M11-E-02 | 1 | easy | Subsets of a 4-element set | **16** *(numeric)* | 4 — singletons only |
| M11-E-03 | 2 | easy | Pairs in A × B, sizes 2 and 3 | **B** 6 | 5 — adding |
| M11-E-04 | 3 | easy | π/3 radians in degrees | **C** 60° | 120° |
| M11-E-05 | 4 | easy | i⁴ | **D** 1 | −1 — that is i² |
| M11-E-06 | 5 | easy | 3x − 5 < 7 | **D** x < 4 | x > 4 — sign flipped needlessly |
| M11-E-07 | 6 | easy | Arrangements of 4 books | **24** *(numeric)* | 10 — adding |
| M11-E-08 | 8 | easy | Next term of 3, 6, 12, 24 | **C** 48 | 30/36 — treated as an AP |
| M11-E-09 | 2 | easy | f(−2) for x² + 1 | **5** *(numeric)* | −3 — sign of the square |
| M11-M-10 | 7 | moderate | Terms in (a + b)⁷ | **C** 8 | 7 — n, not n + 1 |
| M11-M-11 | 4 | moderate | Modulus of 3 − 4i | **5** *(numeric)* | — |
| M11-M-12 | 6 | moderate | Committees of 3 from 7 | **B** 35 | 210 — order counted |
| M11-D-13 | 8 | difficult | Sum of 6 terms of 2, 4, 8 | **126** *(numeric)* | — |
| M11-D-14 | 3 | difficult | sin θ = 3/5, second quadrant; cos θ | **B** −4/5 | 4/5 — quadrant ignored |
| M11-D-15 | 4 | difficult | Roots of x² + 2x + 5 = 0 | **A** −1 ± 2i | −1 ± 4i — not halved |

## Science

| Ref | Book · Ch | Level | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|---|
| S11-E-01 | Phy 1 | easy | SI unit of force in base units | **D** kg m s⁻² | kg m s⁻¹ — momentum |
| S11-E-02 | Phy 1 | easy | Which has no dimensions | **A** An angle in radians | — |
| S11-E-03 | Phy 2 | easy | Dropped from rest, 3 s; distance | **45** *(numeric)* | 90 — no half |
| S11-E-04 | Phy 3 | easy | Horizontal velocity of a projectile | **C** Stays the same | "Increases" |
| S11-E-05 | Phy 4 | easy | 10 N for 0.5 s; impulse | **5** *(numeric)* | 20 — dividing |
| S11-M-06 | Phy 3 | moderate | 3 N and 4 N at right angles | **B** 5 N | 7 N — added as if in line |
| S11-M-07 | Phy 5 | moderate | Dropped 20 m; speed at ground | **20** *(numeric)* | — |
| S11-D-08 | Phy 3 | difficult | 20 m/s at 45°; range | **40** *(numeric)* | — |
| S11-E-09 | Chem 1 | easy | Moles in 36 g of water | **2** *(numeric)* | Molar mass 17 |
| S11-E-10 | Chem 2 | easy | Neutrons in sodium-23 | **B** 12 | 11 — protons |
| S11-E-11 | Chem 3 | easy | Atomic radius across a period | **A** Decreases | Increases — the trend down a group |
| S11-E-12 | Chem 4 | easy | Which molecule is linear | **C** CO₂ | H₂O — bent |
| S11-M-13 | Chem 7 | moderate | Oxidation number of Mn in KMnO₄ | **D** +7 | +6 — manganate |
| S11-D-14 | Chem 2 | difficult | Unpaired electrons in nitrogen | **3** *(numeric)* | 1 — Hund's rule ignored |
| S11-D-15 | Chem 1 | difficult | O₂ to burn 12 g of carbon | **32** *(numeric)* | 16 — O, not O₂ |

## 3. The parent pack's extra Class 12 sample questions

Waiting in `content/parent-pack/pending-class-12.json`: 5 English basics, 5 maths and 5 science
(Physics and Chemistry) from the chapters above. All 9 calculable keys were recomputed in code and
the lint is clean. The parent sheet now lists Physics and Chemistry chapters under their own book
names.
