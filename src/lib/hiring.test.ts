import { describe, it, expect } from 'vitest'
import {
  HIRING_SHAPE,
  HIRING_SOURCES,
  HIRING_SUBJECTS,
  rejectReason,
  toHiringItem,
  pickPool,
  lintHiringBank,
  toApplicantPaper,
  parseTypedAnswer,
  validateApplicant,
  hiringIssueMessage,
  applicantStatus,
  timeUsedMs,
  istTime,
  istDay,
  HIRING_DECISIONS,
  decisionChoices,
  mayChangeDecision,
  formatDecisionChange,
  validateNote,
  notePreview,
  checkResume,
  resumeDownloadName,
  RESUME_MAX_BYTES,
  type HiringItem,
  type HiringItemRow,
  type SourceRow,
} from './hiring'

const opts = (correct: 'A' | 'B' | 'C' | 'D' = 'B') =>
  (['A', 'B', 'C', 'D'] as const).map((label) => ({ label, text: `option ${label}`, is_correct: label === correct, image_url: null }))

const mcq = (over: Partial<SourceRow> = {}): SourceRow => ({
  id: 'q1',
  text: String.raw`If \(x = 2\), find \(x^2\).`,
  context: null,
  image_url: null,
  question_format: 'mcq',
  numeric_answer: null,
  pyq_year: 2024,
  pyq_note: 'NDA (I) 2024',
  chapter: 'Algebra',
  options: opts(),
  ...over,
})

const numeric = (over: Partial<SourceRow> = {}): SourceRow =>
  mcq({ id: 'n1', question_format: 'numeric', numeric_answer: 17, options: [], pyq_note: 'JEE Main 2025 (22 Jan Shift 1)', ...over })

describe('the paper each subject gets', () => {
  it('is 15 questions for every subject', () => {
    for (const s of HIRING_SUBJECTS) expect(HIRING_SHAPE[s].mcq + HIRING_SHAPE[s].numeric).toBe(15)
  })

  it('is twelve MCQ and three typed answers in maths and science, fifteen MCQ in English', () => {
    expect(HIRING_SHAPE.maths).toMatchObject({ mcq: 12, numeric: 3, minutes: 25 })
    expect(HIRING_SHAPE.physics).toMatchObject({ mcq: 12, numeric: 3, minutes: 25 })
    expect(HIRING_SHAPE.chemistry).toMatchObject({ mcq: 12, numeric: 3, minutes: 25 })
    expect(HIRING_SHAPE.english).toMatchObject({ mcq: 15, numeric: 0, minutes: 20 })
  })

  it('draws MCQs from the exam the teacher will teach for, typed answers from JEE Mains', () => {
    const src = (s: (typeof HIRING_SUBJECTS)[number]) => HIRING_SOURCES[s].map((x) => `${x.source}/${x.format}`)
    expect(src('maths')).toEqual(['nda/mcq', 'jee-mains/numeric'])
    expect(src('physics')).toEqual(['mht-cet/mcq', 'jee-mains/numeric'])
    expect(src('chemistry')).toEqual(['mht-cet/mcq', 'jee-mains/numeric'])
    expect(src('english')).toEqual(['cds/mcq'])
  })

  it('imports a pool many times the paper, so two papers rarely share a question', () => {
    for (const s of HIRING_SUBJECTS) {
      for (const { format, pool } of HIRING_SOURCES[s]) {
        // Two random draws of k from a pool of p share k²/p questions on average.
        const k = HIRING_SHAPE[s][format]
        expect((k * k) / pool).toBeLessThanOrEqual(0.75)
      }
    }
  })
})

