# Item files

Each `*.json` here is one authored batch; the matching `*.md` is its review sheet. `npm run
items:lint` checks every file, `npm run items:seed` upserts them by `ref` (never demoting a status),
and `npm run items:seed -- --live --file <batch.json>` is the answer-key sign-off that promotes one
reviewed batch.

## Before writing a batch

**English is language.** Vocabulary, grammar, error spotting, sentence completion and ordering,
reading, and the verbal patterns the spec names (analogies, odd one out, series, codes). Not
syllogisms, seating or ranking, or family relations: those need only logic, and the lint refuses
their skills in English. Ask of each English item: would a candidate weak in English but good at
puzzles get it right? If yes, it is not an English question.

Read the parent samples for the same skills (`content/parent-pack/sample-papers.json`). Parents
have those questions with their answers, so a bank item must not reuse a sample's target word,
sentence frame, sequence or argument form. The lint and the parent-pack build refuse an identical
stem and warn on shared wording, but a near copy can share few words: "vigilant" with three of
the same four options, a series starting B, E, H, K. Word overlap cannot separate those from two
ordinary questions of one type (both score 0.4–0.5), so this is a reading step, not a check.

## Hindi versions

Maths and science items can carry a Hindi version (2026-10-11); English never does. Translations go
in `hi/<batch>.hi.json`, one per English batch, each entry `{ ref, source, stem_hi, options_hi }`.

- **Same question, other words.** The key letter, the numeric answer and the option order are the
  English item's. Keep every number, in the same option; the lint checks this per option. Use the
  digits 0–9, units as the English has them (km, m/s², g/cm3), and the terms of NCERT's Hindi-medium
  books (क्षारकीय, तिर्यक रेखा, शीर्षाभिमुख कोण).
- **`npm run items:hindi -- --stamp <batch>`** fills `source`, a fingerprint of the English, on new
  entries. When the English changes the lint calls the translation stale; check the Hindi, then put
  the new value it prints in `source` by hand.
- **`--sheet <batch>`** writes `hi/<batch>.hi.md`, English and Hindi side by side with the key
  marked, for the reviewer. **`--file <batch>`** loads the batch: that is the sign-off, as `--live`
  is for keys. The database refuses it while a candidate is mid-test on one of its items; run it
  again after.
- A class's papers offer Hindi only once every maths and science item it can draw is loaded; the
  lint prints the count per class.

## Fields

| Field | Values | Meaning |
|---|---|---|
| `ref` | `M-E-01` | Subject letter, difficulty letter, number. Unique across the bank |
| `subject` | `maths` · `english` · `science` | Spec §1: 5 per paper each |
| `skill` | kebab-case | What the item exercises; free text, shown on `/items` |
| `difficulty` | `easy` · `moderate` · `difficult` | A target p-value (spec §9), 3/1/1 per subject per paper |
| `taught_in` | integer 6–11 | **The class in which the content is taught.** See below |
| `part` | `basics` (default) · `syllabus` | Basics is the reasoning bank, drawn for every class with `taught_in ≤ N−1`. Syllabus is maths or science content from one class's NCERT chapters, drawn only for an admit to the class above, and only if `term` is 1 |
| `term` | `1` · `2` | Syllabus items only: the term of class `taught_in` in which the chapter is taught. Only term 1 is drawn, because candidates are tested before the year ends. Class 11 syllabus science is physics or chemistry |
| `format` | `mcq` · `numeric` | An MCQ has `options` A–D and `answer_key`; a numeric item has `numeric_answer` and optional `numeric_tolerance` |
| `stem` | ≤ 40 words | The question |
| `rationale` | ≥ 60 chars | Why the key is right and what each distractor catches. The sign-off reads this |
| `status` | `retired` (only) | Withdraws a live item for good: the seed sets it retired even inside a promoted batch, and the lint and parent pack leave it out. Papers that drew it still show it, which is why it is retired and not deleted or edited. Review and live are the seed's, never written in a file |

## `taught_in` — the class tag

Students are admitted to classes 8–12, and **an admit to class N is tested on content taught up to
class N−1** (`src/lib/classes.ts`, enforced by `issue_assessment`). The tag describes the content,
not the audience: state the class in which the idea is taught, and let the rule decide who sees it.

- **6 is the floor** and means "open to every admit". Number series, primes and factors,
  fractions, analogies, odd-one-out and everyday physical reasoning belong here. It is also what an
  item carries before anyone has tagged it, so an untagged batch changes nothing.
- **"Taught" means taught in the NCERT book this year's admits used.** NCERT's new books reached
  classes 6–8 by 2025–26 and class 9 in 2026–27, and they moved topics later. Percentages, profit
  and loss, interest, ratio, averages, food chains and floating are class 8 (*Ganita Prakash 8*,
  *Curiosity 8*); probability is class 9 (*Ganita Manjari*). Where the old and new books disagree,
  take the later class: it is the fair direction. `content/parent-pack/syllabus.json` maps each
  skill to its chapters in both editions; check a new skill there.
- **11 is the ceiling.** Class 12 content can never be fair to anyone this test is issued to.

Coverage is per class. After changing tags run `npm run items:lint`: it refuses a bank that cannot
fill a paper for some class (3 easy + 1 moderate + 1 difficult per subject) and warns when a class
would see the same items on every paper. `/items` shows the same table against the live database.
Class 9 is the constrained one — it can see only content up to class 8.
