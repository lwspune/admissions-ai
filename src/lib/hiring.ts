import { mathErrors, mathToHtml } from './mathText'
import { CHOICES, type Choice } from './types'
import { normalizeMobile } from './mobile'

// The teacher screening test (HIRING_TEST_SPEC.md): fifteen moderate questions
// from real exam papers, a different set for every applicant. Questions come
// from PYQ Vault's public bank; this module holds the rules for which of its
// questions this test can carry and how many are taken. Pure.

export type HiringSubject = 'maths' | 'physics' | 'chemistry' | 'english'
export const HIRING_SUBJECTS: readonly HiringSubject[] = ['maths', 'physics', 'chemistry', 'english'] as const

export const HIRING_SUBJECT_LABEL: Record<HiringSubject, string> = {
  maths: 'Maths',
  physics: 'Physics',
  chemistry: 'Chemistry',
  english: 'English',
}

export type HiringSource = 'nda' | 'mht-cet' | 'jee-mains' | 'cds'
export type HiringFormat = 'mcq' | 'numeric'

const SOURCE_NAME: Record<HiringSource, string> = {
  nda: 'NDA',
  'mht-cet': 'MHT-CET',
  'jee-mains': 'JEE Mains',
  cds: 'CDS',
}

/** The paper, per subject (owner, 2026-10-19). Typed answers take longer, hence 25 minutes. */
export const HIRING_SHAPE: Record<HiringSubject, Record<HiringFormat, number> & { minutes: number }> = {
  maths: { mcq: 12, numeric: 3, minutes: 25 },
  physics: { mcq: 12, numeric: 3, minutes: 25 },
  chemistry: { mcq: 12, numeric: 3, minutes: 25 },
  english: { mcq: 15, numeric: 0, minutes: 20 },
}

/**
 * Where each subject's questions come from, and how many the bank keeps. MCQs
 * come from the exam the teacher will teach for; NDA and MHT-CET print no typed
 * answers, so those come from JEE Mains. Two random papers of k drawn from p
 * share k²/p questions on average — under one, at these sizes.
 */
export const HIRING_SOURCES: Record<HiringSubject, { source: HiringSource; format: HiringFormat; pool: number }[]> = {
  maths: [
    { source: 'nda', format: 'mcq', pool: 200 },
    { source: 'jee-mains', format: 'numeric', pool: 50 },
  ],
  physics: [
    { source: 'mht-cet', format: 'mcq', pool: 200 },
    { source: 'jee-mains', format: 'numeric', pool: 50 },
  ],
  chemistry: [
    { source: 'mht-cet', format: 'mcq', pool: 200 },
    { source: 'jee-mains', format: 'numeric', pool: 50 },
  ],
  english: [{ source: 'cds', format: 'mcq', pool: 300 }],
}

/** A PYQ Vault question as its public API returns it, with the chapter's name. */
export interface SourceRow {
  id: string
  text: string
  context: string | null
  image_url: string | null
  question_format: HiringFormat
  numeric_answer: number | string | null
  pyq_year: number | null
  pyq_note: string | null
  chapter: string
  options: { label: string; text: string; is_correct: boolean; image_url: string | null }[]
}

/** One question in the hiring bank (table hiring_items). */
export interface HiringItem {
  source_ref: string
  source: HiringSource
  /** The paper it was set in, for staff. */
  paper: string
  subject: HiringSubject
  chapter: string
  format: HiringFormat
  /** An English question's printed direction ("Spot the error…"); null elsewhere. */
  direction: string | null
  stem: string
  options: Record<Choice, string> | null
  answer_key: Choice | null
  numeric_answer: number | null
  /** Set in the file only to retire a question; the seed otherwise keeps what the database has. */
  status?: 'retired'
}

/** A row of hiring_items as the database holds it — key and all. Server-side only. */
export interface HiringItemRow extends Omit<HiringItem, 'status'> {
  id: string
  status: 'review' | 'live' | 'retired'
}

/** Hours an applicant has to start the test after it is issued (owner's default, 2026-10-19). */
export const HIRING_WINDOW_HOURS = 24
/** The first issue and two reissues. */
export const MAX_HIRING_ISSUES = 3

/** Exactly what an applicant's browser receives: HTML to show, never the key. */
export interface ApplicantQuestion {
  position: number
  format: HiringFormat
  /** An English question's printed direction, as HTML; null elsewhere. */
  direction: string | null
  stem: string
  options: Record<Choice, string> | null
}

