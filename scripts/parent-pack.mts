// Builds the parent pack: one PDF per admitting class, holding the test's
// format, the syllabus that class is drawn from, a sample paper and its
// answers. The PDFs go to public/parent-pack/, served without a login: the
// issue message links the admitting class's PDF, and /downloads lists all five.
//
//   npm run parent-pack              # validate, then write the PDFs
//   npm run parent-pack -- --html    # validate, write HTML only (no browser)
//
// Each class's sheet describes the paper that class actually gets today: 30
// questions once its syllabus batch is live, otherwise 15. That is read from
// the live database (live_pool, as the draw reads it), so the pack cannot
// promise a paper the class does not get — and a class that moves to 30 stops
// the build until its 30-question sample is written.
//
// The sample questions are written for the pack and are never seeded: a bank
// item printed here would sit on real papers with its answer in a parent's
// hands. This refuses a sample whose stem is a bank stem, and warns when one
// shares most of its words with a bank item.

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { join, dirname, resolve, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { samplePaperProblems } from '../src/lib/samplePaper'
import { choosePaperShape, type PoolItem } from '../src/lib/assemble'
import { CLASSES, contentCeiling, type ClassLevel } from '../src/lib/classes'
import { SUBJECTS, DIFFICULTIES, SHAPE_30, type Subject, type Difficulty, type Part, type PaperShape } from '../src/lib/types'
import {
  syllabusFor, topicClass, unmappedSkills, editionStudied, basicsTopics,
  type SyllabusTopic, type Heading, type SyllabusChapter, type SyllabusInput, type Edition,
} from '../src/lib/syllabus'
import { parentPackPath } from '../src/lib/parentPack'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACK = join(ROOT, 'content', 'parent-pack')
const BANK = join(ROOT, 'content', 'items')
// Served by the site at parentPackPath(): file names come from there, so a
// link in the issue message cannot point at a file the build did not write.
const OUT = join(ROOT, 'public', 'parent-pack')

interface PackItem {
  paper: number
  ref: string
  subject: Subject
  part?: Part
  term?: number | null
  skill: string
  difficulty: Difficulty
  taught_in: number
  format: 'mcq' | 'numeric'
  stem: string
  options?: Record<string, string>
  answer_key?: string
  numeric_answer?: number
  rationale: string
}

/** A first-term (or second-term) chapter of class N−1, for the syllabus part. */
interface SyllabusPartChapter {
  subject: Subject
  classLevel: number
  edition: Edition
  book: string
  chapter: number
  term: number
  title: string
  covers: string
  skills: string[]
}

interface SyllabusFile {
  cohortYear: number
  newFrom: Record<string, number>
  topics: (Omit<SyllabusTopic, 'taught_in' | 'reasoning' | 'heading'> & { skills: string[]; reasoning?: boolean; heading?: Heading })[]
  chapters: SyllabusChapter[]
  syllabusChapters: SyllabusPartChapter[]
}

const SUBJECT_LABEL: Record<Subject, string> = { maths: 'Maths', english: 'English', science: 'Science' }
// Jaccard overlap of content words and numbers. Questions of one type share
// their wording ("Find the next number in the series"), so words alone match
// every series item; the numbers are what make two items the same question.
const SIMILAR_SHARE = 0.6

const items: PackItem[] = JSON.parse(readFileSync(join(PACK, 'sample-papers.json'), 'utf8'))
const syllabusFile: SyllabusFile = JSON.parse(readFileSync(join(PACK, 'syllabus.json'), 'utf8'))
const bank: { ref: string; stem: string; skill: string; taught_in: number; part?: string; status?: string }[] = readdirSync(BANK)
  .filter((f) => f.endsWith('.json'))
  .flatMap((f) => JSON.parse(readFileSync(join(BANK, f), 'utf8')))

// Basics and syllabus are described differently: basics by topic across every
// class the child has done, syllabus by class N−1's first-term chapters. Every
// bank stem, either part, counts for the copy check on the samples, retired
// ones too: they were on real papers. Only drawable items describe the paper.
const isSyllabus = (i: { part?: string }) => i.part === 'syllabus'
const drawable = bank.filter((b) => b.status !== 'retired')
const basicsBank = drawable.filter((b) => !isSyllabus(b))
const syllabusBank = drawable.filter(isSyllabus)
const basicsSamples = items.filter((i) => !isSyllabus(i))
const syllabusSamples = items.filter(isSyllabus)

// A topic's class comes from the bank's own tags, so a retag reaches the
// sheets on the next build instead of waiting for someone to edit this file.
const syllabusInput: SyllabusInput = {
  cohortYear: syllabusFile.cohortYear,
  newFrom: Object.fromEntries(Object.entries(syllabusFile.newFrom).map(([k, v]) => [Number(k), v])),
  topics: syllabusFile.topics.map((t) => ({
    key: t.key,
    subject: t.subject,
    label: t.label,
    reasoning: t.reasoning ?? false,
    heading: t.heading,
    taught_in: topicClass(t.skills, basicsBank),
  })),
  chapters: syllabusFile.chapters,
}
const topicOfSkill = new Map(syllabusFile.topics.flatMap((t) => t.skills.map((s) => [s, t.key] as const)))
const topicByKey = new Map(syllabusInput.topics.map((t) => [t.key, t]))

/** Class N−1's first-term chapters, in the edition this cohort used. */
function firstTermChapters(classLevel: ClassLevel): SyllabusPartChapter[] {
  const below = contentCeiling(classLevel)
  const edition = editionStudied(below, classLevel, syllabusInput.cohortYear, syllabusInput.newFrom)
  return syllabusFile.syllabusChapters
    .filter((c) => c.classLevel === below && c.term === 1 && c.edition === edition)
    .sort((a, b) => a.chapter - b.chapter)
}

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
const wordSet = (s: string) =>
  new Set(normalise(s).replace(/(\d),(\d)/g, '$1$2').split(/[^a-z0-9.]+/).filter((w) => w.length > 3 || /\d/.test(w)))

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const w of a) if (b.has(w)) shared++
  return shared / (a.size + b.size - shared)
}

