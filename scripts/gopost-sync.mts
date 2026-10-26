// GoPost's leads, by hand: the same run the hourly route makes.
//
//   npm run leads:gopost -- --dry-run    what a run would do, writing nothing
//   npm run leads:gopost                 import, from where the feed stopped
//
// The first import (every lead GoPost holds) is done here, after a dry run
// the owner has seen; the hourly job only carries on from the cursor.
//
// It does not import src/server/gopostSync.ts, which is `server-only` (see
// issue-test.mts for why that guard is not shimmed). It builds the same three
// calls and runs the same loop, src/lib/gopostLeads.ts.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { feedPageUrl, parseFeedPage, syncFeed, type FeedCounts, type FeedRow } from '../src/lib/gopostLeads'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FEED = 'gopost'
const URL_DEFAULT = 'https://gopostapp.vercel.app/api/feeds/admissions'

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()] as const
    }),
)

async function main(): Promise<number> {
  const dryRun = process.argv.includes('--dry-run')
  const secret = env.GOPOST_LEADS_SECRET
  if (!secret) {
    console.error('GOPOST_LEADS_SECRET is not set in .env.local')
    return 1
  }
  const url = env.GOPOST_FEED_URL ?? URL_DEFAULT
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

  const page = async (from: string | null, next: string | null, rows: FeedRow[], dry: boolean) => {
    const { data, error } = await db.rpc('import_feed_page', {
      p_feed: FEED,
      p_from: from,
      p_next: next,
      p_rows: rows.map((r) => ({ ...r, source_date: r.sourceDate })),
      p_dry_run: dry,
    })
    if (error) throw new Error(`import_feed_page: ${error.message}`)
    return data as FeedCounts
  }

  const bySource = new Map<string, number>()
  const result = await syncFeed(
    {
      cursor: async () => {
        const { data, error } = await db.from('lead_feeds').select('cursor').eq('name', FEED).single()
        if (error) throw new Error(`could not read the feed's cursor: ${error.message}`)
        return data.cursor as string | null
      },
      fetchPage: async (after) => {
        const res = await fetch(feedPageUrl(url, after), { headers: { authorization: `Bearer ${secret}` } })
        if (!res.ok) throw new Error(`GoPost answered ${res.status}`)
        return parseFeedPage(await res.json())
      },
      importPage: (from, next, rows) => page(from, next, rows, false),
      preview: async (rows) => {
        for (const r of rows) bySource.set(r.source, (bySource.get(r.source) ?? 0) + 1)
        return page(null, null, rows, true)
      },
      recordError: async (message) => {
        await db.rpc('record_feed_error', { p_feed: FEED, p_error: message })
      },
      now: () => Date.now(),
    },
    { dryRun, budgetMs: Number.POSITIVE_INFINITY },
  )

  // Counts only; a sibling's number is looked up on /leads, not printed here.
  console.log(`\n${dryRun ? 'Dry run — nothing written' : 'Imported'}: ${result.leads} leads from GoPost in ${result.pages} pages`)
  console.log(`  new leads:          ${result.created}`)
  console.log(`  already here:       ${result.merged}  (source and note added; stage and telecaller kept)`)
  console.log(`  siblings, skipped:  ${result.ambiguous.length}  (number on more than one lead)`)
  console.log(`  not a mobile:       ${result.skipped}`)
  if (bySource.size) {
    console.log('  by source:')
    for (const [source, n] of [...bySource].sort((a, b) => b[1] - a[1])) console.log(`    ${source.padEnd(22)} ${n}`)
  }
  return 0
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  },
)
