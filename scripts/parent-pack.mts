// Builds the parent pack: one PDF per admitting class, holding the test's
// format, the syllabus that class is drawn from, a sample paper and its
// answers. The PDFs go to public/parent-pack/, served without a login: the
// issue message links the admitting class's PDF, and /downloads lists all five.
//
//   npm run parent-pack              # validate, then write the PDFs
//   npm run parent-pack -- --html    # validate, write HTML only (no browser)
//   npm run parent-pack -- --sheet   # validate, write the Hindi review sheet
//
// Each class gets an English sheet and, since 2026-10-11, a Hindi edition
// (`-hi.pdf`). The Hindi one prints maths and science samples and their
// working in Hindi from sample-papers.hi.json, and topic and chapter names
// from label_hi and title_hi in syllabus.json; chapter titles are as printed
// in NCERT's Hindi-medium editions. English questions stay English. The build
// refuses a Hindi edition with anything untranslated.
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
import { translationProblems, workingProblems, type HindiEntry, type Lang } from '../src/lib/hindi'

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
  /** As printed in NCERT's Hindi-medium edition. */
  title_hi?: string
  covers: string
  skills: string[]
}

interface SyllabusFile {
  cohortYear: number
  newFrom: Record<string, number>
  topics: (Omit<SyllabusTopic, 'taught_in' | 'reasoning' | 'heading'> & { skills: string[]; reasoning?: boolean; heading?: Heading; label_hi?: string })[]
  chapters: SyllabusChapter[]
  syllabusChapters: SyllabusPartChapter[]
}

const SUBJECT_LABEL: Record<Subject, string> = { maths: 'Maths', english: 'English', science: 'Science' }
// Jaccard overlap of content words and numbers. Questions of one type share
// their wording ("Find the next number in the series"), so words alone match
// every series item; the numbers are what make two items the same question.
const SIMILAR_SHARE = 0.6