/**
 * The paper each class gets today, read the way the draw reads it. Needs the
 * service-role key in .env.local, like the seed.
 */
async function liveShapes(): Promise<Map<ClassLevel, PaperShape>> {
  const env = Object.fromEntries(
    readFileSync(join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
      }),
  )
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('.env.local needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')

  const shapes = new Map<ClassLevel, PaperShape>()
  for (const classLevel of CLASSES) {
    const res = await fetch(`${url}/rest/v1/rpc/live_pool`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_class: classLevel }),
    })
    if (!res.ok) throw new Error(`live_pool(${classLevel}) failed: ${await res.text()}`)
    shapes.set(classLevel, choosePaperShape((await res.json()) as PoolItem[]))
  }
  return shapes
}

function validate(shapes: Map<ClassLevel, PaperShape>): number {
  let errors = 0
  const bankStems = new Map(bank.map((b) => [normalise(b.stem), b.ref]))
  const bankWords = bank.map((b) => ({ ref: b.ref, words: wordSet(b.stem) }))

  // Every skill the bank or a sample uses must be described somewhere, or the
  // sheet would leave out something the paper can ask. Basics skills sit
  // under a topic; syllabus skills under a chapter of the class they are from.
  for (const skill of unmappedSkills(syllabusFile.topics, basicsBank.map((b) => b.skill))) {
    errors++
    console.log(`  ERROR  bank skill "${skill}" is in no syllabus topic (syllabus.json)`)
  }
  for (const skill of unmappedSkills(syllabusFile.topics, basicsSamples.map((i) => i.skill))) {
    errors++
    console.log(`  ERROR  sample skill "${skill}" is in no syllabus topic (syllabus.json)`)
  }
  const chapterFor = (i: { subject: string; skill: string; taught_in: number; term?: number | null }) =>
    syllabusFile.syllabusChapters.find(
      (c) => c.subject === i.subject && c.classLevel === i.taught_in && c.term === (i.term ?? 0) && c.skills.includes(i.skill),
    )
  for (const b of syllabusBank) {
    if (!chapterFor(b as never)) {
      errors++
      console.log(`  ERROR  bank item ${b.ref} ("${b.skill}") is in no chapter of its class and term (syllabusChapters)`)
    }
  }
  for (const i of syllabusSamples) {
    if (!chapterFor(i)) {
      errors++
      console.log(`  ERROR  sample ${i.ref} ("${i.skill}") is in no chapter of its class and term (syllabusChapters)`)
    }
  }

  // A basics sample tagged below the class the bank teaches its topic in would
  // show a parent content their child's paper cannot hold.
  for (const item of basicsSamples) {
    const key = topicOfSkill.get(item.skill)
    const topicTag = key ? topicByKey.get(key)?.taught_in : null
    if (key && topicTag == null) {
      errors++
      console.log(`  ERROR  ${item.ref}: "${key}" has no bank item, so no real paper asks it`)
    } else if (topicTag != null && item.taught_in < topicTag) {
      errors++
      console.log(`  ERROR  ${item.ref}: tagged class ${item.taught_in}, but the bank teaches "${key}" from class ${topicTag}`)
    }
  }

  for (const classLevel of CLASSES) {
    const shape = shapes.get(classLevel)!
    const paper = items.filter((i) => i.paper === classLevel)
    for (const problem of samplePaperProblems(classLevel, paper, shape)) {
      errors++
      console.log(`  ERROR  class ${classLevel} (${shape.questions}-question paper): ${problem}`)
    }
    if (shape === SHAPE_30 && firstTermChapters(classLevel).length === 0) {
      errors++
      console.log(`  ERROR  class ${classLevel} is on 30 questions but syllabusChapters has no class ${contentCeiling(classLevel)} first-term chapters`)
    }
    for (const topic of syllabusFor(classLevel, syllabusInput).unplaced) {
      console.log(`  WARN   class ${classLevel}: "${topic.label}" is drawable but in no NCERT chapter the child used by class ${contentCeiling(classLevel)}`)
    }
  }

  for (const item of items) {
    const twin = bankStems.get(normalise(item.stem))
    if (twin) {
      errors++
      console.log(`  ERROR  ${item.ref}: same stem as bank item ${twin}`)
    }
    const words = wordSet(item.stem)
    for (const b of bankWords) {
      const share = overlap(words, b.words)
      if (share >= SIMILAR_SHARE) {
        console.log(`  WARN   ${item.ref}: shares ${Math.round(share * 100)}% of its words with bank item ${b.ref}`)
      }
    }
  }
  return errors
}

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Subjects interleaved, as on a real paper; within a subject easy to
 * difficult, with basics and syllabus alternating at each level so the two
 * parts are mixed as they are on the real paper.
 */