/**
 * Strips a hiring paper to what the applicant may see — the security boundary
 * of this test, as toCandidatePaper is of the admissions one. An ALLOW-LIST: a
 * column added to hiring_items later does not start reaching applicants. Also
 * withheld: the id, source, paper and chapter, which would find the question
 * (and its answer) in PYQ Vault in one search.
 *
 * Text arrives as HTML, maths already drawn, because the applicant's screen is
 * a client component and KaTeX runs on the server only (mathToHtml escapes
 * everything else).
 */
export function toApplicantPaper(rows: { position: number; item: HiringItemRow }[]): ApplicantQuestion[] {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map(({ position, item }) => ({
      position,
      format: item.format,
      direction: item.direction ? mathToHtml(item.direction) : null,
      stem: mathToHtml(item.stem),
      options:
        item.format === 'mcq' && item.options
          ? (Object.fromEntries(CHOICES.map((c) => [c, mathToHtml(String(item.options![c] ?? ''))])) as Record<Choice, string>)
          : null,
    }))
}

/**
 * The WhatsApp message for a freshly issued link. It warns that the clock does
 * not stop, since that is the one rule an applicant can lose time to, and puts
 * the link last on its own line so WhatsApp previews it.
 */
export function hiringIssueMessage({ name, subject, url }: { name: string; subject: HiringSubject; url: string }): string {
  const { mcq, numeric, minutes } = HIRING_SHAPE[subject]
  return (
    `Hello ${name}, this is the ${HIRING_SUBJECT_LABEL[subject]} screening test for the teaching post: ` +
    `${mcq + numeric} questions in ${minutes} minutes. ` +
    `Once you start, the clock does not stop, so start when you have ${minutes} minutes free. ` +
    `The link works for ${HIRING_WINDOW_HOURS} hours. When it asks, enter the mobile number you gave us. ` +
    `If you are called for an interview, you will be asked to solve and explain some of these questions there.\n\n${url}`
  )
}

export type ApplicantStage = 'none' | 'sent' | 'opened' | 'in_progress' | 'expired' | 'submitted'

/**
 * Where an applicant stands, from their latest test and its attempt, in words
 * for the staff list — and whether another link may be issued (the database
 * refuses the same: three issues, none after a submit).
 */
export function applicantStatus(
  test: { state: string; issue_seq: number; expires_at: string } | null,
  attempt: { deadline_at: string; submitted_at: string | null; submit_reason: string | null } | null,
  now: Date,
): { kind: ApplicantStage; label: string; canIssue: boolean } {
  if (!test) return { kind: 'none', label: 'No test yet', canIssue: true }
  const more = test.issue_seq < MAX_HIRING_ISSUES
  if (test.state === 'submitted' || attempt?.submitted_at) {
    const label = attempt?.submit_reason === 'timer' ? 'Submitted when time ran out' : 'Submitted'
    return { kind: 'submitted', label, canIssue: false }
  }
  if (test.state === 'started') return { kind: 'in_progress', label: 'Taking the test', canIssue: more }
  if (now.getTime() >= new Date(test.expires_at).getTime()) return { kind: 'expired', label: 'Link expired', canIssue: more }
  if (test.state === 'opened') return { kind: 'opened', label: 'Opened, not started', canIssue: more }
  return { kind: 'sent', label: 'Link sent', canIssue: more }
}

// ── after the test: decision, notes, resume (migration 0023) ────────────────

export const HIRING_DECISIONS = ['in_progress', 'shortlisted', 'on_hold', 'hired', 'rejected', 'withdrawn'] as const
export type HiringDecision = (typeof HIRING_DECISIONS)[number]

