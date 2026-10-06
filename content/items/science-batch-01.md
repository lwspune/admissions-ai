# Science Batch 01 — 15 items

> **Options re-lettered 2026-10-06** to balance answer keys across A–D. Option letters in this review sheet are as reviewed and may no longer match; the `.json` is current.

**Date:** 2026-09-23
**Status:** Awaiting review. Machine-readable source: `science-batch-01.json`.
**Composition:** 9 easy / 3 moderate / 3 difficult, all science. 3 numeric, 12 MCQ.

**Why science, and why now.** The 5/5/5 split was confirmed on 2026-09-23 and the whole bank went
live the same day. A simulation immediately showed that all five science items appeared on *every*
paper — the science strata held exactly the 3 easy + 1 moderate + 1 difficult a paper needs, so the
draw had nothing to choose between. One screenshot of the science section burned it for every
candidate. This batch takes science from 3/1/1 to **12/4/4**.

**How to review:** for each item check (1) is the key right, (2) is the tier plausible for a
15-year-old applying to NDA coaching, (3) does any distractor look either obviously wrong or
accidentally defensible.

> **Read this one carefully.** Unlike the maths batches, **twelve of these fifteen keys cannot be
> checked by machine.** A science MCQ key is a claim about the world, not an arithmetic result, so
> `items:lint` can only confirm the shape and the three numeric answers. The rationale is the
> argument; your reading is the verification. This is the batch where a wrong key is most likely to
> survive to a candidate.

---

## Easy (9)

| Ref | Skill | Stem (abbreviated) | Key | The error it is built to catch |
|---|---|---|---|---|
| S-E-06 | evaporation | Open saucer dries sooner than a corked bottle | **A** surface open to air | "Higher temperature" — both are in the same room |
| S-E-07 | inertia | Bus brakes, passengers lurch forward | **A** bodies keep moving | "Pushed forward by the bus" — inverts the force |
| S-E-08 | density | 270 g, 100 cm³ | **2.7** *(numeric)* | Inverting to volume/mass, giving 0.37 |
| S-E-09 | electric-circuits | One bulb fuses, the whole string dies | **A** in series | Parallel — what newer light strings actually do |
| S-E-10 | respiration | Why breathing quickens when running | **A** oxygen | — floor item |
| S-E-11 | properties-of-light | Why a shadow has the object's *shape* | **A** straight lines | "Absorbed by opaque objects" — true, but explains darkness not shape |
| S-E-12 | rate-and-quantity | 3 drops/sec, 0.05 ml each, one minute | **9 ml** *(numeric)* | Dropping the minute→second conversion, giving 0.15 |
| S-E-13 | acids-and-bases | Blue litmus turns red | **A** lemon juice | Soap and baking soda — the colour pair remembered backwards |
| S-E-14 | food-chains | Frogs removed from grass→insect→frog→snake | **A** insects increase | "Snakes increase" — they have lost their food |

**S-E-11 is the one I most want you to check.** Option B, "it is absorbed by opaque objects", is a
**true statement**. It is a distractor because it explains why a shadow is *dark*, not why it has the
object's *shape*, and the stem asks about shape. If you think that is too fine a distinction for an
easy item, say so and I will retier or reword it — it is the most defensible wrong answer in the batch.

**S-E-10 is close to recall** rather than reasoning. It is here as a floor check; the science section
needs a bottom rung and this is it.

## Moderate (3)

| Ref | Skill | Stem (abbreviated) | Key | Why moderate |
|---|---|---|---|---|
| S-M-15 | heat-transfer | Metal vs wooden spoon in the same soup | **A** conducts better | "Reaches a higher temperature" is intuitive and contradicts the stem |
| S-M-16 | interpreting-evidence | Moist seeds, warm room vs fridge | **A** warmth | **"Warmth and moisture" is true of the world but not shown by this experiment** |
| S-M-17 | density | Displacement: 150 g, 200 ml → 260 ml | **2.5** *(numeric)* | Dividing by 260 or 200 instead of the 60 displaced |