function ordered(paper: PackItem[]): PackItem[] {
  const rank = (d: Difficulty) => DIFFICULTIES.indexOf(d)
  const bySubject = SUBJECTS.map((s) => {
    const inSubject = paper.filter((i) => i.subject === s)
    const out: PackItem[] = []
    for (const d of DIFFICULTIES) {
      const basics = inSubject.filter((i) => i.difficulty === d && !isSyllabus(i))
      const syllabus = inSubject.filter((i) => i.difficulty === d && isSyllabus(i))
      for (let n = 0; n < Math.max(basics.length, syllabus.length); n++) {
        if (basics[n]) out.push(basics[n])
        if (syllabus[n]) out.push(syllabus[n])
      }
    }
    return out.sort((a, b) => rank(a.difficulty) - rank(b.difficulty))
  })
  const out: PackItem[] = []
  for (let n = 0; n < Math.max(...bySubject.map((q) => q.length)); n++) {
    for (const q of bySubject) if (q[n]) out.push(q[n])
  }
  return out
}

function answerText(item: PackItem): string {
  if (item.format === 'numeric') return String(item.numeric_answer)
  return `${item.answer_key}. ${item.options?.[item.answer_key ?? ''] ?? ''}`
}

function render(classLevel: ClassLevel, shape: PaperShape): string {
  const ceiling = contentCeiling(classLevel)
  const thirty = shape === SHAPE_30
  const paper = ordered(items.filter((i) => i.paper === classLevel))

  // Broad names only. Classes, books and chapter numbers are checked by
  // validate() but not printed: parents asked about them more than they helped.
  const numbered = (heading: string, names: string[]) =>
    names.length === 0
      ? ''
      : `<div class="subject-block"><h3>${escape(heading)}</h3><ol>${names.map((n) => `<li>${escape(n)}</li>`).join('')}</ol></div>`
  const lists = basicsTopics(classLevel, syllabusInput.topics)
  // English is short and maths ends sooner than science, so English goes under maths.
  const topics = `<div>${numbered('Maths', lists.maths)}${numbered('English', lists.english)}</div>`
    + `<div>${numbered('Science', lists.science)}${numbered('Reasoning', lists.reasoning)}</div>`

  // Class 11 science is two books: Physics first, then Chemistry, numbered on.
  const chapterNames = (s: Subject) => {
    const chapters = firstTermChapters(classLevel).filter((c) => c.subject === s)
    const books = [...new Set(chapters.map((c) => c.book))]
    return books.flatMap((book) => chapters.filter((c) => c.book === book).map((c) => c.title))
  }
  const syllabusPart = thirty
    ? `<section class="syllabus-part"><h2>Class ${ceiling} syllabus questions</h2>
  <div class="syllabus">${numbered('Maths', chapterNames('maths'))}${numbered('Science', chapterNames('science'))}</div></section>`
    : ''

  const partLabel = (item: PackItem) => (thirty ? (isSyllabus(item) ? ` · Class ${ceiling}` : ' · Basics') : '')
  const questions = paper.map((item) => {
    const body =
      item.format === 'mcq'
        ? `<ol class="options">${['A', 'B', 'C', 'D']
            .map((c) => `<li><span class="letter">${c}</span>${escape(item.options?.[c] ?? '')}</li>`)
            .join('')}</ol>`
        : `<p class="typein">Type-in answer: <span class="blank"></span></p>`
    return `<li class="question"><p class="subject">${SUBJECT_LABEL[item.subject]}${partLabel(item)}</p><p class="stem">${escape(item.stem)}</p>${body}</li>`
  }).join('')

  const answers = paper.map((item, n) =>
    `<tr><td class="num">${n + 1}</td><td class="ans">${escape(answerText(item))}</td><td>${escape(item.rationale)}</td></tr>`,
  ).join('')

  const facts = thirty
    ? `<li>30 questions in 30 minutes: 10 each of maths, English and science, mixed together.</li>
    <li>Half the maths and science questions are from the Class ${ceiling} syllabus (the chapters listed below); the rest test reasoning. Each question is marked Basics or Class ${ceiling}.</li>`
    : `<li>15 questions in 15 minutes: 5 each of maths, English and science, mixed together.</li>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Reasoning test: admission to Class ${classLevel}</title>
<style>
  @page { size: A4; margin: 12mm 14mm 13mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1a1a1a; background: #fff; }
  h1 { font-size: 18pt; margin: 0 0 2pt; }
  h2 { font-size: 13pt; margin: 14pt 0 6pt; padding-bottom: 3pt; border-bottom: 1.5pt solid #1a1a1a; }
  h3 { font-size: 10.5pt; margin: 0 0 4pt; }
  .sub { margin: 0; color: #444; font-size: 11.5pt; }
  ul.facts { margin: 0; padding-left: 16pt; font-size: 10pt; line-height: 1.35; }
  ul.facts li { margin-bottom: 2pt; }
  .lead { margin: 0 0 8pt; }
  .syllabus { display: grid; grid-template-columns: 1fr 1fr; gap: 8pt 16pt; font-size: 8.75pt; line-height: 1.22; }
  .subject-block + .subject-block { margin-top: 8pt; }
  .syllabus-part { break-inside: avoid; }
  .syllabus > .subject-block + .subject-block { margin-top: 0; }
  .subject-block ol { margin: 0; padding-left: 16pt; }
  .subject-block li { margin-bottom: 1pt; }
  .note { margin: 0 0 10pt; color: #444; }
  ol.paper { margin: 0; padding-left: 20pt; }
  .question { margin-bottom: 11pt; break-inside: avoid; }
  .subject { margin: 0; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
  .stem { margin: 1pt 0 4pt; }
  ol.options { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2pt 14pt; }
  .letter { display: inline-block; width: 14pt; font-weight: 600; }
  .typein { margin: 0; color: #444; }
  .blank { display: inline-block; width: 70pt; border-bottom: 1pt solid #1a1a1a; }
  .sample, .answers { break-before: page; }
  .sample h2, .answers h2 { margin-top: 0; }
  ${thirty ? ".question { margin-bottom: 7pt; } .stem { margin: 0 0 3pt; } ol.options { gap: 1pt 14pt; } td { padding: 3pt 6pt; }" : ""}
  table { width: 100%; border-collapse: collapse; }
  tr { break-inside: avoid; }
  td { vertical-align: top; padding: 4pt 6pt; border-bottom: 0.75pt solid #ccc; }
  td.num { width: 22pt; font-weight: 600; }
  td.ans { width: 120pt; font-weight: 600; }
</style>
</head>
<body>
  <h1>Reasoning test</h1>
  <p class="sub">For admission to Class ${classLevel}</p>

  <h2>About the test</h2>
  <ul class="facts">
    ${facts}
    <li>Taken online on a phone or computer, through a link sent to the parent's WhatsApp. The link works for 3 hours.</li>
    <li>Most questions have four options; a few ask for a number to be typed in.</li>
    <li>One mark for a correct answer. A quarter mark off for a wrong multiple-choice answer; nothing off for a wrong type-in answer or a blank.</li>
    <li>Answers can be changed before submitting. If the candidate leaves the page, the timer pauses.</li>
  </ul>

  <h2>What the test covers${thirty ? ': basics' : ''}</h2>
  <p class="lead">${thirty ? 'Basics' : 'The'} questions test reasoning, not memory, on these topics.</p>
  <div class="syllabus">${topics}</div>

  ${syllabusPart}

  <section class="sample">
  <h2>Sample paper</h2>
  <p class="note">These questions were written for this sheet. The real test has different questions, in the same style and at a similar level.</p>
  <ol class="paper">${questions}</ol>
  </section>

  <section class="answers">
    <h2>Answers</h2>
    <table>${answers}</table>
  </section>
</body>
</html>
`
}

