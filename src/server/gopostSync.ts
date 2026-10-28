import 'server-only'
import type { Db } from './supabase'
import { feedPageUrl, parseFeedPage, syncFeed, type FeedCounts, type FeedDeps, type FeedRow, type SyncResult } from '../lib/gopostLeads'

// The hourly read of GoPost's admissions feed (migration 0025). Service role,
// because the call comes from pg_cron with no session to act for; the write
// is `import_feed_page`, which only service role may run. The paging rules are
// src/lib/gopostLeads.ts; this file only connects them to the database and
// to GoPost. scripts/gopost-sync.mts does the same for a run by hand.

export const GOPOST_FEED_URL = 'https://gopostapp.vercel.app/api/feeds/admissions'
const FEED = 'gopost'

const toRpcRows = (rows: FeedRow[]) =>
  rows.map((r) => ({
    mobile: r.mobile,
    name: r.name,
    stage: r.stage,
    interest: r.interest,
    source_date: r.sourceDate,
    notes: r.notes,
    source: r.source,
  }))

export function gopostDeps(db: Db, { url, secret }: { url: string; secret: string }): FeedDeps {
  const page = async (from: string | null, next: string | null, rows: FeedRow[], dryRun: boolean) => {
    const { data, error } = await db.rpc('import_feed_page', {
      p_feed: FEED,
      p_from: from,
      p_next: next,
      p_rows: toRpcRows(rows),
      p_dry_run: dryRun,
    })
    if (error) throw new Error(`import_feed_page: ${error.message}`)
    return data as FeedCounts
  }

  return {
    cursor: async () => {
      const { data, error } = await db.from('lead_feeds').select('cursor').eq('name', FEED).single()
      if (error) throw new Error(`could not read the feed's cursor: ${error.message}`)
      return data.cursor as string | null
    },
    fetchPage: async (after, limit) => {
      const res = await fetch(feedPageUrl(url, after, limit), { headers: { authorization: `Bearer ${secret}` }, cache: 'no-store' })
      if (!res.ok) throw new Error(`GoPost answered ${res.status}`)
      return parseFeedPage(await res.json())
    },
    importPage: (from, next, rows) => page(from, next, rows, false),
    preview: (rows) => page(null, null, rows, true),
    recordError: async (message) => {
      const { error } = await db.rpc('record_feed_error', { p_feed: FEED, p_error: message })
      if (error) console.error('gopost: could not record the error:', error)
    },
    now: () => Date.now(),
  }
}

export async function syncGopost(db: Db, opts: { dryRun?: boolean } = {}): Promise<SyncResult> {
  const secret = process.env.GOPOST_LEADS_SECRET
  if (!secret) throw new Error('GOPOST_LEADS_SECRET is not set')
  return syncFeed(gopostDeps(db, { url: process.env.GOPOST_FEED_URL ?? GOPOST_FEED_URL, secret }), opts)
}