**S-M-16 is the best item in the batch.** Germination genuinely does need moisture — but both jars
were moist, so the experiment cannot show it. Picking B means answering from what you already know
instead of from the evidence in front of you, which is exactly the habit a screening test should
detect. It pairs with `S-M-04` (fair-test variables) without duplicating it: that one asks what to
control, this one asks what a result entitles you to conclude.

## Difficult (3)

| Ref | Skill | Stem (abbreviated) | Key | Why difficult |
|---|---|---|---|---|
| S-D-18 | applying-a-principle | Iron nail sinks, iron ship floats | **A** average density | "Hollow makes the iron lighter" — wrong in an instructive way |
| S-D-19 | inference-from-results | Candle: 2 min alone, 5 min with a lit plant, 1 min in the dark | **A** plant respired, using oxygen | Three results held together; plants respire *always* |
| S-D-20 | action-and-reaction | Throwing a ball while on a skateboard | **A** ball pushes back equally | "The ground pushes" — exactly backwards |

**S-D-19 is the hardest and the one with the most room for disagreement.** It needs the candidate to
know that photosynthesis stops in darkness while respiration continues, and to read three results as
one story. Option D — "gives out carbon dioxide only at night" — is the familiar half-truth, and I
expect it to take most of the wrong answers. If you think this is beyond a class-10 syllabus, it is
the item to cut.

**S-D-20's distractor C is the point.** Friction with the ground is what normally *prevents* the
recoil — which is why there is a skateboard in the stem at all.

---

## Verification

- The three numeric keys were recomputed from the stem in code: `2.7`, `9`, `2.5`, 0 mismatches.
- **The twelve MCQ keys were not machine-checked and cannot be.** See the note above.
- `npm run items:lint` → 60 items, 0 errors, 0 warnings.
- Exposure, simulated over 500 draws with this batch included: **500 distinct papers**, and the
  number of items appearing on *every* paper falls from 6 to **1**.

## Bank after this batch

```
maths     easy 20   moderate 7   difficult 5      (target 60 / 20 / 20)
english   easy  5   moderate 2   difficult 1
science   easy 12   moderate 4   difficult 4
                                    60 items
```

**English is now the whole bottleneck.** `E-D-05` is the single difficult English item and therefore
sits on 100% of papers; the five easy English items each appear on about 62%. English should be the
next batch, weighted to moderate and difficult.

To promote this batch once reviewed:

```
npm run items:seed -- --live --file science-batch-01.json
```

---

## Class tags (2026-09-27)

`taught_in` is the class in which the content is first taught (NCERT sequence, checked against the
Maharashtra board where they differ); an admit to class N draws `taught_in ≤ N−1`. 6 is the floor
and means open to every admit. Raised tags are a curriculum judgement — overrule in the `.json`
and re-run `npm run items:lint`.

| Ref | taught_in | Why |
|---|---|---|
| S-E-06 | 6 | reasoning or everyday content; open to every admit |
| S-E-07 | 9 | inertia — Class 9 Force and Laws of Motion |
| S-E-08 | 9 | density = mass ÷ volume — Class 9 Gravitation (relative density) |
| S-E-09 | 7 | series circuit, one bulb breaks the loop — Class 7 Electric Current and its Effects |
| S-E-10 | 7 | breathing rate and oxygen demand — Class 7 Respiration in Organisms |
| S-E-11 | 6 | reasoning or everyday content; open to every admit |
| S-E-12 | 6 | reasoning or everyday content; open to every admit |
| S-E-13 | 7 | blue litmus turns red in acid — Class 7 Acids, Bases and Salts |
| S-E-14 | 7 | food chain disturbance — Class 7 |
| S-M-15 | 7 | conduction in metal vs wood — Class 7 Heat |
| S-M-16 | 6 | reasoning or everyday content; open to every admit |
| S-M-17 | 9 | density by displacement — Class 9 |
| S-D-18 | 9 | floating by average density — Class 9 Gravitation (buoyancy) |
| S-D-19 | 7 | plants respire in the dark — Class 7 Respiration in Organisms |
| S-D-20 | 9 | action and reaction — Class 9 Third Law |