describe('rejectReason', () => {
  it('accepts a plain MCQ and a whole-number typed answer', () => {
    expect(rejectReason(mcq(), 'maths')).toBeNull()
    expect(rejectReason(numeric(), 'maths')).toBeNull()
  })

  it('refuses a figure on the question or on an option, since v1 stores no images', () => {
    expect(rejectReason(mcq({ image_url: 'https://x/fig.png' }), 'physics')).toBe('figure')
    const withImg = opts().map((o, i) => (i === 2 ? { ...o, image_url: 'https://x/o.png' } : o))
    expect(rejectReason(mcq({ options: withImg }), 'physics')).toBe('figure')
    expect(rejectReason(mcq({ text: 'See ![](https://x/f.png)' }), 'physics')).toBe('figure')
  })

  it('refuses a table', () => {
    expect(rejectReason(mcq({ text: '| a | b |\n|---|---|\n| 1 | 2 |' }), 'chemistry')).toBe('table')
  })

  it('refuses a shared stem in maths and science: the question leans on its neighbours', () => {
    expect(rejectReason(mcq({ context: 'Consider the following for the next two items.' }), 'maths')).toBe('context')
  })

  it('keeps a short English direction, but not a passage', () => {
    expect(rejectReason(mcq({ context: 'Directions: improve the underlined part.' }), 'english')).toBeNull()
    expect(rejectReason(mcq({ context: 'x'.repeat(161) }), 'english')).toBe('context')
  })

  it('refuses an MCQ without four options or one key', () => {
    expect(rejectReason(mcq({ options: opts().slice(0, 3) }), 'maths')).toBe('options')
    expect(rejectReason(mcq({ options: opts().map((o) => ({ ...o, is_correct: true })) }), 'maths')).toBe('key')
    expect(rejectReason(mcq({ options: opts().map((o) => ({ ...o, is_correct: false })) }), 'maths')).toBe('key')
    const blank = opts().map((o, i) => (i === 0 ? { ...o, text: '  ' } : o))
    expect(rejectReason(mcq({ options: blank }), 'maths')).toBe('options')
  })

  it('refuses a typed answer that is not a whole number from 0 to 9999', () => {
    expect(rejectReason(numeric({ numeric_answer: null }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: 2.5 }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: -3 }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: 10000 }), 'maths')).toBe('answer')
    expect(rejectReason(numeric({ numeric_answer: '42' }), 'maths')).toBeNull()
  })

  it('refuses maths KaTeX cannot draw', () => {
    expect(rejectReason(mcq({ text: String.raw`Find \(\frac{1}{\).` }), 'maths')).toBe('math')
    const bad = opts().map((o, i) => (i === 1 ? { ...o, text: String.raw`\(\sqrt{\)` } : o))
    expect(rejectReason(mcq({ options: bad }), 'maths')).toBe('math')
  })

  it('refuses an empty question', () => {
    expect(rejectReason(mcq({ text: '   ' }), 'maths')).toBe('empty')
  })
})

describe('toHiringItem', () => {
  it('turns an MCQ into the bank shape, options keyed by letter', () => {
    expect(toHiringItem(mcq({ options: opts('C') }), 'maths', 'nda')).toEqual({
      source_ref: 'q1',
      source: 'nda',
      paper: 'NDA (I) 2024',
      // (the note names exam and year, so it stands alone)
      subject: 'maths',
      chapter: 'Algebra',
      format: 'mcq',
      direction: null,
      stem: String.raw`If \(x = 2\), find \(x^2\).`,
      options: { A: 'option A', B: 'option B', C: 'option C', D: 'option D' },
      answer_key: 'C',
      numeric_answer: null,
    })
  })

  it('carries a typed answer as a number and no options', () => {
    expect(toHiringItem(numeric({ numeric_answer: '42' }), 'physics', 'jee-mains')).toMatchObject({
      format: 'numeric',
      options: null,
      answer_key: null,
      numeric_answer: 42,
    })
  })

  it('keeps an English direction, trimmed', () => {
    expect(toHiringItem(mcq({ context: '  Directions: spot the error. ' }), 'english', 'cds').direction).toBe(
      'Directions: spot the error.',
    )
  })

  it('names the paper from the year when PYQ Vault has no note', () => {
    expect(toHiringItem(mcq({ pyq_note: null, pyq_year: 2019 }), 'maths', 'nda').paper).toBe('NDA 2019')
    expect(toHiringItem(mcq({ pyq_note: null, pyq_year: null }), 'maths', 'nda').paper).toBe('NDA')
  })

  // PYQ Vault's note is a sitting label whose form varies by exam.
  it('leads with the exam and year, then the note', () => {
    const paper = (note: string, year: number, source: 'nda' | 'mht-cet' | 'jee-mains' | 'cds') =>
      toHiringItem(mcq({ pyq_note: note, pyq_year: year }), 'maths', source).paper
    expect(paper('21 April Shift I', 2025, 'mht-cet')).toBe('MHT-CET 2025 · 21 April Shift I')
    expect(paper('Paper 25', 2024, 'jee-mains')).toBe('JEE Mains 2024 · Paper 25')
    expect(paper('NDA 1', 2019, 'nda')).toBe('NDA 2019 · NDA 1')
    // The note already holds the year: not repeated.
    expect(paper('29 January 2023', 2023, 'jee-mains')).toBe('JEE Mains · 29 January 2023')
    // The note already names exam and year: the note alone.
    expect(paper('CDS (II) 2023 — English', 2023, 'cds')).toBe('CDS (II) 2023 — English')
  })
})

