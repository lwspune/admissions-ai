// Item bank lint. Runs before any item is seeded.
//
//   npm run items:lint
//
// A wrong answer key is the failure that hides for six months, so this checks
// the mechanical properties a human reviewer reads past: shape, duplication,
// and the tells that let a candidate pick the key without reading the
// question. It cannot check whether an answer is actually correct — that is
// what the rationale and human review are for.

import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOptionValue, coverageByClass, keySkew } from '../src/lib/items'
import { TAUGHT_IN_MIN, TAUGHT_IN_MAX } from '../src/lib/classes'
import type { Subject, Difficulty } from '../src/lib/types'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'items')
const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'parent-pack', 'sample-papers.json')

const SUBJECTS = ['maths', 'english', 'science']
const DIFFICULTIES = ['easy', 'moderate', 'difficult']
const CHOICES = ['A', 'B', 'C', 'D']
const MAX_STEM_WORDS = 40
const MIN_RATIONALE_CHARS = 60

interface RawItem {
  ref?: string
  subject?: string
  skill?: string
  difficulty?: string
  taught_in?: number
  format?: string
  stem?: string
  options?: Record<string, string> | null
  answer_key?: string | null
  numeric_answer?: number | null
  numeric_tolerance?: number | null
  rationale?: string
  __file?: string
  __sample?: boolean
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

export function lintItems(): number {
  let errors = 0
  let warnings = 0
  const err = (ref: string, msg: string) => { errors++; console.log(`  ERROR  ${ref}: ${msg}`) }
  const warn = (ref: string, msg: string) => { warnings++; console.log(`  WARN   ${ref}: ${msg}`) }

  const files = readdirSync(DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    console.error(`No item files in ${DIR}`)
    return 1
  }

  const items: RawItem[] = []
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(DIR, file), 'utf8'))
    if (!Array.isArray(parsed)) {
      console.error(`${file} is not a JSON array`)
      return 1
    }
    for (const item of parsed) items.push({ ...item, __file: file })
  }

  // The parent pack's sample questions get the same per-item checks, and the
  // duplicate-stem check across both: a sample that repeats a bank stem would
  // print a live question's answer. They are not bank items, so the coverage
  // count below leaves them out.
  const samples = JSON.parse(readFileSync(SAMPLES, 'utf8')) as RawItem[]
  for (const item of samples) items.push({ ...item, __file: 'parent-pack/sample-papers.json', __sample: true })

  console.log(`\nLinting ${items.length} items from ${files.length} file(s) and the parent pack\n`)

  const seenRefs = new Map<string, string>()
  const seenStems = new Map<string, string>()

  for (const item of items) {
    const ref = item.ref ?? '(no ref)'

    if (!item.ref) err(ref, 'missing ref')
    else if (seenRefs.has(item.ref)) err(ref, `duplicate ref, also in ${seenRefs.get(item.ref)}`)
    else seenRefs.set(item.ref, item.__file ?? '')

    if (!SUBJECTS.includes(item.subject ?? '')) err(ref, `invalid subject "${item.subject}"`)
    if (!DIFFICULTIES.includes(item.difficulty ?? '')) err(ref, `invalid difficulty "${item.difficulty}"`)
    if (!item.skill || !item.skill.trim()) err(ref, 'missing skill')

    // The class in which the content is taught. Required, because a missing
    // tag would be seeded as the floor and quietly open a class 11 item to a
    // class 9 admit; the author has to say 6 on purpose.
    if (
      !Number.isInteger(item.taught_in) ||
      (item.taught_in as number) < TAUGHT_IN_MIN ||
      (item.taught_in as number) > TAUGHT_IN_MAX
    ) {
      err(ref, `taught_in must be an integer from ${TAUGHT_IN_MIN} to ${TAUGHT_IN_MAX}, got ${JSON.stringify(item.taught_in)}`)
    }

    if (!item.stem || !item.stem.trim()) {
      err(ref, 'missing stem')
    } else {
      if (words(item.stem) > MAX_STEM_WORDS) {
        err(ref, `stem is ${words(item.stem)} words, limit is ${MAX_STEM_WORDS}`)
      }
      const key = item.stem.trim().toLowerCase()
      const prior = seenStems.get(key)
      if (prior) err(ref, `duplicate stem, also in ${prior}`)
      else seenStems.set(key, ref)
    }

    // The answer-key sign-off depends on the rationale being substantive.
    if (!item.rationale || item.rationale.trim().length < MIN_RATIONALE_CHARS) {
      err(ref, `rationale is missing or too short (min ${MIN_RATIONALE_CHARS} chars)`)
    }

    if (item.format === 'mcq') {
      if (item.numeric_answer != null) err(ref, 'mcq item carries a numeric_answer')
      if (!item.options || typeof item.options !== 'object') {
        err(ref, 'mcq item has no options')
        continue
      }
      const options = item.options
      const keys = Object.keys(options).sort()
      if (keys.join('') !== 'ABCD') err(ref, `options must be exactly A-D, got ${keys.join('')}`)

      const values = CHOICES.map((c) => options[c]).filter((v): v is string => v != null)
      if (values.some((v) => !String(v).trim())) err(ref, 'an option is blank')
      if (new Set(values.map((v) => String(v).trim().toLowerCase())).size !== values.length) {
        err(ref, 'two options are identical')
      }
      if (!CHOICES.includes(item.answer_key ?? '')) err(ref, `invalid answer_key "${item.answer_key}"`)

      // Two options that read differently but mean the same quantity (2/3 and
      // 4/6) are eliminated together, and if one is the key the item has two
      // right answers. String equality above cannot see it.
      const byValue = new Map<string, string>()
      for (const choice of CHOICES) {
        const raw = options[choice]
        if (raw == null) continue
        const value = parseOptionValue(String(raw))
        if (value === null) continue
        const twin = byValue.get(value)
        if (twin) err(ref, `options ${twin} and ${choice} are the same quantity ("${options[twin]}" / "${raw}")`)
        else byValue.set(value, choice)
      }

      // The length tell: if the correct answer is visibly the longest, a
      // candidate can pick it without reading the question.
      const answerKey = item.answer_key
      if (answerKey && CHOICES.includes(answerKey) && values.length === 4) {
        const keyLen = String(options[answerKey]).length
        const others = CHOICES.filter((c) => c !== answerKey).map((c) => String(options[c]).length)
        const longestOther = Math.max(...others)
        if (keyLen > longestOther * 1.5) {
          err(ref, `key is ${keyLen} chars vs ${longestOther} for the next longest — a length tell`)
        } else if (keyLen > longestOther) {
          warn(ref, `key is the longest option (${keyLen} vs ${longestOther}) — mild length tell`)
        }
      }
    } else if (item.format === 'numeric') {
      if (item.options != null) err(ref, 'numeric item carries options')
      if (item.answer_key != null) err(ref, 'numeric item carries an answer_key')
      if (typeof item.numeric_answer !== 'number' || !Number.isFinite(item.numeric_answer)) {
        err(ref, 'numeric_answer must be a finite number')
      }
      if (item.numeric_tolerance != null &&
          (typeof item.numeric_tolerance !== 'number' || item.numeric_tolerance < 0)) {
        err(ref, 'numeric_tolerance must be a non-negative number')
      }
    } else {
      err(ref, `invalid format "${item.format}"`)
    }
  }

  // Can every class be issued a paper? The filter by class splits each
  // stratum, and the class that comes up short is the one whose candidate
  // sees a failure in front of staff. "thin" is the exposure warning: fewer
  // than twice the need means every paper for that class looks much the same.
  console.log('\nBank can fill a paper for every class')
  const shaped = items
    .filter((i) => !i.__sample)
    .filter((i) => SUBJECTS.includes(i.subject ?? '') && DIFFICULTIES.includes(i.difficulty ?? '') && Number.isInteger(i.taught_in))
    .map((i) => ({ subject: i.subject as Subject, difficulty: i.difficulty as Difficulty, taught_in: i.taught_in as number }))
  for (const cell of coverageByClass(shaped)) {
    const label = `class ${cell.classLevel} · ${cell.subject}/${cell.difficulty}`
    if (cell.status === 'short') {
      errors++
      console.log(`  ERROR  ${label}: ${cell.count} item(s), a paper needs ${cell.needed}`)
    } else if (cell.status === 'thin') {
      warnings++
      console.log(`  WARN   ${label}: ${cell.count} item(s) for a need of ${cell.needed} — every paper draws the same ones`)
    } else {
      console.log(`  ok     ${label}: ${cell.count}`)
    }
  }

  // Options are served in authored order, so a key that is usually A is a key
  // a candidate can guess without reading. Rebalance with a swap of two
  // options, not a rewrite of the item.
  console.log('\nAnswer keys are spread across A-D')
  // The bank and the samples are judged apart: a parent reading the sample's
  // answer page sees its letters as a set.
  const skewOf = (pool: RawItem[]) =>
    keySkew(
      pool
        .filter((i) => SUBJECTS.includes(i.subject ?? ''))
        .map((i) => ({ subject: i.subject as Subject, format: String(i.format), answer_key: i.answer_key ?? null })),
    )
  const skewed = [
    ...skewOf(items.filter((i) => !i.__sample)).map((s) => ({ ...s, where: 'bank' })),
    ...skewOf(items.filter((i) => i.__sample)).map((s) => ({ ...s, where: 'parent pack' })),
  ]
  for (const s of skewed) {
    errors++
    console.log(`  ERROR  ${s.where} ${s.subject}: ${s.count} of ${s.total} keys are ${s.letter}`)
  }
  if (skewed.length === 0) console.log('  ok     no letter holds more than 40% of any subject')

  console.log(`\n${items.length} items · ${errors} error(s) · ${warnings} warning(s)\n`)
  return errors === 0 ? 0 : 1
}

const entry = process.argv[1]
if (entry && resolve(entry) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = lintItems()
}
