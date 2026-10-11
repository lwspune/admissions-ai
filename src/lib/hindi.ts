// Hindi versions of maths and science questions (2026-10-11). Pure, so the
// rules a translation must meet are tested without a database, and the paper,
// the lint and the load script all ask the same functions.
//
// English questions stay in English: they test English, and a translated one
// is a different question. Everything that grades an item — the answer key,
// the numeric answer, the order of the options — is shared with the English
// item, so a translation that drops a number or moves an option between
// letters is a wrong question that grades as a right one.

import { CHOICES, type Choice, type Format, type Part, type Subject } from './types'
import { CLASSES, isDrawableFor, isSyllabusFor, type ClassLevel } from './classes'

export type Lang = 'en' | 'hi'

/** One translation as authored in content/items/hi/*.hi.json. */
export interface HindiEntry {
  ref: string
  /** `sourceStamp` of the English text this translates; it goes stale when the English changes. */
  source: string
  stem_hi: string
  options_hi: Record<Choice, string> | null
}

interface EnglishText {
  subject: Subject
  format: Format
  stem: string
  options: Record<Choice, string> | null
}

interface HindiFields {
  subject: Subject
  format: Format
  stem_hi: string | null
  options_hi: Record<Choice, string> | null
}

/** Only maths and science are translated. */
export function needsHindi(subject: Subject): boolean {
  return subject === 'maths' || subject === 'science'
}

const filled = (s: unknown) => typeof s === 'string' && s.trim().length > 0

/** Whether an item carries a usable Hindi version: a stem, and all four options on an MCQ. */
export function hasHindi(item: HindiFields): boolean {
  if (!filled(item.stem_hi)) return false
  if (item.format === 'numeric') return true
  return item.options_hi != null && CHOICES.every((c) => filled(item.options_hi![c]))
}

/**
 * Whether a paper offers Hindi: every maths and science question has it. A
 * part-translated paper offers none, so no candidate switches language and
 * finds some questions still in English.
 */
export function paperHasHindi(items: readonly HindiFields[]): boolean {
  const translatable = items.filter((i) => needsHindi(i.subject))
  return translatable.length > 0 && translatable.every(hasHindi)
}

/**
 * A short fingerprint of the English an entry translates (FNV-1a, 32 bits).
 * Options are taken in A–D order, so swapping two changes it: the key letter
 * is shared, and a swap in English must be redone in Hindi.
 */
export function sourceStamp(item: Pick<EnglishText, 'stem' | 'options'>): string {
  const text = [item.stem, ...CHOICES.map((c) => item.options?.[c] ?? '')].join('\u0000')
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * The numbers in a piece of text, digit grouping removed: "₹1,20,000" and
 * "1,200" are one number each, "3/4" is two. A comma counts as grouping only
 * before two or three digits, so "5,6" stays two numbers.
 */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:,\d{2,3})*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''))
}

const DEVANAGARI = /[\u0900-\u097F]/
const DEVANAGARI_DIGIT = /[\u0966-\u096F]/

/** Numbers in `en` that `hi` does not contain. */
function missingNumbers(en: string, hi: string): string[] {
  const inHindi = new Set(numbersIn(hi))
  return [...new Set(numbersIn(en))].filter((n) => !inHindi.has(n))
}

/** Why a translation cannot be loaded. Empty when it can. */
export function translationProblems(en: EnglishText, hi: HindiEntry): string[] {
  const problems: string[] = []

  if (!needsHindi(en.subject)) {
    problems.push('English questions stay in English; only maths and science are translated')
    return problems
  }

  const now = sourceStamp(en)
  if (hi.source !== now) {
    problems.push(`the English has changed since this was translated (source ${hi.source}, now ${now}): check the translation, then update source`)
  }

  if (!filled(hi.stem_hi)) {
    problems.push('stem_hi is blank')
  } else {
    if (!DEVANAGARI.test(hi.stem_hi)) problems.push('stem_hi has no Hindi in it')
    const missing = missingNumbers(en.stem, hi.stem_hi)
    if (missing.length) problems.push(`the stem's ${missing.join(', ')} is missing from stem_hi`)
  }

  const texts = [hi.stem_hi ?? '', ...Object.values(hi.options_hi ?? {})]
  if (texts.some((t) => DEVANAGARI_DIGIT.test(String(t)))) {
    problems.push('use the digits 0–9, not Devanagari digits, so a number reads the same in both languages')
  }

  if (en.format === 'numeric') {
    if (hi.options_hi != null) problems.push('a numeric item carries no options_hi')
    return problems
  }

  const options = hi.options_hi
  if (!options || typeof options !== 'object') {
    problems.push('an MCQ needs options_hi A–D')
    return problems
  }
  const keys = Object.keys(options).sort().join('')
  if (keys !== 'ABCD') problems.push(`options_hi must be exactly A–D, got ${keys}`)

  for (const c of CHOICES) {
    const value = options[c]
    if (!filled(value)) {
      problems.push(`option ${c} is blank`)
      continue
    }
    const missing = missingNumbers(en.options?.[c] ?? '', value)
    if (missing.length) problems.push(`option ${c}'s ${missing.join(', ')} is missing from its Hindi`)
  }

  const values = CHOICES.map((c) => String(options[c] ?? '').trim()).filter(Boolean)
  if (new Set(values).size !== values.length) problems.push('two Hindi options are identical')

  return problems
}

export interface HindiCoverage {
  classLevel: ClassLevel
  /** Maths and science items this class can draw. */
  total: number
  translated: number
  /** Every one translated: each paper for this class offers Hindi. */
  complete: boolean
}

/**
 * Per admitting class, how many of the maths and science items it can draw
 * have a Hindi version. A paper offers Hindi only when all of its questions
 * do, so a class short of complete gives some candidates the switch and not
 * others, depending on the draw.
 */
export function hindiCoverage(
  bank: readonly { ref: string; subject: Subject; taught_in: number; part: Part; term: number | null; status?: string }[],
  translated: ReadonlySet<string>,
): HindiCoverage[] {
  return CLASSES.map((classLevel) => {
    const drawable = bank.filter(
      (i) =>
        i.status !== 'retired' &&
        needsHindi(i.subject) &&
        (i.part === 'syllabus' ? isSyllabusFor(i.taught_in, i.term, classLevel) : isDrawableFor(i.taught_in, classLevel)),
    )
    const done = drawable.filter((i) => translated.has(i.ref)).length
    return { classLevel, total: drawable.length, translated: done, complete: done === drawable.length }
  })
}