describe('lintHiringBank', () => {
  const item = (over: Partial<HiringItem> = {}): HiringItem => ({
    source_ref: 'r1',
    source: 'nda',
    paper: 'NDA 2024',
    subject: 'maths',
    chapter: 'Algebra',
    format: 'mcq',
    direction: null,
    stem: String.raw`Find \(x\).`,
    options: { A: '1', B: '2', C: '3', D: '4' },
    answer_key: 'A',
    numeric_answer: null,
    ...over,
  })
  // Exactly what every paper needs, so the coverage rule is quiet.
  const full = (): HiringItem[] =>
    HIRING_SUBJECTS.flatMap((subject) =>
      (['mcq', 'numeric'] as const).flatMap((format) =>
        Array.from({ length: HIRING_SHAPE[subject][format] }, (_, i) =>
          item({
            source_ref: `${subject}-${format}-${i}`,
            subject,
            source: subject === 'english' ? 'cds' : format === 'numeric' ? 'jee-mains' : subject === 'maths' ? 'nda' : 'mht-cet',
            format,
            options: format === 'mcq' ? { A: '1', B: '2', C: '3', D: '4' } : null,
            answer_key: format === 'mcq' ? 'A' : null,
            numeric_answer: format === 'numeric' ? 7 : null,
          }),
        ),
      ),
    )

  it('passes a bank that can fill every paper', () => {
    expect(lintHiringBank(full())).toEqual([])
  })

  it('names a subject that cannot fill its paper', () => {
    const bank = full().filter((i) => !(i.subject === 'physics' && i.format === 'numeric' && i.source_ref.endsWith('-0')))
    expect(lintHiringBank(bank)).toEqual(['physics: 2 typed-answer questions, the paper needs 3'])
  })

  it('does not count retired questions towards a paper', () => {
    const bank = full().map((i) => (i.source_ref === 'english-mcq-0' ? { ...i, status: 'retired' as const } : i))
    expect(lintHiringBank(bank)).toEqual(['english: 14 MCQ questions, the paper needs 15'])
  })

  it('refuses a repeated reference', () => {
    expect(lintHiringBank([...full(), item({ source_ref: 'maths-mcq-0' })])).toContain('maths-mcq-0: listed twice')
  })

  it('refuses a broken shape, a source the subject does not use, and maths KaTeX cannot draw', () => {
    const errors = lintHiringBank([
      ...full(),
      item({ source_ref: 'x1', options: { A: '1', B: '2', C: '3', D: '' } }),
      item({ source_ref: 'x2', format: 'numeric', options: null, answer_key: null, numeric_answer: 2.5, source: 'jee-mains' }),
      item({ source_ref: 'x3', source: 'cds' }),
      item({ source_ref: 'x4', direction: 'Directions: none here.' }),
      item({ source_ref: 'x5', stem: String.raw`\(\frac{1}{\)` }),
    ])
    expect(errors).toEqual([
      'x1: an MCQ needs four options and a key',
      'x2: a typed answer must be a whole number from 0 to 9999',
      'x3: maths MCQ comes from nda, not cds',
      'x4: only English carries a direction',
      expect.stringMatching(/^x5: maths KaTeX cannot draw/),
    ])
  })
})