const items: PackItem[] = JSON.parse(readFileSync(join(PACK, 'sample-papers.json'), 'utf8'))
type SampleHindi = HindiEntry & { rationale_hi: string }
const sampleHi = new Map<string, SampleHindi>(
  (JSON.parse(readFileSync(join(PACK, 'sample-papers.hi.json'), 'utf8')) as SampleHindi[]).map((e) => [e.ref, e]),
)
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
const topicsHi: SyllabusTopic[] = syllabusInput.topics.map((t) => ({
  ...t,
  label: syllabusFile.topics.find((f) => f.key === t.key)?.label_hi ?? t.label,
}))
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

  // The Hindi edition: everything it prints must be translated, and each
  // translation must keep the question's numbers and the working's.
  for (const t of syllabusFile.topics) {
    if (!t.label_hi?.trim()) {
      errors++
      console.log(`  ERROR  topic "${t.label}" has no label_hi (syllabus.json)`)
    }
  }
  for (const c of syllabusFile.syllabusChapters) {
    if (c.term === 1 && !c.title_hi?.trim()) {
      errors++
      console.log(`  ERROR  class ${c.classLevel} ${c.book} ch. ${c.chapter} has no title_hi (syllabus.json)`)
    }
  }
  for (const item of items.filter((i) => i.subject !== 'english')) {
    const hi = sampleHi.get(item.ref)
    const problems = !hi
      ? ['has no Hindi in sample-papers.hi.json']
      : [
          ...translationProblems({ subject: item.subject, format: item.format, stem: item.stem, options: (item.options ?? null) as never }, hi),
          ...workingProblems(item.rationale, hi.rationale_hi ?? ''),
        ]
    for (const problem of problems) {
      errors++
      console.log(`  ERROR  ${item.ref} (Hindi): ${problem}`)
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

/** The sheet's own words. English questions stay English in the Hindi edition. */
const TEXT = {
  en: {
    pageFoot: '"Page " counter(page) " of " counter(pages)',
    font: 'family=Inter:wght@400;500;600;700',
    fontFamily: 'Inter, "Segoe UI", Arial, sans-serif',
    title: (c: number) => `Aptitude Test: admission to Class ${c}`,
    eyebrow: 'Syllabus and sample paper',
    h1: 'Aptitude Test',
    sub: (c: number) => `For admission to Class ${c}`,
    statQuestions: 'questions',
    statMinutes: 'minutes',
    statOpen: '3 hours',
    statOpenLabel: 'link stays open',
    about: 'About the test',
    facts30: (c: number) => `<li>30 questions in 30 minutes: 10 each of maths, English and science, mixed together.</li>
    <li>Half the maths and science questions are from the Class ${c} syllabus (the chapters listed below); the rest test reasoning. Each question is marked Basics or Class ${c}.</li>`,
    facts15: `<li>15 questions in 15 minutes: 5 each of maths, English and science, mixed together.</li>`,
    factsCommon: `<li>Taken online on a phone or computer, through a link sent to the parent's WhatsApp. The link works for 3 hours.</li>
    <li>Most questions have four options; a few ask for a number to be typed in.</li>
    <li>One mark for a correct answer. A quarter mark off for a wrong multiple-choice answer; nothing off for a wrong type-in answer or a blank.</li>
    <li>Answers can be changed before submitting. If the candidate leaves the page, the timer pauses.</li>`,
    covers: (thirty: boolean) => `What the test covers${thirty ? ': basics' : ''}`,
    lead: (thirty: boolean) => `${thirty ? 'Basics' : 'The'} questions test reasoning, not memory, on these topics.`,
    headings: { maths: 'Maths', english: 'English', science: 'Science', reasoning: 'Reasoning' } as Record<Heading, string>,
    syllabusHeading: (c: number) => `Class ${c} syllabus questions`,
    subjects: SUBJECT_LABEL,
    basics: 'Basics',
    partClass: (c: number) => `Class ${c}`,
    typein: 'Type-in answer: ',
    sample: 'Sample paper',
    note: 'These questions were written for this sheet. The real test has different questions, in the same style and at a similar level.',
    answers: 'Answers',
    answerCol: 'Answer',
    workingCol: 'Working',
  },
  hi: {
    pageFoot: '"पृष्ठ " counter(page) " / " counter(pages)',
    font: 'family=Inter:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700',
    fontFamily: 'Inter, "Noto Sans Devanagari", "Nirmala UI", "Segoe UI", Arial, sans-serif',
    title: (c: number) => `अभिक्षमता परीक्षा: कक्षा ${c} में प्रवेश`,
    eyebrow: 'पाठ्यक्रम और नमूना प्रश्नपत्र',
    h1: 'अभिक्षमता परीक्षा',
    sub: (c: number) => `कक्षा ${c} में प्रवेश के लिए`,
    statQuestions: 'प्रश्न',
    statMinutes: 'मिनट',
    statOpen: '3 घंटे',
    statOpenLabel: 'लिंक खुला रहता है',
    about: 'परीक्षा के बारे में',
    facts30: (c: number) => `<li>30 मिनट में 30 प्रश्न: गणित, अंग्रेज़ी और विज्ञान के 10-10, मिले-जुले क्रम में।</li>
    <li>गणित और विज्ञान के आधे प्रश्न कक्षा ${c} के पाठ्यक्रम से हैं (नीचे दिए अध्याय); बाकी तर्कशक्ति जाँचते हैं। हर प्रश्न पर "बुनियादी" या "कक्षा ${c}" लिखा होता है।</li>`,
    facts15: `<li>15 मिनट में 15 प्रश्न: गणित, अंग्रेज़ी और विज्ञान के 5-5, मिले-जुले क्रम में।</li>`,
    factsCommon: `<li>फ़ोन या कंप्यूटर पर ऑनलाइन, अभिभावक के WhatsApp पर भेजे गए लिंक से। लिंक 3 घंटे तक काम करता है।</li>
    <li>गणित और विज्ञान के प्रश्न हिंदी में भी पढ़े जा सकते हैं; अंग्रेज़ी के प्रश्न अंग्रेज़ी में ही होते हैं।</li>
    <li>अधिकतर प्रश्नों में चार विकल्प होते हैं; कुछ में एक संख्या लिखनी होती है।</li>
    <li>सही उत्तर पर एक अंक। बहुविकल्पीय प्रश्न के गलत उत्तर पर चौथाई अंक कटता है; संख्या लिखने वाले प्रश्न के गलत उत्तर पर या प्रश्न छोड़ने पर कोई अंक नहीं कटता।</li>
    <li>जमा करने से पहले उत्तर बदले जा सकते हैं। विद्यार्थी पेज छोड़े तो टाइमर रुक जाता है।</li>`,
    covers: (thirty: boolean) => `परीक्षा में क्या आता है${thirty ? ': बुनियादी' : ''}`,
    lead: (thirty: boolean) => `${thirty ? 'बुनियादी प्रश्न' : 'प्रश्न'} इन विषयों पर रटने की नहीं, तर्क की जाँच करते हैं।`,
    headings: { maths: 'गणित', english: 'अंग्रेज़ी', science: 'विज्ञान', reasoning: 'तर्कशक्ति' } as Record<Heading, string>,
    syllabusHeading: (c: number) => `कक्षा ${c} के पाठ्यक्रम के प्रश्न`,
    subjects: { maths: 'गणित', english: 'अंग्रेज़ी', science: 'विज्ञान' } as Record<Subject, string>,
    basics: 'बुनियादी',
    partClass: (c: number) => `कक्षा ${c}`,
    typein: 'उत्तर लिखें: ',
    sample: 'नमूना प्रश्नपत्र',
    note: 'ये प्रश्न इसी पत्रक के लिए लिखे गए हैं। असली परीक्षा में अलग प्रश्न होते हैं, इसी शैली के और लगभग इसी स्तर के। अंग्रेज़ी के प्रश्न अंग्रेज़ी में ही हैं।',
    answers: 'उत्तर',
    answerCol: 'उत्तर',
    workingCol: 'हल',
  },
} as const

/** A sample's words in the sheet's language: Hindi for maths and science in the Hindi edition. */
function sampleText(item: PackItem, lang: Lang) {
  const hi = lang === 'hi' && item.subject !== 'english' ? sampleHi.get(item.ref) : undefined
  return {
    stem: hi?.stem_hi ?? item.stem,
    option: (c: string) => (hi?.options_hi?.[c as 'A'] ?? item.options?.[c] ?? ''),
    working: hi?.rationale_hi ?? item.rationale,
  }
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

function answerText(item: PackItem, lang: Lang): string {
  if (item.format === 'numeric') return String(item.numeric_answer)
  return `${item.answer_key}. ${sampleText(item, lang).option(item.answer_key ?? '')}`
}

function render(classLevel: ClassLevel, shape: PaperShape, lang: Lang = 'en'): string {
  const t = TEXT[lang]
  const hi = lang === 'hi'
  const ceiling = contentCeiling(classLevel)
  const thirty = shape === SHAPE_30
  const paper = ordered(items.filter((i) => i.paper === classLevel))

  // Broad names only. Classes, books and chapter numbers are checked by
  // validate() but not printed: parents asked about them more than they helped.
  const numbered = (heading: Heading, names: string[]) =>
    names.length === 0
      ? ''
      : `<div class="subject-block ${heading}"><h3>${escape(t.headings[heading])}</h3><ol>${names.map((n) => `<li>${escape(n)}</li>`).join('')}</ol></div>`
  const lists = basicsTopics(classLevel, hi ? topicsHi : syllabusInput.topics)
  // English is short and maths ends sooner than science, so English goes under maths.
  const topics = `<div>${numbered('maths', lists.maths)}${numbered('english', lists.english)}</div>`
    + `<div>${numbered('science', lists.science)}${numbered('reasoning', lists.reasoning)}</div>`

  // Class 11 science is two books: Physics first, then Chemistry, numbered on.
  const chapterNames = (s: Subject) => {
    const chapters = firstTermChapters(classLevel).filter((c) => c.subject === s)
    const books = [...new Set(chapters.map((c) => c.book))]
    return books.flatMap((book) => chapters.filter((c) => c.book === book).map((c) => (hi ? c.title_hi! : c.title)))
  }
  const syllabusPart = thirty
    ? `<section class="syllabus-part"><h2>${escape(t.syllabusHeading(ceiling))}</h2>
  <div class="syllabus">${numbered('maths', chapterNames('maths'))}${numbered('science', chapterNames('science'))}</div></section>`
    : ''

  const partTag = (item: PackItem) =>
    thirty ? `<span class="tag part">${isSyllabus(item) ? t.partClass(ceiling) : t.basics}</span>` : ''
  const questions = paper.map((item, n) => {
    const text = sampleText(item, lang)
    // An English question in the Hindi edition is marked English, for screen readers and hyphenation.
    const langAttr = hi && item.subject === 'english' ? ' lang="en"' : ''
    const body =
      item.format === 'mcq'
        ? `<ol class="options"${langAttr}>${['A', 'B', 'C', 'D']
            .map((c) => `<li><span class="letter">${c}</span>${escape(text.option(c))}</li>`)
            .join('')}</ol>`
        : `<p class="typein">${escape(t.typein)}<span class="blank"></span></p>`
    return `<li class="question"><span class="qnum">${n + 1}</span><div class="qbody"><p class="tags"><span class="tag ${item.subject}">${escape(t.subjects[item.subject])}</span>${partTag(item)}</p><p class="stem"${langAttr}>${escape(text.stem)}</p>${body}</div></li>`
  }).join('')

  const answers = paper.map((item, n) => {
    const langAttr = hi && item.subject === 'english' ? ' lang="en"' : ''
    return `<tr><td class="num">${n + 1}</td><td class="ans"${langAttr}>${escape(answerText(item, lang))}</td><td${langAttr}>${escape(sampleText(item, lang).working)}</td></tr>`
  }).join('')

  const count = thirty ? 30 : 15
  const facts = thirty ? t.facts30(ceiling) : t.facts15

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${escape(t.title(classLevel))}</title>
<!-- Inter, as on the site. Fetched at build time; Segoe UI or Arial if offline. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${t.font}&display=swap">
<style>
  /* The site's colours: indigo accent, and the parent score sheet's subject colours. */
  :root {
    --ink: #0f172a; --body: #334155; --muted: #64748b; --line: #e2e8f0; --tint: #f8fafc;
    --brand: #4338ca; --brand-soft: #eef2ff;
    --maths: #2563eb; --maths-soft: #dbeafe;
    --english: #7c3aed; --english-soft: #ede9fe;
    --science: #059669; --science-soft: #d1fae5;
    --reasoning: #d97706; --reasoning-soft: #fef3c7;
  }
  @page {
    size: A4; margin: 12mm 14mm 14mm;
    @bottom-center { content: ${t.pageFoot}; font: 7.5pt ${t.fontFamily}; color: #64748b; }
  }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font-family: ${t.fontFamily}; font-size: 10pt; line-height: 1.45; color: var(--body); background: #fff; }
  h1, h2, h3 { color: var(--ink); }

  .band { display: flex; align-items: center; gap: 12pt; padding: 15pt 18pt; border-radius: 10pt; color: #fff;
    background: linear-gradient(135deg, #1e3a8a 0%, #4338ca 100%); }
  .mark { width: 30pt; height: 30pt; border-radius: 7pt; display: grid; place-items: center; flex: none;
    background: rgba(255,255,255,.15); border: 0.75pt solid rgba(255,255,255,.3); }
  .eyebrow { margin: 0; font-size: 7.5pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #c7d2fe; }
  h1 { margin: 1pt 0 0; font-size: 20pt; font-weight: 700; letter-spacing: -.01em; color: #fff; }
  .sub { margin: 1pt 0 0; font-size: 10.5pt; color: #e0e7ff; }

  .stats { margin-left: auto; display: flex; gap: 6pt; }
  .stat { min-width: 58pt; padding: 5pt 8pt; border-radius: 7pt; background: rgba(255,255,255,.12); border: 0.75pt solid rgba(255,255,255,.22); }
  .stat b { display: block; font-size: 14pt; line-height: 1.15; font-weight: 700; color: #fff; }
  .stat span { font-size: 7.5pt; color: #e0e7ff; }

  h2 { font-size: 12pt; font-weight: 700; margin: 12pt 0 6pt; padding-left: 7pt; border-left: 3pt solid var(--brand); line-height: 1.2; }
  h3 { font-size: 9.5pt; font-weight: 700; margin: 0 0 3pt; }
  ul.facts { list-style: none; margin: 0; padding: 0; font-size: 9.5pt; line-height: 1.38; }
  ul.facts li { position: relative; padding-left: 14pt; margin-bottom: 2.5pt; }
  ul.facts li::before { content: ""; position: absolute; left: 1pt; top: 3.5pt; width: 6pt; height: 3pt;
    border-left: 1.5pt solid var(--brand); border-bottom: 1.5pt solid var(--brand); transform: rotate(-45deg); }
  .lead { margin: 0 0 7pt; }

  .syllabus { display: grid; grid-template-columns: 1fr 1fr; gap: 7pt 10pt; font-size: 8.75pt; line-height: 1.25; }
  .subject-block { border: 0.75pt solid var(--line); border-top: 2.5pt solid var(--brand); border-radius: 6pt; padding: 6pt 9pt 5pt; break-inside: avoid; }
  .subject-block + .subject-block { margin-top: 7pt; }
  .syllabus > .subject-block + .subject-block { margin-top: 0; }
  .subject-block.maths { border-top-color: var(--maths); } .subject-block.maths h3 { color: var(--maths); }
  .subject-block.english { border-top-color: var(--english); } .subject-block.english h3 { color: var(--english); }
  .subject-block.science { border-top-color: var(--science); } .subject-block.science h3 { color: var(--science); }
  .subject-block.reasoning { border-top-color: var(--reasoning); } .subject-block.reasoning h3 { color: var(--reasoning); }
  .subject-block ol { margin: 0; padding-left: 15pt; }
  .subject-block li { margin-bottom: 1pt; }
  .subject-block li::marker { color: var(--muted); }
  .syllabus-part { break-inside: avoid; }

  .note { margin: 0 0 9pt; color: var(--muted); }
  ol.paper { list-style: none; margin: 0; padding: 0; }
  .question { display: flex; gap: 8pt; margin-bottom: 10pt; break-inside: avoid; }
  .qnum { flex: none; width: 17pt; height: 17pt; border-radius: 50%; background: var(--brand-soft); color: var(--brand);
    font-size: 8pt; font-weight: 700; display: grid; place-items: center; margin-top: 1pt; }
  .qbody { flex: 1; min-width: 0; }
  .tags { margin: 0 0 2pt; display: flex; gap: 4pt; }
  .tag { font-size: 6.75pt; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; padding: 1pt 5pt; border-radius: 6pt; }
  .tag.maths { color: #1d4ed8; background: var(--maths-soft); }
  .tag.english { color: #6d28d9; background: var(--english-soft); }
  .tag.science { color: #047857; background: var(--science-soft); }
  .tag.part { color: var(--body); background: #f1f5f9; }
  .stem { margin: 0 0 4pt; color: var(--ink); }
  ol.options { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 2.5pt 12pt; }
  ol.options li { display: flex; align-items: baseline; gap: 5pt; }
  .letter { flex: none; display: inline-grid; place-items: center; width: 12pt; height: 12pt; border-radius: 50%;
    border: 0.75pt solid #cbd5e1; font-size: 7pt; font-weight: 700; color: var(--body); transform: translateY(-0.5pt); }
  .typein { margin: 0; color: var(--muted); display: flex; align-items: center; gap: 6pt; }
  .blank { display: inline-block; width: 80pt; height: 15pt; border: 0.75pt solid #cbd5e1; border-radius: 4pt; }

  .sample, .answers { break-before: page; }
  .sample h2, .answers h2 { margin-top: 0; }
  ${thirty ? ".question { margin-bottom: 6.5pt; } .stem { margin: 0 0 3pt; } ol.options { gap: 1.5pt 12pt; } td { padding: 3.5pt 6pt; }" : ""}${hi ? " /* Letter-spacing pulls Devanagari conjuncts apart. */ .eyebrow, .tag, thead td { letter-spacing: 0; }" : ""}

  table { width: 100%; border-collapse: collapse; }
  thead td { background: var(--brand-soft); color: var(--brand); font-size: 7.5pt; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  tr { break-inside: avoid; }
  td { vertical-align: top; padding: 4pt 6pt; border-bottom: 0.75pt solid var(--line); }
  tbody tr:nth-child(even) td { background: var(--tint); }
  td.num { width: 22pt; font-weight: 700; color: var(--muted); }
  td.ans { width: 125pt; font-weight: 600; color: var(--brand); }
</style>
</head>
<body>
  <header class="band">
    <div class="mark"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 3 9 3 12 0v-5"/></svg></div>
    <div>
      <p class="eyebrow">${escape(t.eyebrow)}</p>
      <h1>${escape(t.h1)}</h1>
      <p class="sub">${escape(t.sub(classLevel))}</p>
    </div>
    <div class="stats">
      <div class="stat"><b>${count}</b><span>${escape(t.statQuestions)}</span></div>
      <div class="stat"><b>${count}</b><span>${escape(t.statMinutes)}</span></div>
      <div class="stat"><b>${escape(t.statOpen)}</b><span>${escape(t.statOpenLabel)}</span></div>
    </div>
  </header>

  <h2>${escape(t.about)}</h2>
  <ul class="facts">
    ${facts}
    ${t.factsCommon}
  </ul>

  <h2>${escape(t.covers(thirty))}</h2>
  <p class="lead">${escape(t.lead(thirty))}</p>
  <div class="syllabus">${topics}</div>

  ${syllabusPart}

  <section class="sample">
  <h2>${escape(t.sample)}</h2>
  <p class="note">${escape(t.note)}</p>
  <ol class="paper">${questions}</ol>
  </section>

  <section class="answers">
    <h2>${escape(t.answers)}</h2>
    <table><thead><tr><td class="num">#</td><td class="ans">${escape(t.answerCol)}</td><td>${escape(t.workingCol)}</td></tr></thead><tbody>${answers}</tbody></table>
  </section>
</body>
</html>
`
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** English and Hindi side by side: every name and sample the Hindi sheets print. */
function reviewSheet(): string {
  const out = [
    '# Hindi parent sheets — for review',
    '',
    'Everything the Hindi editions print that differs from the English: topic names, chapter titles',
    "(as printed in NCERT's Hindi-medium editions, contents pages read 2026-10-11), and each maths and",
    'science sample with its working. English samples print in English and are not listed. The build',
    'has already checked that every number survives, per option and in the working.',
    '',
    '## Topics',
    '',
    '| English | हिंदी |',
    '|---|---|',
    ...[...new Map(syllabusFile.topics.map((t) => [t.label, t.label_hi ?? ''])).entries()].map(([en, hi]) => `| ${cell(en)} | ${cell(hi)} |`),
    '',
    '## Chapters (first term of class N−1)',
    '',
    '| Class | Book | Ch. | English | हिंदी |',
    '|---|---|---|---|---|',
    ...syllabusFile.syllabusChapters
      .filter((c) => c.term === 1)
      .map((c) => `| ${c.classLevel} | ${c.book} | ${c.chapter} | ${cell(c.title)} | ${cell(c.title_hi ?? '')} |`),
    '',
  ]
  for (const classLevel of CLASSES) {
    out.push(`## Sample paper, class ${classLevel}`, '')
    for (const item of ordered(items.filter((i) => i.paper === classLevel)).filter((i) => i.subject !== 'english')) {
      const hi = sampleHi.get(item.ref)
      out.push(`### ${item.ref} · ${item.subject} · ${item.difficulty}`, '', '| | English | हिंदी |', '|---|---|---|')
      out.push(`| Question | ${cell(item.stem)} | ${cell(hi?.stem_hi ?? '')} |`)
      if (item.format === 'mcq') {
        for (const c of ['A', 'B', 'C', 'D']) {
          out.push(`| ${c}${item.answer_key === c ? ' **✓**' : ''} | ${cell(item.options?.[c] ?? '')} | ${cell(hi?.options_hi?.[c as 'A'] ?? '')} |`)
        }
      } else {
        out.push(`| Answer | ${item.numeric_answer} (typed in) | |`)
      }
      out.push(`| Working | ${cell(item.rationale)} | ${cell(hi?.rationale_hi ?? '')} |`, '')
    }
  }
  return out.join('\n')
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

  if (process.argv.includes('--sheet')) {
    const path = join(PACK, 'hindi-review.md')
    writeFileSync(path, reviewSheet())
    console.log(`  wrote ${path}\n`)
    return 0
  }

  for (const [classLevel, lang] of CLASSES.flatMap((c) => (['en', 'hi'] as const).map((l) => [c, l] as const))) {
    const name = basename(parentPackPath(classLevel, lang), '.pdf')
    const html = join(htmlDir, `${name}.html`)
    writeFileSync(html, render(classLevel, shapes.get(classLevel)!, lang))
    if (browser) {
      const pdf = join(OUT, `${name}.pdf`)
      rmSync(pdf, { force: true })
      execFileSync(browser, [
        '--headless',
        '--disable-gpu',
        '--no-pdf-header-footer',
        '--virtual-time-budget=8000',
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
