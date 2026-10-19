// Builds the hiring question bank's files from PYQ Vault's public bank.
//
//   npm run hiring:import                 # every subject
//   npm run hiring:import -- maths        # one subject
//
// Reads PYQ Vault's public API only (PYQVAULT_URL, PYQVAULT_ANON_KEY in
// .env.local) and writes content/hiring/<subject>.json, to be reviewed and
// committed; `npm run hiring:seed` loads it. Nothing is written to either
// database here.
//
// Takes moderate past-year questions only, never practice ones, never a
// question PYQ Vault cancelled or holds back. Which of those the test can
// carry, and how many it keeps, are the rules in src/lib/hiring.ts. The pick
// is seeded, so a re-run on an unchanged source writes the same files.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  HIRING_SOURCES,
  HIRING_SUBJECTS,
  pickPool,
  rejectReason,
  toHiringItem,
  type HiringItem,
  type HiringSource,
  type HiringSubject,
  type SourceRow,
} from '../src/lib/hiring'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'content', 'hiring')

/** PYQ Vault's names for the exams and subjects each source draws on. */
const PYQ_EXAM: Record<HiringSource, string> = { nda: 'NDA', 'mht-cet': 'MHT-CET', 'jee-mains': 'JEE Mains', cds: 'CDS' }
const PYQ_SUBJECT: Record<HiringSource, Partial<Record<HiringSubject, string>>> = {
  nda: { maths: 'Mathematics' },
  'mht-cet': { physics: 'Physics', chemistry: 'Chemistry' },
  'jee-mains': { maths: 'Maths', physics: 'Physics', chemistry: 'Chemistry' },
  cds: { english: 'English' },
}

const SEED = 'hiring-2026-10-19'

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

async function main(): Promise<number> {
  const env = readEnv()
  const url = env.PYQVAULT_URL
  const key = env.PYQVAULT_ANON_KEY
  if (!url || !key) {
    console.error('Need PYQVAULT_URL and PYQVAULT_ANON_KEY in .env.local (see .env.example).')
    return 1
  }
  const headers = { apikey: key, Authorization: `Bearer ${key}` }

  const get = async <T,>(path: string, range?: string): Promise<T> => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: range ? { ...headers, Range: range } : headers })
    if (!res.ok) throw new Error(`PYQ Vault ${res.status} on ${path.split('?')[0]}: ${(await res.text()).slice(0, 300)}`)
    return (await res.json()) as T
  }

  const subjectId = async (source: HiringSource, subject: HiringSubject): Promise<string> => {
    const [exam] = await get<{ id: string }[]>(`exams?select=id&name=eq.${encodeURIComponent(PYQ_EXAM[source])}`)
    const name = PYQ_SUBJECT[source][subject]
    if (!exam || !name) throw new Error(`No PYQ Vault exam/subject for ${source} ${subject}`)
    const [s] = await get<{ id: string }[]>(`subjects?select=id&exam_id=eq.${exam.id}&name=eq.${encodeURIComponent(name)}`)
    if (!s) throw new Error(`PYQ Vault has no subject "${name}" under ${PYQ_EXAM[source]}`)
    return s.id
  }

  const only = process.argv[2]
  const subjects = only ? HIRING_SUBJECTS.filter((s) => s === only) : HIRING_SUBJECTS
  if (subjects.length === 0) {
    console.error(`Unknown subject "${only}". One of: ${HIRING_SUBJECTS.join(', ')}`)
    return 1
  }

  mkdirSync(OUT, { recursive: true })
  for (const subject of subjects) {
    const items: HiringItem[] = []
    for (const { source, format, pool } of HIRING_SOURCES[subject]) {
      const id = await subjectId(source, subject)
      const query =
        'questions?select=id,text,context,image_url,question_format,numeric_answer,pyq_year,pyq_note,' +
        'chapters(name),options(label,text,is_correct,image_url)' +
        `&subject_id=eq.${id}&visibility=eq.PUBLIC&question_kind=eq.pyq&difficulty=eq.MODERATE` +
        `&question_format=eq.${format}&cancelled_note=is.null&publish_blocked=is.null&order=id`

      const rows: SourceRow[] = []
      for (let from = 0; ; from += 1000) {
        const page = await get<(Omit<SourceRow, 'chapter'> & { chapters: { name: string } | null })[]>(query, `${from}-${from + 999}`)
        for (const { chapters, ...r } of page) rows.push({ ...r, options: r.options ?? [], chapter: chapters?.name ?? 'Other' })
        if (page.length < 1000) break
      }

      const reasons: Record<string, number> = {}
      const eligible: HiringItem[] = []
      for (const row of rows) {
        const why = rejectReason(row, subject)
        if (why) reasons[why] = (reasons[why] ?? 0) + 1
        else eligible.push(toHiringItem(row, subject, source))
      }
      const picked = pickPool(eligible, pool, `${SEED}/${subject}/${source}`)
      items.push(...picked)

      const left = Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'
      const chapters = new Set(picked.map((p) => p.chapter)).size
      console.log(
        `${subject.padEnd(9)} ${source.padEnd(9)} ${format.padEnd(7)} ${rows.length} moderate · ${eligible.length} usable · kept ${picked.length} across ${chapters} chapters · left out: ${left}`,
      )
      if (picked.length < pool) console.log(`  ! wanted ${pool}, the source had only ${picked.length} usable`)
    }
    writeFileSync(join(OUT, `${subject}.json`), JSON.stringify(items, null, 2) + '\n')
  }
  console.log(`\nWrote ${subjects.map((s) => `content/hiring/${s}.json`).join(', ')}. Review, then npm run hiring:seed.`)
  return 0
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  },
)
