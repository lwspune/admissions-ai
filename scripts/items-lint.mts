// Item bank lint. Runs before any item is seeded.
//
//   npm run items:lint
//
// A wrong answer key is the failure that hides for six months, so this checks
// the mechanical properties a human reviewer reads past: shape, duplication,
// and the tells that let a candidate pick the key without reading the
// question. It cannot check whether an answer is actually correct — that is
// what the rationale and human review are for.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseOptionValue, coverageByClass, keySkew, thirtyReadiness, notEnglish } from '../src/lib/items'
import { TAUGHT_IN_MIN, TAUGHT_IN_MAX } from '../src/lib/classes'
import { fitsAnswerBox } from '../src/lib/omr/layout'
import { translationProblems, workingProblems, hindiCoverage, type HindiEntry } from '../src/lib/hindi'
import type { Subject, Difficulty, Format, Choice } from '../src/lib/types'

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'items')
const SAMPLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'parent-pack', 'sample-papers.json')
// Hindi versions of maths and science items, one file per English batch (2026-10-11).
export const HINDI_DIR = join(DIR, 'hi')
// The Hindi parent sheets' samples, with their worked answers.
export const SAMPLES_HI = join(dirname(SAMPLES), 'sample-papers.hi.json')

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
  part?: string
  term?: number | null
  format?: string
  stem?: string
  options?: Record<string, string> | null
  answer_key?: string | null
  numeric_answer?: number | null
  numeric_tolerance?: number | null
  rationale?: string
  /** Only ever "retired": withdrawn for good, kept so its ref is never reused. */
  status?: string
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

    // A file sets no status except retirement; review and live are the seed's.
    if (item.status != null && item.status !== 'retired') {
      err(ref, `status in a file may only be "retired", got ${JSON.stringify(item.status)}`)
    }
    if (item.status !== 'retired' && notEnglish(item.subject ?? '', item.skill ?? '')) {
      err(ref, `"${item.skill}" is a logic puzzle, not English: write a language question instead`)
    }

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

    // Two parts since 2026-10-06 (migration 0014). Basics is the default and
    // carries no term; syllabus is maths or science content from one class
    // (7–11, the class below an admit to 8–12) and says which term.
    const part = item.part ?? 'basics'
    if (part !== 'basics' && part !== 'syllabus') {
      err(ref, `part must be "basics" or "syllabus", got ${JSON.stringify(item.part)}`)
    } else if (part === 'basics' && item.term != null) {
      err(ref, 'a basics item carries no term')
    } else if (part === 'syllabus') {
      if (item.term !== 1 && item.term !== 2) err(ref, `a syllabus item needs term 1 or 2, got ${JSON.stringify(item.term)}`)
      if (item.subject === 'english') err(ref, 'English has no syllabus part')
      if (!Number.isInteger(item.taught_in) || (item.taught_in as number) < 7 || (item.taught_in as number) > 11) {
        err(ref, `a syllabus item is class 7–11 content, got ${JSON.stringify(item.taught_in)}`)
      }
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
      } else if (!fitsAnswerBox(item.numeric_answer)) {
        // A paper test's OMR box holds 0 to 9999.99 (2026-10-16). An answer
        // it cannot hold could never be bubbled, so it could never score.
        err(ref, `numeric_answer ${item.numeric_answer} does not fit the answer sheet: 0 to 9999.99, at most two decimals`)
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
  console.log('\nBank can fill the 15-question paper (basics) for every class')
  // Retired items stay in their files but are never drawn.
  const shaped = items
    .filter((i) => !i.__sample && i.status !== 'retired')
    .filter((i) => SUBJECTS.includes(i.subject ?? '') && DIFFICULTIES.includes(i.difficulty ?? '') && Number.isInteger(i.taught_in))
    .map((i) => ({
      subject: i.subject as Subject,
      difficulty: i.difficulty as Difficulty,
      taught_in: i.taught_in as number,
      part: (i.part === 'syllabus' ? 'syllabus' : 'basics') as 'basics' | 'syllabus',
      term: i.term ?? null,
    }))
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

  // Not an error: a class that cannot fill the longer paper keeps the
  // 15-question one. This says which classes have moved, and what the rest
  // still need. The file's items, whatever their status — the live bank is
  // what /items reports.
  console.log('\n30-question paper (needs class N−1 first-term syllabus items)')
  for (const r of thirtyReadiness(shaped)) {
    if (r.ready) {
      console.log(`  ready  class ${r.classLevel}`)
    } else {
      const gaps = r.missing.map((m) => `${m.subject}/${m.part}/${m.difficulty} ${m.count} of ${m.needed}`).join(', ')
      console.log(`  15 q   class ${r.classLevel}: ${gaps}`)
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
    ...skewOf(items.filter((i) => !i.__sample && i.status !== 'retired')).map((s) => ({ ...s, where: 'bank' })),
    ...skewOf(items.filter((i) => i.__sample)).map((s) => ({ ...s, where: 'parent pack' })),
  ]
  for (const s of skewed) {
    errors++
    console.log(`  ERROR  ${s.where} ${s.subject}: ${s.count} of ${s.total} keys are ${s.letter}`)
  }
  if (skewed.length === 0) console.log('  ok     no letter holds more than 40% of any subject')

  // Hindi shares the English item's key, numeric answer and option order, so
  // a translation that drops a number or moves an option between letters is a
  // wrong question that grades as a right one. The lint checks the mechanics;
  // the reviewer's read of each batch is the sign-off.
  console.log('\nHindi translations (content/items/hi)')
  const bankByRef = new Map(items.filter((i) => !i.__sample && i.ref).map((i) => [i.ref!, i]))
  const translated = new Set<string>()
  const seenHindi = new Map<string, string>()
  const hindiFiles = existsSync(HINDI_DIR) ? readdirSync(HINDI_DIR).filter((f) => f.endsWith('.hi.json')) : []
  for (const file of hindiFiles) {
    const entries = JSON.parse(readFileSync(join(HINDI_DIR, file), 'utf8')) as HindiEntry[]
    if (!Array.isArray(entries)) {
      err(file, 'is not a JSON array')
      continue
    }
    let fileErrors = 0
    for (const entry of entries) {
      const ref = entry.ref ?? '(no ref)'
      const fail = (msg: string) => { fileErrors++; err(`hi/${ref}`, msg) }
      if (!entry.ref) { fail('missing ref'); continue }
      if (seenHindi.has(entry.ref)) { fail(`translated twice, also in ${seenHindi.get(entry.ref)}`); continue }
      seenHindi.set(entry.ref, file)
      const en = bankByRef.get(entry.ref)
      if (!en) { fail('no bank item has this ref'); continue }
      if (en.status === 'retired') warn(`hi/${ref}`, 'the item is retired, so this translation is never shown')
      const problems = translationProblems(
        {
          subject: en.subject as Subject,
          format: en.format as Format,
          stem: en.stem ?? '',
          options: (en.options ?? null) as Record<Choice, string> | null,
        },
        entry,
      )
      for (const p of problems) fail(p)
      if (problems.length === 0) translated.add(entry.ref)
    }
    console.log(`  ${fileErrors === 0 ? 'ok    ' : 'ERROR '} ${file}: ${entries.length} item(s)`)
  }

  // The parent sheets' samples in Hindi, worked answers included: the sheet
  // prints the working, so its numbers are checked as well as the question's.
  if (existsSync(SAMPLES_HI)) {
    const sampleByRef = new Map(items.filter((i) => i.__sample && i.ref).map((i) => [i.ref!, i]))
    const entries = JSON.parse(readFileSync(SAMPLES_HI, 'utf8')) as (HindiEntry & { rationale_hi?: string })[]
    let sampleErrors = 0
    for (const entry of entries) {
      const fail = (msg: string) => { sampleErrors++; err(`hi/${entry.ref ?? '(no ref)'}`, msg) }
      const en = entry.ref ? sampleByRef.get(entry.ref) : undefined
      if (!en) { fail('no parent-pack sample has this ref'); continue }
      const problems = [
        ...translationProblems(
          { subject: en.subject as Subject, format: en.format as Format, stem: en.stem ?? '', options: (en.options ?? null) as Record<Choice, string> | null },
          entry,
        ),
        ...workingProblems(en.rationale ?? '', entry.rationale_hi ?? ''),
      ]
      for (const p of problems) fail(p)
    }
    const untranslated = [...sampleByRef.values()].filter((i) => i.subject !== 'english' && !entries.some((e) => e.ref === i.ref)).length
    console.log(`  ${sampleErrors === 0 ? 'ok    ' : 'ERROR '} parent-pack/sample-papers.hi.json: ${entries.length} sample(s), ${untranslated} maths or science sample(s) without Hindi`)
  }

  // Not an error: a class short of complete simply offers no Hindi on a paper
  // that draws an untranslated question.
  const coverage = hindiCoverage(
    items
      .filter((i) => !i.__sample && i.ref && SUBJECTS.includes(i.subject ?? '') && Number.isInteger(i.taught_in))
      .map((i) => ({
        ref: i.ref!,
        subject: i.subject as Subject,
        taught_in: i.taught_in as number,
        part: (i.part === 'syllabus' ? 'syllabus' : 'basics') as 'basics' | 'syllabus',
        term: i.term ?? null,
        status: i.status,
      })),
    translated,
  )
  for (const c of coverage) {
    console.log(`  ${c.complete ? 'ready ' : 'part  '} class ${c.classLevel}: ${c.translated} of ${c.total} maths and science items in Hindi`)
  }

  console.log(`\n${items.length} items · ${errors} error(s) · ${warnings} warning(s)\n`)
  return errors === 0 ? 0 : 1
}

const entry = process.argv[1]
if (entry && resolve(entry) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = lintItems()
}