export const HIRING_DECISION_LABEL: Record<HiringDecision, string> = {
  in_progress: 'In progress',
  shortlisted: 'Shortlisted',
  on_hold: 'On hold',
  hired: 'Hired',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

/** Superadmin's alone, into and out of (the owner, 2026-10-24). */
const FINAL_DECISIONS: readonly HiringDecision[] = ['hired', 'rejected']

const isDecision = (v: unknown): v is HiringDecision => HIRING_DECISIONS.includes(v as HiringDecision)

/** The rule hiring_applicants_decision_guard enforces, for the page to offer only what will save. */
export function mayChangeDecision(role: unknown, from: HiringDecision, to: HiringDecision): boolean {
  if (role === 'superadmin') return true
  if (role !== 'teacher') return false
  return !FINAL_DECISIONS.includes(from) && !FINAL_DECISIONS.includes(to)
}

/** What the decision control lists: the current one, then every one this role may move to. */
export function decisionChoices(role: unknown, current: HiringDecision): HiringDecision[] {
  return HIRING_DECISIONS.filter((d) => d === current || mayChangeDecision(role, current, d))
}

/** A decision line is stored as "old → new" in codes (hiring_applicants_decision_history). */
export function formatDecisionChange(body: string): string {
  const [from, to] = body.split(' → ')
  if (isDecision(from) && isDecision(to)) return `Decision: ${HIRING_DECISION_LABEL[from]} → ${HIRING_DECISION_LABEL[to]}`
  return `Decision: ${body}`
}

export const MAX_HIRING_NOTE = 2000

export function validateNote(body: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = String(body ?? '').trim()
  if (!value) return { ok: false, error: 'Write a note first.' }
  if (value.length > MAX_HIRING_NOTE) return { ok: false, error: `A note can be at most ${MAX_HIRING_NOTE} characters.` }
  return { ok: true, value }
}

/** The hiring-resumes bucket's limit; the bucket refuses past it too. */
export const RESUME_MAX_BYTES = 5 * 1024 * 1024

export type ResumeKind = 'pdf' | 'docx'

const RESUME: Record<ResumeKind, { contentType: string; magic: number[]; label: string }> = {
  pdf: { contentType: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d], label: 'PDF' }, // %PDF-
  docx: {
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: [0x50, 0x4b, 0x03, 0x04], // a zip, which a .docx is
    label: 'Word (.docx) file',
  },
}

/**
 * A resume before upload: by its name, its size and its first bytes. The
 * browser's own type is not trusted (Windows reports a .docx inconsistently);
 * the upload is sent with the canonical type, which the bucket checks.
 */
export function checkResume(
  file: { name: string; size: number },
  head: Uint8Array,
): { ok: true; kind: ResumeKind; contentType: string } | { ok: false; error: string } {
  const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase()
  if (ext === 'doc') return { ok: false, error: 'Old Word files (.doc) are not accepted. Save it as .docx or PDF and try again.' }
  if (ext !== 'pdf' && ext !== 'docx') return { ok: false, error: 'Choose a PDF or a Word (.docx) file.' }
  if (file.size === 0) return { ok: false, error: 'The file is empty.' }
  if (file.size > RESUME_MAX_BYTES) return { ok: false, error: 'The file is over 5 MB.' }
  const r = RESUME[ext]
  if (!r.magic.every((b, i) => head[i] === b)) return { ok: false, error: `This file is not a real ${r.label}.` }
  return { ok: true, kind: ext, contentType: r.contentType }
}

/** The name a downloaded resume is saved under. */
export function resumeDownloadName(applicantName: string, kind: ResumeKind): string {
  const safe = applicantName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Applicant'
  return `${safe} - resume.${kind}`
}

// India's time, wherever the page renders: Vercel's servers run on UTC, and a
// client component renders on the server first, so the zone is always named.
const IST_TIME = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const IST_DAY = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })

/** "19 Oct, 02:17 pm", in India. */
export const istTime = (iso: string) => IST_TIME.format(new Date(iso))
/** "19 Oct", in India. */
export const istDay = (iso: string) => IST_DAY.format(new Date(iso))

/** Time spent on a submitted attempt, capped at the paper's minutes; null until submitted. */
export function timeUsedMs(attempt: { started_at: string; submitted_at: string | null }, limitMinutes: number): number | null {
  if (!attempt.submitted_at) return null
  const spent = new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()
  return Math.max(0, Math.min(spent, limitMinutes * 60_000))
}

export interface NewApplicant {
  name: string
  mobile: string
  subject: HiringSubject
}

/**
 * The add-applicant form's checks, before anything reaches the database (which
 * refuses the same things: migration 0021). The number is normalised as on
 * leads, so "+91 98765 43210" and "09876543210" are one applicant's number.
 */
