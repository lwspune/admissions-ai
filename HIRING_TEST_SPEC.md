# Teacher Screening Test — Specification (v1)

**Date:** 2026-10-19 · **Status:** Question bank built (step 1 of 3). Issuing, the test itself and the
staff side are next.

A screen, not a judgement: an applicant for a teaching post sits fifteen moderate questions from real
exam papers before anyone calls them. Many applicants are out of station, so it is taken remotely on a
link. Copying is accepted — the interview that follows is where they are grilled — so the test does not
fight it beyond giving every applicant a different set.

A second track beside the admissions test, sharing none of its tables. Those are built round a
student lead, the class rule and the parent; an applicant has none of them.

---

## 1. Decisions (owner, 2026-10-19)

| | |
|---|---|
| Who it is for | Applicants for teaching posts: maths, physics, chemistry, English |
| Paper | 15 moderate questions. Maths: 12 NDA Mathematics MCQ + 3 JEE Mains typed answers. Physics and chemistry: 12 MHT-CET MCQ + 3 JEE Mains typed answers. English: 15 CDS English MCQ |
| Time | 25 minutes; English 20 |
| Sets | Every applicant gets their own random draw. No two papers in a subject may hold the same set (a database rule); a reissue skips what the applicant has seen |
| Marking | As the admissions test: +1 correct, −0.25 wrong MCQ, 0 wrong typed answer, 0 skipped |
| Who issues and reads | A new **teacher** role, and superadmin. A teacher sees only the applicants they added; superadmin sees all. Counsellors and telecallers see nothing of it |
| Window | 24 hours to start (applicants are out of station) — default, not yet confirmed in use |
| Reissues | At most 2 — default |
| The applicant sees | "Submitted" — no score, no answers — default |
| Kept | 12 months, then purged, as candidate data |

## 2. The questions

Taken from PYQ Vault's public bank (`npm run hiring:import`), never its practice questions, never one it
cancelled or holds back. Only questions PYQ Vault tags **moderate**. v1 leaves out:

- any question with a figure or a table — v1 stores no images;
- a maths or science question with a shared stem ("for the next two items") — it leans on its neighbours;
- an English question with a passage (comprehension, cloze). A short printed direction, at most 160
  characters ("Directions: improve the underlined part"), is kept and shown above the question;
- a typed answer that is not a whole number from 0 to 9999.

From what is left, each source keeps a pool spread across chapters in proportion to the source:
200 MCQ and 50 typed answers per maths and science subject, 300 English. Two random papers of k
questions from a pool of p share k²/p on average, so any two applicants share about one question.
The pick is seeded: re-running the import on an unchanged source writes the same files.

The files (`content/hiring/<subject>.json`) are committed and reviewed, then `npm run hiring:seed`
loads them at `review`; a subject goes live with `npm run hiring:seed -- --live --file <subject>`.
Superadmin reviews them at `/hiring/questions`.

Maths is LaTeX, drawn by KaTeX on the server (no maths code reaches the phone). The parser is a port
of PYQ Vault's, and the import refuses any equation KaTeX cannot draw.

## 3. Rules the database holds (migration 0020)

- `hiring_items`: an MCQ is four non-empty options and a key; a typed answer is a whole number 0–9999;
  never both. English is MCQ only, and only English carries a direction.
- `can_hire()` — teacher or superadmin — is the hiring tables' gate. `is_staff()` does not name
  teacher, so every admissions policy already refuses one.
- Signed-in users only read the bank; the seed writes it on service role.

Proven by `npm run db:probe -- 0020`.

## 4. Still to build

- **Step 2 — the test.** Applicants and tests tables; the draw (per subject and format, at most
  two questions a chapter, the no-duplicate set rule, reissue exclusions); the link at `/h/<token>`,
  number check, instructions, timer, save, submit, grading.
- **Step 3 — the staff side.** The teacher role (`/staff`, `staff:add`); the middleware keeps a
  teacher on `/hiring`; the `/hiring` page (add an applicant, issue, the WhatsApp message, score, time
  used, each question right or wrong); the purge.