describe('toApplicantPaper', () => {
  const row = (position: number, over: Partial<HiringItemRow> = {}): { position: number; item: HiringItemRow } => ({
    position,
    item: {
      id: 'a1b2c3d4-0000-4000-8000-00000000beef',
      source_ref: 'SRC-REF-7319',
      source: 'nda',
      paper: 'NDA 2019 · PAPER-LABEL',
      subject: 'maths',
      chapter: 'CHAPTER-NAME',
      format: 'mcq',
      direction: null,
      stem: String.raw`Find \(x\).`,
      options: { A: 'one', B: 'two', C: 'three', D: 'four' },
      answer_key: 'C',
      numeric_answer: null,
      status: 'live',
      ...over,
    },
  })

  // The applicant's browser must never receive the key, nor anything that
  // finds the question in PYQ Vault (its id, paper or chapter). Checked on the
  // serialized bytes, since a property check is defeated by nesting.
  it('sends no key, answer, id, source, paper or chapter', () => {
    const bytes = JSON.stringify(
      toApplicantPaper([
        row(1),
        row(2, { format: 'numeric', options: null, answer_key: null, numeric_answer: 7319, stem: 'How many?' }),
      ]),
    )
    for (const secret of ['answer_key', 'numeric_answer', '7319', 'beef', 'SRC-REF', 'PAPER-LABEL', 'CHAPTER-NAME', ':"C"', 'source', 'status']) {
      expect(bytes).not.toContain(secret)
    }
  })

  it('sends the question as HTML with maths drawn, in position order', () => {
    const paper = toApplicantPaper([row(2, { stem: 'second' }), row(1)])
    expect(paper.map((q) => q.position)).toEqual([1, 2])
    expect(paper[0]!.stem).toContain('class="katex"')
    expect(paper[0]!.options).toEqual({ A: 'one', B: 'two', C: 'three', D: 'four' })
    expect(paper[1]!.stem).toBe('second')
  })

  it('sends a typed-answer question without options, and an English direction', () => {
    const [typed] = toApplicantPaper([row(1, { format: 'numeric', options: null, answer_key: null, numeric_answer: 4 })])
    expect(typed).toMatchObject({ format: 'numeric', options: null, direction: null })
    const [eng] = toApplicantPaper([row(1, { subject: 'english', direction: 'Directions: spot the <error>.' })])
    expect(eng!.direction).toBe('Directions: spot the &lt;error&gt;.')
  })

  it('copies only A to D from the stored options', () => {
    const [q] = toApplicantPaper([row(1, { options: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'stray' } as never })])
    expect(Object.keys(q!.options!)).toEqual(['A', 'B', 'C', 'D'])
  })
})

describe('validateApplicant', () => {
  it('normalises the number and trims the name', () => {
    expect(validateApplicant({ name: '  Asha Rao ', mobile: '+91 98765 43210', subject: 'physics' })).toEqual({
      ok: true,
      value: { name: 'Asha Rao', mobile: '9876543210', subject: 'physics' },
    })
  })

  it('says what is wrong, one thing at a time', () => {
    expect(validateApplicant({ name: '', mobile: '9876543210', subject: 'maths' })).toEqual({ ok: false, error: 'Enter the applicant’s name.' })
    expect(validateApplicant({ name: 'x'.repeat(101), mobile: '9876543210', subject: 'maths' })).toEqual({
      ok: false,
      error: 'The name is too long.',
    })
    expect(validateApplicant({ name: 'A', mobile: '12345', subject: 'maths' })).toEqual({ ok: false, error: 'Enter a 10-digit mobile number.' })
    expect(validateApplicant({ name: 'A', mobile: '9876543210', subject: 'biology' })).toEqual({ ok: false, error: 'Choose a subject.' })
  })
})

