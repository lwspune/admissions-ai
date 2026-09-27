# Science Batch 02 — 15 items

**Date:** 2026-09-23
**Status:** Awaiting review. Machine-readable source: `science-batch-02.json`.
**Composition:** 3 easy / 6 moderate / 6 difficult, all science. 3 numeric, 12 MCQ.

**Why weighted to the top.** After batch 01, science easy stood at 12 while moderate and difficult
held 4 each — the thinnest strata in the bank. This batch takes science to **15 / 10 / 10**. Easy
still needs the most items in absolute terms (45 short of 60), but it is no longer where the
variety is scarcest.

> **None of the twelve MCQ keys here is machine-checkable**, same as batch 01. The three numeric
> answers were recomputed from the stem in code. Everything else rests on the rationale and your
> reading.

---

## Easy (3)

| Ref | Skill | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|
| S-E-21 | magnetism | A bar magnet cut in two | **A** both poles | "Only a north pole" — poles cannot be separated |
| S-E-22 | speed-of-light-and-sound | Lightning seen before thunder | **A** light is faster | **D restates the observation without explaining it** |
| S-E-23 | mass-and-weight | 5 kg, g = 10 | **50 N** *(numeric)* | Answering 5 — weight and mass treated as one quantity |

**S-E-22's option D is the interesting one.** "Reaches the eye before the ear" is *true*, and it is
not an explanation — it restates the stem. Picking it means matching words instead of finding a
cause. Same construction as S-E-11 in batch 01, and if you disliked that one you will dislike this.

## Moderate (6)

| Ref | Skill | Stem (abbreviated) | Key | Why moderate |
|---|---|---|---|---|
| S-M-24 | change-of-state | Ice melts, temperature does not rise | **A** separates the particles | "Heat supplied" is assumed to mean "temperature raised" |
| S-M-25 | pressure-in-liquids | Dam wall thicker at the bottom | **A** pressure rises with depth | "Acts only downwards" — then no wall would be needed |
| S-M-26 | chemical-and-physical-change | Which is a chemical change? | **A** iron rusting | Dissolving *looks* like a new substance; it is not |
| S-M-27 | concentration | 20 g salt in 80 g water | **20%** *(numeric)* | 20/80 = 25% — dividing by the water, not the solution |
| S-M-28 | density-and-buoyancy | Why a hot air balloon rises | **A** less dense than outside | "Expands and pushes up" names expansion without density |
| S-M-29 | electrical-safety | Why the iron's body is earthed | **A** prevent a shock | The fuse blowing is the mechanism, not the purpose |

## Difficult (6)

| Ref | Skill | Stem (abbreviated) | Key | Why difficult |
|---|---|---|---|---|
| S-D-30 | action-and-reaction | Book on a table — the pair to Earth's pull | **A** book's pull on Earth | **A true statement about equilibrium must be rejected** |
| S-D-31 | conservation-of-mass | Rusted iron weighs more | **A** oxygen joined it | Requires treating air as a material with weight |
| S-D-32 | energy-transformation | Hydroelectric dam | **A** potential → kinetic → electrical | Must read from the stored state, not the visible motion |
| S-D-33 | reflection | 2 m from a mirror, step back 1 m | **A** 6 m | Two distances change together |
| S-D-34 | concentration | 10 g in 200 ml, add 200 ml water | **25 g/L** *(numeric)* | Dilution, summed volume, and ml→L, all at once |
| S-D-35 | electric-power | 40 W vs 100 W on the same supply | **A** draws more current | The right answer forces a second, counterintuitive one |

**S-D-30 is the best item in this batch.** The partner to the Earth pulling the book is the book
pulling the Earth. Option B — the table's push on the book — is what nearly everyone says, and it
is wrong for a reason worth teaching: balancing is not pairing, and a third-law pair never acts on
the same object. It is also the item most likely to be marked wrong by a reviewer who half-remembers
the rule, so please check it against a textbook rather than intuition.

**S-D-35 is the same species of trap.** The 100 W bulb draws more current and therefore has *lower*
resistance. Candidates associate "more powerful" with "more of everything", and resistance moves the
other way.

**S-D-33 arithmetic, spelled out:** standing 3 m from the mirror puts the image 3 m behind it, so the
separation is 6 m. Not 3 m (the distance to the mirror), not 4 m (the separation before stepping back).

---

## Verification

- Three numeric keys recomputed from the stem in code: `50`, `20`, `25`, 0 mismatches.
- `npm run items:lint` → 90 items, 0 errors, 0 warnings.
- Exposure over 1,000 draws: 1,000 distinct papers, no item on every paper, most exposed 32%.

## Bank after this batch

```
maths     easy 20   moderate  7   difficult  5     (target 60 / 20 / 20)
english   easy 10   moderate  7   difficult  6
science   easy 15   moderate 10   difficult 10
                                    90 items of 300
```

Thinnest now: **maths difficult (5)** and **english difficult (6)**. Maths easy is furthest from its
target in absolute terms (40 short) but is already the deepest stratum in the bank.

To promote this batch once reviewed:

```
npm run items:seed -- --live --file science-batch-02.json
```

---

## Class tags (2026-09-27)

`taught_in` is the class in which the content is first taught (NCERT sequence, checked against the
Maharashtra board where they differ); an admit to class N draws `taught_in ≤ N−1`. 6 is the floor
and means open to every admit. Raised tags are a curriculum judgement — overrule in the `.json`
and re-run `npm run items:lint`.

| Ref | taught_in | Why |
|---|---|---|
| S-E-21 | 6 | reasoning or everyday content; open to every admit |
| S-E-22 | 8 | light faster than sound — Class 8 Sound |
| S-E-23 | 9 | weight = mg — Class 9 Gravitation |
| S-M-24 | 9 | latent heat of fusion — Class 9 Matter in Our Surroundings |
| S-M-25 | 8 | liquid pressure increases with depth — Class 8 Force and Pressure |
| S-M-26 | 7 | chemical vs physical change — Class 7 |
| S-M-27 | 9 | concentration by mass — Class 9 Is Matter Around Us Pure |
| S-M-28 | 7 | hot air is less dense and rises — Class 7 Heat (convection) |
| S-M-29 | 10 | earthing of appliances — Class 10 Electricity (domestic circuits) |
| S-D-30 | 9 | identifying the reaction pair — Class 9 Third Law |
| S-D-31 | 7 | rusting adds oxygen to iron — Class 7 Physical and Chemical Changes |
| S-D-32 | 9 | potential → kinetic → electrical — Class 9 Work and Energy |
| S-D-33 | 7 | plane mirror image distance — Class 7 Light |
| S-D-34 | 9 | concentration in g/L after dilution — Class 9 |
| S-D-35 | 10 | power, current and resistance at fixed voltage — Class 10 Electricity |
