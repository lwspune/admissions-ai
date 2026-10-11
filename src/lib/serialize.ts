import { CHOICES, type Subject, type Choice, type Format, type Difficulty, type Part } from './types'
import { needsHindi, paperHasHindi } from './hindi'

/** A row as it exists in `test_items` — answer key and all. Server-side only. */
export interface BankRow {
  id: string
  ref: string | null
  subject: Subject
  part: Part
  taught_in: number
  /** First or second term of class N−1; set on syllabus items only. */
  term: number | null
  skill: string
  difficulty: Difficulty
  format: Format
  stem: string
  options: Record<Choice, string> | null
  answer_key: Choice | null
  numeric_answer: number | null
  numeric_tolerance: number
  rationale: string
  status: string
  /** The Hindi version, maths and science only (migration 0016). */
  stem_hi: string | null
  options_hi: Record<Choice, string> | null
}

/** Exactly what a candidate is allowed to receive. */
export interface CandidateQuestion {
  position: number
  subject: Subject
  /** Shown as a label on the question (2026-10-06). */
  part: Part
  format: Format
  stem: string
  options: Record<Choice, string> | null
  /** Null on English questions, and on every question of a paper not fully translated. */
  stemHi: string | null
  optionsHi: Record<Choice, string> | null
}

/**
 * Strips a paper down to what the candidate may see.
 *
 * This is the security boundary the whole test rests on: if `answer_key`,
 * `numeric_answer` or `rationale` ever reaches the browser, the score measures
 * nothing and nobody finds out. Grading happens server-side against the row
 * this function deliberately does not return.
 *
 * Built as an ALLOW-LIST rather than by deleting known-secret fields. A column
 * added to `test_items` later must not silently start reaching candidates
 * because someone forgot to add it to a delete list.
 *
 * Also withheld, though not secret in themselves:
 *   - `id` / `ref`, which would let a candidate correlate items across attempts
 *     and build a shared key
 *   - `difficulty`, because knowing an item is "difficult" changes how long a
 *     candidate spends on it and corrupts the dwell timings
 *   - `skill`, which names the reasoning pattern being tested
 *   - `taught_in` and `term`; the syllabus label names the class from the
 *     assessment, and a per-item class would let candidates map the bank
 *
 * The Hindi version travels only when every maths and science question on the
 * paper has one (2026-10-11), so a candidate who switches language never finds
 * some questions still in English.
 */
export function toCandidatePaper(
  rows: { position: number; item: BankRow }[],
): CandidateQuestion[] {
  const hindi = paperHasHindi(rows.map((r) => r.item))
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map(({ position, item }) => {
      const translated = hindi && needsHindi(item.subject)
      return {
        position,
        subject: item.subject,
        part: item.part,
        format: item.format,
        stem: item.stem,
        options: candidateOptions(item.format, item.options),
        stemHi: translated ? item.stem_hi : null,
        optionsHi: translated ? candidateOptions(item.format, item.options_hi) : null,
      }
    })
}

/**
 * Rebuilds the options object from A-D only. Copying the stored object wholesale
 * would forward any extra key an author left in it.
 */
function candidateOptions(format: Format, options: Record<Choice, string> | null): Record<Choice, string> | null {
  if (format !== 'mcq' || !options) return null
  const out = {} as Record<Choice, string>
  for (const choice of CHOICES) out[choice] = String(options[choice] ?? '')
  return out
}
