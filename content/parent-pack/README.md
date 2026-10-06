# Parent pack

What staff send a parent who asks for the syllabus or a sample paper: one PDF per admitting class
(`pdf/reasoning-test-class-N.pdf`). Each holds how the test works, the NCERT chapters the paper
draws on for that class, a 15-question sample paper of the real shape, and the answers with
working.

| File | What |
|---|---|
| `syllabus.json` | Topics (each a group of bank skills), the NCERT chapters that teach them in the old and new editions, and the cohort the sheets are written for |
| `sample-papers.json` | 75 questions, 15 per class, in the item-bank format plus a `paper` field |
| `pdf/` | The built PDFs. Rebuild after any change: `npm run parent-pack` |

## How a sheet is worked out

A topic's class is the lowest `taught_in` among bank items with its skills, so a retag reaches the
sheets on the next build. An admit to class N is shown every topic with class ≤ N−1, placed in
the chapter of the NCERT book the child actually used for that class. `cohortYear` says which year
an admit to N is in class N−1, and `newFrom` says when each class got NCERT's new book, so for
the 2027 joiners admits to 8 and 9 used only new books, admits to 10 used old books for classes 6–7
and new ones for 8–9, and admits to 11 and 12 used only old books (`src/lib/syllabus.ts`).

Topics marked `reasoning` (series and clocks in maths, all of English, reading an experiment in
science) are listed apart as "not a textbook chapter". A drawable topic with no chapter in the
child's books is printed as "also asked, though the newer NCERT books teach it in a later class",
and the build warns. Each warning is a bank tag that the new books contradict; see the backfill
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
