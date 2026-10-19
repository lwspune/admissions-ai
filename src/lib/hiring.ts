import { mathErrors } from './mathText'
import type { Choice } from './types'

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