describe('hiringIssueMessage', () => {
  it('names the applicant, the test and its terms, the link last on its own', () => {
    const m = hiringIssueMessage({ name: 'Asha Rao', subject: 'physics', url: 'https://x.test/h/abc' })
    expect(m).toBe(
      'Hello Asha Rao, this is the Physics screening test for the teaching post: 15 questions in 25 minutes. ' +
        'Once you start, the clock does not stop, so start when you have 25 minutes free. ' +
        'The link works for 24 hours. When it asks, enter the mobile number you gave us. ' +
          'If you are called for an interview, you will be asked to solve and explain some of these questions there.' +
          '\n\nhttps://x.test/h/abc',
    )
  })

  it('gives English its own time', () => {
    expect(hiringIssueMessage({ name: 'A', subject: 'english', url: 'u' })).toContain('15 questions in 20 minutes')
  })
})

describe('applicantStatus', () => {
  const now = new Date('2026-10-20T10:00:00Z')
  const test = (state: string, over: object = {}) => ({
    state,
    issue_seq: 1,
    expires_at: '2026-10-21T00:00:00Z',
    ...over,
  })
  const attempt = (over: object = {}) => ({
    started_at: '2026-10-20T09:50:00Z',
    deadline_at: '2026-10-20T10:15:00Z',
    submitted_at: null,
    submit_reason: null,
    ...over,
  })

  it('says what stage each applicant is at, and whether a link can be issued', () => {
    expect(applicantStatus(null, null, now)).toEqual({ kind: 'none', label: 'No test yet', canIssue: true })
    expect(applicantStatus(test('issued'), null, now)).toEqual({ kind: 'sent', label: 'Link sent', canIssue: true })
    expect(applicantStatus(test('opened'), null, now)).toEqual({ kind: 'opened', label: 'Opened, not started', canIssue: true })
    expect(applicantStatus(test('started'), attempt(), now)).toEqual({ kind: 'in_progress', label: 'Taking the test', canIssue: true })
    expect(applicantStatus(test('submitted'), attempt({ submitted_at: '2026-10-20T10:05:00Z', submit_reason: 'manual' }), now)).toEqual({
      kind: 'submitted',
      label: 'Submitted',
      canIssue: false,
    })
    expect(applicantStatus(test('submitted'), attempt({ submitted_at: '2026-10-20T10:15:00Z', submit_reason: 'timer' }), now)).toEqual({
      kind: 'submitted',
      label: 'Submitted when time ran out',
      canIssue: false,
    })
  })

  it('calls an unstarted link past its 24 hours expired', () => {
    expect(applicantStatus(test('opened', { expires_at: '2026-10-20T09:00:00Z' }), null, now)).toEqual({
      kind: 'expired',
      label: 'Link expired',
      canIssue: true,
    })
  })

  it('stops offering a link after the third', () => {
    expect(applicantStatus(test('opened', { issue_seq: 3 }), null, now).canIssue).toBe(false)
  })
})

describe('timeUsedMs', () => {
  it('is submit minus start, never more than the paper allows', () => {
    const a = { started_at: '2026-10-20T10:00:00Z', submitted_at: '2026-10-20T10:12:30Z' }
    expect(timeUsedMs(a, 25)).toBe(12.5 * 60_000)
    expect(timeUsedMs({ ...a, submitted_at: '2026-10-20T10:40:00Z' }, 25)).toBe(25 * 60_000)
    expect(timeUsedMs({ ...a, submitted_at: null }, 25)).toBeNull()
  })
})

// Found live: the server runs on UTC, so "added 19 Oct, 08:47 am" was 2:17 pm
// in India. Every hiring time is shown in India's time, wherever it renders.
describe('istTime', () => {
  it('shows a date and time in India, not in the server zone', () => {
    expect(istTime('2026-10-19T08:47:00Z')).toBe('19 Oct, 02:17 pm')
    expect(istTime('2026-10-19T20:00:00Z')).toBe('20 Oct, 01:30 am')
  })

  it('shows a date alone in India too', () => {
    expect(istDay('2026-10-19T20:00:00Z')).toBe('20 Oct')
  })
})

