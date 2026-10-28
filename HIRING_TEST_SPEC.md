# Teacher Screening Test — Specification (v1)

**Date:** 2026-10-19 · **Status:** Live (steps 1–3, 2026-10-19; all four subjects' questions live
2026-10-21). Step 4, the decision, notes and resume (2026-10-24), is on branch `feat/hiring-pipeline`.

A screen, not a judgement: an applicant for a teaching post sits fifteen moderate questions from real
exam papers before anyone calls them. Many applicants are out of station, so it is taken remotely on a
link. Copying is accepted — the interview that follows is where they are grilled — so the test does not
fight it beyond giving every applicant a different set. Copying includes solving with AI, which no
remote check stops (a second phone beats any detector), so the defence is a warning: the issue message
and the instructions screen both say the interview may ask them to solve and explain questions from
the test (owner, 2026-10-21; an on-page list of questions to ask was offered and dropped).

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
| Who issues and reads | A new **teacher** role, and superadmin. A teacher sees every applicant in their org, whoever added them (2026-10-28; before, only their own); superadmin sees every org's. Counsellors and telecallers see nothing of it |
| Window | 24 hours to start (applicants are out of station) — default, not yet confirmed in use |
| Reissues | At most 2 — default |
| The applicant sees | "Submitted" — no score, no answers — default |
| Kept | For good: never purged, so past applicants inform future hiring (owner, 2026-10-24; was 12 months) |

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

- An applicant is stamped with who added them and their org, from the session; a signed-in user
  may send only name, number and subject. A teacher sees every applicant in their org and
  everything under them (migration 0030); superadmin sees every org's. The tables under an applicant are read through it, and nobody signed in
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
- **The purge** leaves applicants alone (owner, 2026-10-24: their history helps future hiring). Only
  their number checks go, with everyone's, from `identify_attempts`. Until then it deleted an
  applicant 12 months after their last activity; none was old enough to have gone.

### After the test: decision, notes, resume (step 4, migration 0023, 2026-10-24)

The owner's calls: the six decisions below, PDF and Word resumes, hired and rejected set by superadmin
only, applicants never purged, and no lock on a decided applicant (a new link can still be issued).

- **Decision** — In progress (every applicant starts here), Shortlisted, On hold, Hired, Rejected,
  Withdrawn. A teacher sets it on their org's applicants; Hired and Rejected are superadmin's, into and
  out of, so a teacher cannot undo superadmin's call (`hiring_applicants_decision_guard`). Only that
  column is writable (a column grant), and every change writes a history line. Nothing sets it from
  the score: a person decides. `/hiring` shows it as a badge and filters by it.
- **Notes** — `hiring_notes`, the applicant's history, newest first on `/hiring/[id]`: notes, decision
  changes and resumes added or replaced. Insert-only, the author stamped from the session, visible to
  whoever sees the applicant. A signed-in user writes only plain notes; the other lines come from the
  database.
- **On the `/hiring` card** (owner, same day): a line that opens and closes, collapsed by default,
  showing the note count and the newest note. Open, it holds the decision control, the applicant's
  plain notes and the add-note box, so nobody opens the applicant's page for them. Decision changes
  and resumes stay on the page's full history; the badges already show where the applicant stands.
  The notes come with the list in one query, through the same RLS.
- **Resume** — one file per applicant in the private `hiring-resumes` bucket, named by the applicant's
  id: PDF or Word (.docx), at most 5 MB, both enforced by the bucket. The page checks the file's first
  bytes too, so a renamed file is refused before upload. The browser uploads straight to storage
  (past Vercel's 4.5 MB body limit) and `attach_resume()` records it, reading the type from the stored
  object, never from the caller. Uploading again replaces it. `/hiring/[id]/resume` signs a fresh
  ten-minute link on each click: a PDF opens, a Word file downloads under the applicant's name. The
  teacher who added the applicant and superadmin can read and write it, nobody else (storage policy,
  `hiring_resume_allowed`).

Proven by `npm run db:probe -- 0023` and `src/server/hiring.itest.ts` (the bucket's type and size
limits, which no SQL reaches).

## 4. Open

- Sign off each subject's questions; until then no paper can be drawn.
- The defaults marked above (24-hour window, two reissues, no score shown) and the choices in step 2
  (the clock does not pause; starting re-checks the number; a started paper keeps its full time) are
  the builder's, awaiting the owner's word.
