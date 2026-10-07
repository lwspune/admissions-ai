# Parent pack

What staff send a parent who asks for the syllabus or a sample paper: one PDF per admitting class
(`pdf/reasoning-test-class-N.pdf`). Each holds how the test works, the basics topics and class N−1
chapters the paper draws on for that class, a sample paper of the real shape, and the answers
with working.

**What a sheet prints is deliberately bare** (the user, 2026-10-07): basics as four numbered lists
of broad topic names (Maths, English, Science, Reasoning) with no class, book or chapter; the
syllabus part as numbered chapter names under Maths and Science, with no textbook numbers, book
or intro. Classes, editions and chapters raised more questions from parents than they answered.
The build still checks all of them; it only stops printing them.

| File | What |
|---|---|
| `syllabus.json` | Topics (each a group of bank skills), the NCERT chapters that teach them in the old and new editions, the cohort the sheets are written for, and `syllabusChapters`: class N−1's chapters with their term and the syllabus skills each covers |
| `sample-papers.json` | 15 questions per class, 30 for a class on the 30-question paper, in the item-bank format plus a `paper` field |
| `pdf/` | The built PDFs. Rebuild after any change: `npm run parent-pack` |

## 15 or 30 questions

**The build asks the live database which paper each class gets** (`live_pool` and
`choosePaperShape`, exactly as issuing does), so it needs `.env.local`. A class on 30 questions
gets the 30-question facts, a "Class N−1 syllabus questions" section naming its first-term
chapters, and a 30-question sample: ten English basics, and five basics plus five class N−1
first-term syllabus questions in each of maths and science, labelled as on the real paper. **When a
class's syllabus batch goes live, the build stops** until that class has its 30-question sample and
its chapters in `syllabusChapters` — the pack cannot keep promising a 15-question paper. Every
syllabus bank item and sample must sit in a chapter of its own class and term.

## How a sheet is worked out

A topic's class is the lowest `taught_in` among bank items with its skills, so a retag reaches the
sheets on the next build. An admit to class N is shown every topic with class ≤ N−1, and the
build checks each against the chapter of the NCERT book the child actually used for that class. `cohortYear` says which year
an admit to N is in class N−1, and `newFrom` says when each class got NCERT's new book, so for
the 2027 joiners admits to 8 and 9 used only new books, admits to 10 used old books for classes 6–7
and new ones for 8–9, and admits to 11 and 12 used only old books (`src/lib/syllabus.ts`).

A topic prints under its subject, or under Reasoning when it has `"heading": "reasoning"`
(clocks, codes and word problems from maths; analogies, series and logical deduction from
English; reading an experiment from science). Topics marked `reasoning` are not textbook chapters,
so the chapter check skips them; that is why English vocabulary and grammar carry it too. A
drawable topic with no chapter in the child's books makes the build warn. Each warning is a bank tag that the new books contradict; see the backfill
ledger in SUGGESTIONS.md.

## Rules

- **Never seed these, never copy a bank item here.** A bank item printed on a sample is on real
  papers with its answer in a parent's hands. The questions live outside `content/items/` so
  `items:seed` cannot find them. The build refuses a stem identical to a bank stem and warns when
  a sample shares most of its words and numbers with a bank item.
- **A sample is the real shape and stays under its class's ceiling.** 5 maths, 5 English and 5
  science; per subject, 3 easy, 1 moderate and 1 difficult; no question taught at or above the
  admitting class (`samplePaperProblems` in `src/lib/samplePaper.ts`). A sample may not be tagged
  below the class the bank teaches its topic in, nor be on a topic no bank item covers.
- **Every skill must sit under a topic.** The build refuses a bank or sample skill that
  `syllabus.json` does not claim, so a new batch cannot add a topic the sheets leave out. Placing
  that topic in its chapters is still by hand, from the NCERT books.
- **Bump the cohort every April.** `cohortYear` is 2026 (joiners of April 2027). Next season it is
  2027, and `newFrom` gains class 10 when NCERT's new class 10 book arrives (announced for 2027–28),
  along with that book's chapters. Nothing reminds anyone of this but this line.
- **Keys are checked like the bank's.** `npm run items:lint` reads this file too: same shape,
  length-tell and duplicate-stem checks, and key skew judged apart from the bank. Every calculable
  key was re-derived in code. Keys are spread across A–D: maths 4/6/6/4, English 6/6/7/6, science
  5/5/5/5.

Chapter titles were checked on 2026-10-06 against published chapter lists for each book, and the
old editions against the 2022–23 rationalisation (which, for example, cut old Class 6 "Water" and
old Class 8 "Direct and Inverse Proportions"). The pack does not mention calculators or rough
work; that was a deliberate choice.
