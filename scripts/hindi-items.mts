// Hindi versions of maths and science items (2026-10-11).
//
//   npm run items:hindi -- --stamp <batch>   fill in `source` on entries that have none
//   npm run items:hindi -- --sheet <batch>   write the review sheet, content/items/hi/<batch>.hi.md
//   npm run items:hindi -- --file <batch>    load one reviewed batch into test_items
//
// A batch is content/items/hi/<batch>.hi.json, the translations of one English
// batch, each entry { ref, source, stem_hi, options_hi }. Loading is the
// sign-off for a batch, as `items:seed -- --live --file` is for answer keys:
// a plain `items:seed` never writes the Hindi columns, so no translation
// reaches a candidate until its batch is loaded.
//
// The load goes through set_hindi() (migration 0016): all of the batch or
// none of it. The database refuses it while any candidate is mid-test on a
// paper holding one of its items; wait for that test to end and run it again.
// A correction that changes what a question means is not a reload: retire the
// item and write a new one.
//
// `source` fingerprints the English a translation was made from, so the lint
// can say when the English has changed under it. --stamp fills it only where
// it is missing; a stale stamp is fixed by hand, after checking the Hindi.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { lintItems, HINDI_DIR } from './items-lint.mts'
import { sourceStamp, type HindiEntry } from '../src/lib/hindi'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BANK = join(ROOT, 'content', 'items')
const CHOICES = ['A', 'B', 'C', 'D'] as const

interface BankItem {
  ref: string
  subject: string
  difficulty: string
  part?: string
  taught_in: number
  format: 'mcq' | 'numeric'
  stem: string
  options?: Record<string, string>
  answer_key?: string
  numeric_answer?: number
}

function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  const next = i === -1 ? undefined : process.argv[i + 1]
  return next && !next.startsWith('--') ? next : undefined
}

/** "syllabus-class-07", "syllabus-class-07.json" and "syllabus-class-07.hi.json" all name one batch. */
const batchName = (arg: string) => arg.replace(/\.json$/i, '').replace(/\.hi$/i, '')

function readBatch(name: string): HindiEntry[] {
  const path = join(HINDI_DIR, `${name}.hi.json`)
  if (!existsSync(path)) throw new Error(`No translations at ${path}`)
  return JSON.parse(readFileSync(path, 'utf8')) as HindiEntry[]
}

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(join(ROOT, '.env.local'), 'utf8')
      .split('\n')
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=')
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
      }),
  )
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ')

/** Side by side, the key marked, so a reviewer checks that the right option still says the right thing. */
function sheet(name: string, entries: HindiEntry[], bank: Map<string, BankItem>): string {
  const out = [
    `# Hindi — ${name} — ${entries.length} items`,
    '',
    `**Status:** for review. Loaded with \`npm run items:hindi -- --file ${name}\` once signed off.`,
    '',
    'Read each Hindi line against the English: same question, same numbers, and each option',
    'saying what the same letter says in English (the key letter is shared). Wording follows',
    "NCERT's Hindi-medium books. `items:lint` has already checked the numbers and the shape.",
    '',
  ]
  for (const entry of entries) {
    const en = bank.get(entry.ref)
    if (!en) continue
    const part = en.part === 'syllabus' ? `class ${en.taught_in} syllabus` : 'basics'
    out.push(`## ${entry.ref} · ${en.subject} · ${en.difficulty} · ${part}`, '', '| | English | हिंदी |', '|---|---|---|')
    out.push(`| Question | ${cell(en.stem)} | ${cell(entry.stem_hi)} |`)
    if (en.format === 'mcq') {
      for (const c of CHOICES) {
        const key = en.answer_key === c ? ` **✓**` : ''
        out.push(`| ${c}${key} | ${cell(en.options?.[c] ?? '')} | ${cell(entry.options_hi?.[c] ?? '')} |`)
      }
    } else {
      out.push(`| Answer | ${en.numeric_answer} (typed in) | |`)
    }
    out.push('')
  }
  return out.join('\n')
}

function readBank(): Map<string, BankItem> {
  return new Map<string, BankItem>(
    readdirSync(BANK)
      .filter((f) => f.endsWith('.json'))
      .flatMap((f) => JSON.parse(readFileSync(join(BANK, f), 'utf8')) as BankItem[])
      .map((i) => [i.ref, i]),
  )
}

/** One entry per line group, `source` straight after `ref`, as the files are written. */
function writeBatch(name: string, entries: HindiEntry[]) {
  const ordered = entries.map(({ ref, source, stem_hi, options_hi }) => ({ ref, source, stem_hi, options_hi }))
  writeFileSync(join(HINDI_DIR, `${name}.hi.json`), `${JSON.stringify(ordered, null, 1)}\n`)
}

async function main(): Promise<number> {
  const stampArg = flagValue('--stamp')
  const sheetArg = flagValue('--sheet')
  const fileArg = flagValue('--file')
  if ([stampArg, sheetArg, fileArg].filter(Boolean).length !== 1) {
    console.error('Give one of --stamp, --sheet or --file, with a batch name.')
    return 1
  }

  if (stampArg) {
    const name = batchName(stampArg)
    const bank = readBank()
    const entries = readBatch(name)
    let stamped = 0
    for (const entry of entries) {
      const en = bank.get(entry.ref)
      if (entry.source || !en) continue
      entry.source = sourceStamp({ stem: en.stem, options: (en.options ?? null) as never })
      stamped++
    }
    writeBatch(name, entries)
    console.log(`Stamped ${stamped} of ${entries.length} entries in ${name}.\n`)
    return 0
  }

  if (lintItems() !== 0) {
    console.error('\nStopped: item lint failed.\n')
    return 1
  }

  const name = batchName((sheetArg ?? fileArg)!)
  const entries = readBatch(name)

  if (sheetArg) {
    const bank = readBank()
    const path = join(HINDI_DIR, `${name}.hi.md`)
    writeFileSync(path, sheet(name, entries, bank))
    console.log(`Wrote ${path}\n`)
    return 0
  }

  const env = readEnv()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Missing Supabase env vars in .env.local')
    return 1
  }

  const res = await fetch(`${url}/rest/v1/rpc/set_hindi`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_rows: entries.map((e) => ({ ref: e.ref, stem_hi: e.stem_hi, options_hi: e.options_hi ?? null })),
    }),
  })
  if (!res.ok) {
    console.error(`\nNothing loaded: ${(await res.text()).slice(0, 400)}\n`)
    return 1
  }
  console.log(`Loaded Hindi for ${await res.json()} item(s) from ${name}.\n`)
  return 0
}

main().then(
  (code) => { process.exitCode = code },
  (e) => { console.error(`\n${e instanceof Error ? e.message : String(e)}\n`); process.exitCode = 1 },
)