function findBrowser(): string {
  const candidates = [
    process.env.BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter((p): p is string => !!p)
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('No Edge or Chrome found. Set BROWSER to a Chromium executable.')
  return found
}

async function main(): Promise<number> {
  const shapes = await liveShapes()
  console.log(`\nPapers today: ${CLASSES.map((c) => `class ${c} ${shapes.get(c)!.questions}q`).join(' · ')}`)
  console.log(`Checking ${items.length} sample questions\n`)
  const errors = validate(shapes)
  if (errors > 0) {
    console.log(`\n${errors} error(s); nothing written.\n`)
    return 1
  }

  const htmlOnly = process.argv.includes('--html')
  // Never into OUT: anything there is public.
  const htmlDir = join(tmpdir(), 'parent-pack')
  mkdirSync(htmlDir, { recursive: true })
  mkdirSync(OUT, { recursive: true })
  const browser = htmlOnly ? null : findBrowser()

  for (const classLevel of CLASSES) {
    const name = basename(parentPackPath(classLevel), '.pdf')
    const html = join(htmlDir, `${name}.html`)
    writeFileSync(html, render(classLevel, shapes.get(classLevel)!))
    if (browser) {
      const pdf = join(OUT, `${name}.pdf`)
      rmSync(pdf, { force: true })
      execFileSync(browser, [
        '--headless',
        '--disable-gpu',
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdf}`,
        pathToFileURL(html).href,
      ], { stdio: 'ignore' })
      if (!existsSync(pdf)) throw new Error(`Browser did not write ${pdf}`)
      console.log(`  wrote ${pdf}`)
    } else {
      console.log(`  wrote ${html}`)
    }
  }
  console.log('')
  return 0
}

const entry = process.argv[1]
if (entry && resolve(entry) === resolve(fileURLToPath(import.meta.url))) {
  main().then(
    (code) => { process.exitCode = code },
    (e) => { console.error(`\n${e instanceof Error ? e.message : String(e)}\n`); process.exitCode = 1 },
  )
}