describe('parseTypedAnswer', () => {
  it('reads a whole number from 0 to 9999', () => {
    expect(parseTypedAnswer('42')).toBe(42)
    expect(parseTypedAnswer(' 0 ')).toBe(0)
    expect(parseTypedAnswer('0042')).toBe(42)
    expect(parseTypedAnswer('9999')).toBe(9999)
  })

  it('reads blank as no answer', () => {
    expect(parseTypedAnswer('')).toBeNull()
    expect(parseTypedAnswer('   ')).toBeNull()
  })

  it('refuses anything else', () => {
    for (const bad of ['-1', '10000', '2.5', '1e3', '12a', '½', '1,000']) expect(parseTypedAnswer(bad)).toBe('invalid')
  })
})

describe('pickPool', () => {
  const rows = (chapter: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ source_ref: `${chapter}-${i}`, chapter }))
  const candidates = [...rows('Algebra', 60), ...rows('Calculus', 30), ...rows('Trigonometry', 10)]

  it('takes exactly n, with no repeats', () => {
    const picked = pickPool(candidates, 50, 'seed')
    expect(picked).toHaveLength(50)
    expect(new Set(picked.map((p) => p.source_ref)).size).toBe(50)
  })

  it('spreads across chapters in proportion to the source', () => {
    const picked = pickPool(candidates, 50, 'seed')
    const count = (c: string) => picked.filter((p) => p.chapter === c).length
    expect([count('Algebra'), count('Calculus'), count('Trigonometry')]).toEqual([30, 15, 5])
  })

  it('is the same pick for the same seed, and a different one for another', () => {
    const ids = (seed: string) => pickPool(candidates, 50, seed).map((p) => p.source_ref)
    expect(ids('a')).toEqual(ids('a'))
    expect(ids('a')).not.toEqual(ids('b'))
  })

  it('takes everything when the source has fewer than n', () => {
    expect(pickPool(candidates, 500, 'seed')).toHaveLength(100)
  })

  it('lists the pick by chapter, then by reference, so a re-import diffs cleanly', () => {
    const picked = pickPool(candidates, 20, 'seed')
    const keys = picked.map((p) => `${p.chapter}\u0000${p.source_ref}`)
    expect(keys).toEqual([...keys].sort())
  })
})

// ── after the test: decision, notes, resume (migration 0023) ────────────────

describe('decisions', () => {
  it('starts every applicant in progress', () => {
    expect(HIRING_DECISIONS[0]).toBe('in_progress')
    expect(HIRING_DECISIONS).toEqual(['in_progress', 'shortlisted', 'on_hold', 'hired', 'rejected', 'withdrawn'])
  })

  it('leaves hired and rejected to superadmin, both ways', () => {
    expect(mayChangeDecision('teacher', 'in_progress', 'shortlisted')).toBe(true)
    expect(mayChangeDecision('teacher', 'shortlisted', 'withdrawn')).toBe(true)
    expect(mayChangeDecision('teacher', 'shortlisted', 'hired')).toBe(false)
    expect(mayChangeDecision('teacher', 'in_progress', 'rejected')).toBe(false)
    expect(mayChangeDecision('teacher', 'hired', 'on_hold')).toBe(false)
    expect(mayChangeDecision('teacher', 'rejected', 'in_progress')).toBe(false)
    expect(mayChangeDecision('superadmin', 'rejected', 'hired')).toBe(true)
    expect(mayChangeDecision('superadmin', 'in_progress', 'rejected')).toBe(true)
  })

  it('refuses every role but teacher and superadmin', () => {
    expect(mayChangeDecision('counsellor', 'in_progress', 'shortlisted')).toBe(false)
    expect(mayChangeDecision('telecaller', 'in_progress', 'shortlisted')).toBe(false)
  })

  it('offers a teacher the four open decisions, and nothing once superadmin has decided', () => {
    expect(decisionChoices('teacher', 'in_progress')).toEqual(['in_progress', 'shortlisted', 'on_hold', 'withdrawn'])
    expect(decisionChoices('teacher', 'hired')).toEqual(['hired'])
    expect(decisionChoices('superadmin', 'rejected')).toEqual(HIRING_DECISIONS)
  })

  it('words a history line from its codes', () => {
    expect(formatDecisionChange('in_progress → hired')).toBe('Decision: In progress → Hired')
    expect(formatDecisionChange('on_hold → withdrawn')).toBe('Decision: On hold → Withdrawn')
    expect(formatDecisionChange('garbled')).toBe('Decision: garbled')
  })
})