export function validateApplicant(input: { name: string; mobile: string; subject: string }):
  | { ok: true; value: NewApplicant }
  | { ok: false; error: string } {
  const name = String(input.name ?? '').trim()
  if (!name) return { ok: false, error: 'Enter the applicant’s name.' }
  if (name.length > 100) return { ok: false, error: 'The name is too long.' }
  const mobile = normalizeMobile(String(input.mobile ?? ''))
  if (!mobile) return { ok: false, error: 'Enter a 10-digit mobile number.' }
  if (!HIRING_SUBJECTS.includes(input.subject as HiringSubject)) return { ok: false, error: 'Choose a subject.' }
  return { ok: true, value: { name, mobile, subject: input.subject as HiringSubject } }
}

/**
 * A typed answer as the applicant entered it: a whole number from 0 to 9999,
 * null when blank, 'invalid' otherwise. Every typed answer in the bank is such
 * a number (hiring_items_format_pairing), so nothing else can be right.
 */
export function parseTypedAnswer(raw: string): number | null | 'invalid' {
  const s = raw.trim()
  if (s === '') return null
  if (!/^\d{1,4}$/.test(s.replace(/^0+(?=\d)/, ''))) return 'invalid'
  return Number(s)
}

/**
 * Measured on PYQ Vault 2026-10-19: CDS English directions run to about 140
 * characters, passages far beyond. PYQ Vault's own cut is 16–137 against 180.
 */
export const MAX_DIRECTION = 160
export const MAX_NUMERIC = 9999

export type RejectReason = 'empty' | 'figure' | 'table' | 'context' | 'options' | 'key' | 'answer' | 'math'

const LETTERS: readonly Choice[] = ['A', 'B', 'C', 'D']

/**
 * Why this question cannot go on the test, or null if it can. v1 carries no
 * images and no tables, a maths or science question must stand alone, and an
 * English one may keep a short direction but not a passage.
 */
export function rejectReason(row: SourceRow, subject: HiringSubject): RejectReason | null {
  if (!row.text.trim()) return 'empty'

  const texts = [row.text, row.context ?? '', ...row.options.map((o) => o.text)]
  if (row.image_url || row.options.some((o) => o.image_url) || texts.some((t) => /!\[|<img/i.test(t))) return 'figure'
  if (texts.some((t) => /\|\s*-{3}/.test(t))) return 'table'

  if (row.context !== null && row.context.trim()) {
    if (subject !== 'english' || row.context.trim().length > MAX_DIRECTION) return 'context'
  }

  if (row.question_format === 'mcq') {
    const labels = row.options.map((o) => o.label).sort()
    if (labels.join('') !== 'ABCD' || row.options.some((o) => !o.text.trim())) return 'options'
    if (row.options.filter((o) => o.is_correct).length !== 1) return 'key'
  } else {
    const v = row.numeric_answer === null ? NaN : Number(row.numeric_answer)
    if (!Number.isInteger(v) || v < 0 || v > MAX_NUMERIC) return 'answer'
  }

  if (texts.some((t) => mathErrors(t).length > 0)) return 'math'
  return null
}

/**
 * The paper a question was set in, for staff. PYQ Vault's note is a sitting
 * label whose form varies by exam ("Paper 25", "21 April Shift I", "CDS (II)
 * 2023 — English"), so the exam and year lead unless the note already says them.
 */
function paperLabel(source: HiringSource, year: number | null, note: string | null): string {
  const exam = SOURCE_NAME[source]
  const n = note?.trim() ?? ''
  const hasYear = year !== null && n.includes(String(year))
  if (n && hasYear && n.includes(exam)) return n
  const head = year !== null && !hasYear ? `${exam} ${year}` : exam
  return n ? `${head} · ${n}` : head
}

/** The bank row for an accepted question. Call only after rejectReason returned null. */
export function toHiringItem(row: SourceRow, subject: HiringSubject, source: HiringSource): HiringItem {
  const mcq = row.question_format === 'mcq'
  const byLabel = new Map(row.options.map((o) => [o.label, o]))
  return {
    source_ref: row.id,
    source,
    paper: paperLabel(source, row.pyq_year, row.pyq_note),
    subject,
    chapter: row.chapter,
    format: row.question_format,
    direction: subject === 'english' && row.context?.trim() ? row.context.trim() : null,
    stem: row.text.trim(),
    options: mcq
      ? (Object.fromEntries(LETTERS.map((l) => [l, byLabel.get(l)!.text.trim()])) as Record<Choice, string>)
      : null,
    answer_key: mcq ? (row.options.find((o) => o.is_correct)!.label as Choice) : null,
    numeric_answer: mcq ? null : Number(row.numeric_answer),
  }
}

const FORMAT_NAME: Record<HiringFormat, string> = { mcq: 'MCQ', numeric: 'typed-answer' }

/**
 * Everything wrong with the bank files, as sentences; empty when it may be
 * seeded. The database refuses a bad shape too (migration 0020) — this says
 * which question, before a whole batch is sent and refused.
 */
export function lintHiringBank(items: HiringItem[]): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const i of items) {
    const ref = i.source_ref
    if (seen.has(ref)) errors.push(`${ref}: listed twice`)
    seen.add(ref)

    if (i.format === 'mcq') {
      const ok = i.options && LETTERS.every((l) => i.options![l]?.trim()) && i.answer_key && i.numeric_answer === null
      if (!ok) errors.push(`${ref}: an MCQ needs four options and a key`)
    } else {
      const v = i.numeric_answer
      if (i.options || i.answer_key || v === null || !Number.isInteger(v) || v < 0 || v > MAX_NUMERIC) {
        errors.push(`${ref}: a typed answer must be a whole number from 0 to ${MAX_NUMERIC}`)
      }
    }

    const from = HIRING_SOURCES[i.subject]?.find((s) => s.format === i.format)
    if (!from) errors.push(`${ref}: ${i.subject} has no ${FORMAT_NAME[i.format]} questions`)
    else if (from.source !== i.source) errors.push(`${ref}: ${i.subject} ${FORMAT_NAME[i.format]} comes from ${from.source}, not ${i.source}`)

    if (i.direction !== null && i.subject !== 'english') errors.push(`${ref}: only English carries a direction`)
    if (i.direction !== null && i.direction.trim().length > MAX_DIRECTION) errors.push(`${ref}: the direction is over ${MAX_DIRECTION} characters`)

    const texts = [i.direction ?? '', i.stem, ...Object.values(i.options ?? {})]
    const bad = texts.flatMap((t) => mathErrors(t))
    if (bad.length) errors.push(`${ref}: maths KaTeX cannot draw — ${bad[0]}`)
  }

  for (const subject of HIRING_SUBJECTS) {
    for (const format of ['mcq', 'numeric'] as const) {
      const need = HIRING_SHAPE[subject][format]
      if (need === 0) continue
      const have = items.filter((i) => i.subject === subject && i.format === format && i.status !== 'retired').length
      if (have < need) errors.push(`${subject}: ${have} ${FORMAT_NAME[format]} questions, the paper needs ${need}`)
    }
  }
  return errors
}

