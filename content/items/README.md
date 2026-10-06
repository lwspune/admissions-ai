# Item files

Each `*.json` here is one authored batch; the matching `*.md` is its review sheet. `npm run
items:lint` checks every file, `npm run items:seed` upserts them by `ref` (never demoting a status),
and `npm run items:seed -- --live --file <batch.json>` is the answer-key sign-off that promotes one
reviewed batch.

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
