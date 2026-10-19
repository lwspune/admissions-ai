# Teacher Screening Test — Specification (v1)

**Date:** 2026-10-19 · **Status:** Built (steps 1–3, 2026-10-19), on branch `feat/teacher-screening`. Not usable until a
subject's questions are signed off (`npm run hiring:seed -- --live --file <subject>`) and the branch
ships; create teacher accounts only after it ships — the live code before it shows a teacher as "No
role".

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

### Issuing and taking (migrations 0021, 0022)

- An applicant belongs to whoever added them, stamped from the session; a signed-in user may send
  only name, number and subject. A teacher sees their own applicants and everything under them;
  superadmin sees all. The tables under an applicant are read through it, and nobody signed in
  writes them.
- `issue_hiring_test()` is the only way a test is made. It draws the paper itself — MCQ first, then
  typed answers; at most two questions a chapter; nothing this applicant has seen — voids the
  applicant's earlier link, refuses a fourth issue and refuses an applicant who has submitted. No
  two papers in a subject hold the same set (`hiring_tests_one_set`); a collision is redrawn.
- A link stays open 24 hours to start. Starting checks the number again (the identity screen is not
  the only door), and the database sets the deadline: start plus the paper's minutes. **The clock
  does not pause**: copying is accepted for this screen, so the student test's pause machinery buys
  nothing, and the instructions say so.
- Answers must fit the question (a letter for an MCQ, a whole number for a typed answer) and stop at
  submit or the deadline, with 30 seconds' grace for a save in flight. The page also saves a typed
  answer when the applicant moves on and waits for every save before submitting.
- Grading is SQL (`submit_hiring_attempt`), with the admissions marks, and matches `grade.ts`
  (`hiring.itest.ts`). An attempt left open past its deadline is graded as timed out when the link
  is opened again, or by `close_expired_hiring_attempts()`. The applicant is never shown a score.
- A test's state only moves forward — issued, opened, started, submitted, or voided (0022). Found
  in the browser check: a slow page load wrote "opened" over a submitted test, and the link offered
  the number screen again.

Proven by `npm run db:probe -- 0021` and `src/server/hiring.itest.ts`.

### The staff side (step 3)

- **The teacher role** is in `ROLES`, created on `/staff` or with `staff:add`. The middleware keeps a
  teacher on `/hiring` (every other path redirects there) and keeps telecallers and counsellors off
  it. Role checks that once read "not a telecaller" are allow-lists (`canManageLeads`,
  `isAdmissionsStaff`, `canHire` in `src/lib/staff.ts`), so a new role is refused until named.
- **`/hiring`** (teacher and superadmin): add an applicant (name, number, subject), send the link —
  the WhatsApp message names the subject, the minutes and that the clock does not stop — resend the
  live link, or issue a new one (asks first: the old link stops). Each applicant shows where they
  stand and, once submitted, the score out of 15, right/wrong/skipped and time used. Superadmin sees
  who added each applicant.
- **`/hiring/[id]`**: the score and every question with the answer chosen, the key and the verdict.
- **The purge** deletes an applicant 12 months after their last activity (added, or last issued),
  with everything under them (`purgeExpired`, `hiring.itest.ts`).

## 4. Open

- Sign off each subject's questions; until then no paper can be drawn.
- The defaults marked above (24-hour window, two reissues, no score shown) and the choices in step 2
  (the clock does not pause; starting re-checks the number; a started paper keeps its full time) are
  the builder's, awaiting the owner's word.