describe('notes', () => {
  it('trims a note and refuses an empty or overlong one', () => {
    expect(validateNote('  Strong on calculus  ')).toEqual({ ok: true, value: 'Strong on calculus' })
    expect(validateNote('   ')).toEqual({ ok: false, error: 'Write a note first.' })
    expect(validateNote('x'.repeat(2001))).toEqual({ ok: false, error: 'A note can be at most 2000 characters.' })
    expect(validateNote('x'.repeat(2000)).ok).toBe(true)
  })
})

describe('notePreview', () => {
  it('is the note on one line', () => {
    expect(notePreview('Strong on\n\ncalculus.   Call Monday')).toBe('Strong on calculus. Call Monday')
  })

  it('cuts a long note at a word, with an ellipsis', () => {
    const long = 'Strong on calculus and coordinate geometry, weaker on probability; call for a demo class on Monday'
    const p = notePreview(long, 60)
    expect(p.length).toBeLessThanOrEqual(60)
    expect(p).toBe('Strong on calculus and coordinate geometry, weaker on…')
  })

  it('cuts a note with no spaces at the limit', () => {
    expect(notePreview('x'.repeat(100), 10)).toBe('xxxxxxxxx…')
  })
})

describe('checkResume', () => {
  const PDF = new TextEncoder().encode('%PDF-1.7 ')
  const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])
  const file = (name: string, size = 1000) => ({ name, size })

  it('takes a PDF and a Word file, with the content type the bucket allows', () => {
    expect(checkResume(file('Asha CV.PDF'), PDF)).toEqual({ ok: true, kind: 'pdf', contentType: 'application/pdf' })
    expect(checkResume(file('resume.docx'), ZIP)).toEqual({
      ok: true,
      kind: 'docx',
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
  })

  it('refuses other files, naming the fix for an old Word file', () => {
    expect(checkResume(file('photo.jpg'), PDF)).toEqual({ ok: false, error: 'Choose a PDF or a Word (.docx) file.' })
    expect(checkResume(file('old.doc'), PDF)).toEqual({
      ok: false,
      error: 'Old Word files (.doc) are not accepted. Save it as .docx or PDF and try again.',
    })
  })

  it('refuses an empty file and one over 5 MB', () => {
    expect(RESUME_MAX_BYTES).toBe(5 * 1024 * 1024)
    expect(checkResume(file('a.pdf', 0), PDF)).toEqual({ ok: false, error: 'The file is empty.' })
    expect(checkResume(file('a.pdf', RESUME_MAX_BYTES + 1), PDF)).toEqual({ ok: false, error: 'The file is over 5 MB.' })
    expect(checkResume(file('a.pdf', RESUME_MAX_BYTES), PDF).ok).toBe(true)
  })

  it('refuses a file whose contents do not match its name', () => {
    expect(checkResume(file('a.pdf'), ZIP)).toEqual({ ok: false, error: 'This file is not a real PDF.' })
    expect(checkResume(file('a.docx'), PDF)).toEqual({ ok: false, error: 'This file is not a real Word (.docx) file.' })
  })
})

describe('resumeDownloadName', () => {
  it('names the file after the applicant, with nothing a file system refuses', () => {
    expect(resumeDownloadName('Asha Rao', 'pdf')).toBe('Asha Rao - resume.pdf')
    expect(resumeDownloadName('A/B: "C"?', 'docx')).toBe('A B C - resume.docx')
  })
})
