// GoPost's leads (2026-10-26). GoPost, LWS's marketing app, collects every
// lead from Instagram, WhatsApp, Facebook, the website and PYQ Vault, and
// serves LWS Pune's at /api/feeds/admissions behind a shared secret. This app
// reads that feed every hour and adds each lead as New, under the same rules
// as a sheet import: one number is one lead, nothing is overwritten, siblings
// are reported. The write is `import_feed_page` (migration 0025), which moves
// the feed's cursor in the same transaction, so a run cut off half way never
// skips a lead or adds one twice.
//
// Plain data in and out. The loop at the bottom takes its database and network
// calls as arguments, so the route and the script share it and it tests
// without either.

import { normalizeMobile } from './mobile'
import { INTERESTS, MAX_NOTE, type Interest } from './leads'

/** One lead as GoPost serves it (its src/lib/domain/admissionsFeed.ts). */
export interface FeedLead {
  cursor: string
  leadAt: string
  name: string | null
  /** +91XXXXXXXXXX */
  mobile: string
  course: string | null
  /** The class they are in now, as GoPost has it: "10", "12 passed"… */
  classLevel: string | null
  channel: string
  page: string | null
  fromAd: boolean
  reason: string | null
}

export interface FeedPage {
  leads: FeedLead[]
  next: string | null
}

/** One lead as `import_feed_page` takes it. */
export interface FeedRow {
  mobile: string
  name: string | null
  stage: null
  interest: Interest | null
  sourceDate: string | null
  notes: string[]
  /** The lead source it is filed under, created on first use. */
  source: string
}

const CHANNEL_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  website: 'Website',
}

const channelLabel = (channel: string) =>
  CHANNEL_LABEL[channel] ?? channel.charAt(0).toUpperCase() + channel.slice(1)

/** "10" → "10th", "12 passed" → "12th passed"; anything else as it is. */
export function classLabel(raw: string | null): string | null {
  const text = raw?.trim()
  if (!text) return null
  const m = /^(\d{1,2})(?=\s|$)(.*)$/.exec(text)
  if (!m) return text
  const n = Number(m[1])
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
  return `${n}${suffix}${m[2]}`
}

/** NDA or SPI when the course names exactly one of them. */
function interestFrom(course: string | null): Interest | null {
  const named = INTERESTS.filter((i) => new RegExp(`\\b${i}\\b`, 'i').test(course ?? ''))
  return named.length === 1 ? named[0]! : null
}

/** The calendar day in India: a lead at 01:30 IST is that day, not the day before. */
function istDate(iso: string): string | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10)
}

/** A GoPost lead as an import row, or null when its number is not an Indian mobile. */
export function toFeedRow(lead: FeedLead): FeedRow | null {
  const mobile = normalizeMobile(lead.mobile)
  if (!mobile) return null
  const where = lead.page?.trim() || `${channelLabel(lead.channel)}${lead.fromAd ? ' ad' : ''}`
  const note = [classLabel(lead.classLevel), lead.course?.trim(), where, lead.reason?.trim()]
    .filter(Boolean)
    .join(' · ')
    .slice(0, MAX_NOTE)
  return {
    mobile,
    name: lead.name?.trim() || null,
    stage: null,
    interest: interestFrom(lead.course),
    sourceDate: istDate(lead.leadAt),
    notes: note ? [note] : [],
    source: `GoPost · ${channelLabel(lead.channel)}`,
  }
}

/** The feed's reply, checked before anything is written. */
export function parseFeedPage(body: unknown): FeedPage {
  const b = body as { leads?: unknown; next?: unknown } | null
  if (!b || !Array.isArray(b.leads) || !(b.next === null || typeof b.next === 'string')) {
    throw new Error('GoPost’s reply is not a page of leads')
  }
  for (const l of b.leads as Partial<FeedLead>[]) {
    if (typeof l?.cursor !== 'string' || typeof l.mobile !== 'string' || typeof l.channel !== 'string' || typeof l.leadAt !== 'string') {
      throw new Error('GoPost’s reply holds a lead without a cursor, number, channel or date')
    }
  }
  return { leads: b.leads as FeedLead[], next: b.next }
}

/** The one line /leads shows a counsellor when the feed is not arriving. */
export function feedWarning(
  feed: { last_synced_at: string | null; last_error: string | null } | null,
  now: number,
): string | null {
  if (feed?.last_error) return `GoPost leads could not be fetched: ${feed.last_error}`
  if (!feed?.last_synced_at) return null
  if (now - Date.parse(feed.last_synced_at) > 3 * 3600_000) return 'GoPost leads have not been fetched for over three hours.'
  return null
}

export interface FeedCounts {
  created: number
  merged: number
  /** Numbers already on more than one lead (siblings). Not written. */
  ambiguous: string[]
}

export interface FeedDeps {
  /** Where the last run stopped. */
  cursor(): Promise<string | null>
  fetchPage(after: string | null): Promise<FeedPage>
  /** Writes the rows and moves the cursor from `from` to `next`, together. */
  importPage(from: string | null, next: string | null, rows: FeedRow[]): Promise<FeedCounts>
  /** What importPage would do, writing nothing. */
  preview(rows: FeedRow[]): Promise<FeedCounts>
  recordError(message: string): Promise<void>
  now(): number
}

export interface SyncResult extends FeedCounts {
  pages: number
  leads: number
  skipped: number
  /** False when time ran out with pages still to read; the next run continues. */
  done: boolean
}

export async function syncFeed(
  deps: FeedDeps,
  { dryRun = false, budgetMs = 45_000 }: { dryRun?: boolean; budgetMs?: number } = {},
): Promise<SyncResult> {
  const result: SyncResult = { pages: 0, leads: 0, skipped: 0, created: 0, merged: 0, ambiguous: [], done: false }
  const start = deps.now()
  try {
    let from = await deps.cursor()
    for (;;) {
      const page = await deps.fetchPage(from)
      const rows = page.leads.map(toFeedRow).filter((r): r is FeedRow => r !== null)
      const counts = dryRun ? await deps.preview(rows) : await deps.importPage(from, page.next, rows)
      result.created += counts.created
      result.merged += counts.merged
      result.ambiguous.push(...counts.ambiguous)
      result.skipped += page.leads.length - rows.length
      if (page.leads.length === 0) {
        result.done = true
        return result
      }
      result.pages++
      result.leads += page.leads.length
      from = page.next
      if (deps.now() - start > budgetMs) return result
    }
  } catch (e) {
    if (!dryRun) await deps.recordError(e instanceof Error ? e.message : String(e))
    throw e
  }
}