/** A small seeded generator (mulberry32 over an FNV-1a hash of the seed). */
function seeded(seed: string): () => number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193)
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const byChapterThenRef = <T extends { source_ref: string; chapter: string }>(a: T, b: T) =>
  a.chapter < b.chapter ? -1 : a.chapter > b.chapter ? 1 : a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0

/**
 * Which n of the eligible questions the bank keeps: each chapter in proportion
 * to its share of the source (largest remainder), chosen at random within it,
 * the same pick for the same seed. Listed by chapter, then reference.
 */
export function pickPool<T extends { source_ref: string; chapter: string }>(candidates: T[], n: number, seed: string): T[] {
  if (candidates.length <= n) return [...candidates].sort(byChapterThenRef)

  const chapters = new Map<string, T[]>()
  for (const c of [...candidates].sort(byChapterThenRef)) {
    const list = chapters.get(c.chapter) ?? []
    list.push(c)
    chapters.set(c.chapter, list)
  }

  const shares = [...chapters].map(([chapter, list]) => {
    const exact = (list.length * n) / candidates.length
    return { chapter, list, take: Math.floor(exact), rest: exact - Math.floor(exact) }
  })
  let left = n - shares.reduce((s, x) => s + x.take, 0)
  for (const s of [...shares].sort((a, b) => b.rest - a.rest || (a.chapter < b.chapter ? -1 : 1))) {
    if (left === 0) break
    s.take++
    left--
  }

  const random = seeded(seed)
  const picked: T[] = []
  for (const { list, take } of shares) {
    const pool = [...list]
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      const swap = pool[i]!
      pool[i] = pool[j]!
      pool[j] = swap
    }
    picked.push(...pool.slice(0, take))
  }
  return picked.sort(byChapterThenRef)
}
