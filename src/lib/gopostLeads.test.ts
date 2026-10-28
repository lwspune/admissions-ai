import { describe, it, expect } from 'vitest'
import {
  toFeedRow,
  parseFeedPage,
  feedPageUrl,
  classLabel,
  feedWarning,
  syncFeed,
  type FeedLead,
  type FeedDeps,
  type FeedRow,
  type FeedCounts,
} from './gopostLeads'

// GoPost's leads, read every hour from its admissions feed (2026-10-26). They
// arrive New, with GoPost's channel as their source and what GoPost knew as
// one note line of plain values.

const lead = (over: Partial<FeedLead> = {}): FeedLead => ({
  cursor: '2026-10-26T06:30:00.123456+00:00~11111111-1111-4111-8111-111111111111',
  leadAt: '2026-10-20T10:00:00+00:00',
  name: 'Test Student',
  mobile: '+919800000001',
  course: 'NDA',
  classLevel: '12 passed',
  channel: 'instagram',
  page: null,
  fromAd: true,
  reason: 'Shared a phone number',
  ...over,
})

describe('a GoPost lead as an import row', () => {
  it('carries the number, name, interest, date, source and one plain note', () => {
    expect(toFeedRow(lead())).toEqual({
      mobile: '9800000001',
      name: 'Test Student',
      stage: null,
      interest: 'NDA',
      sourceDate: '2026-10-20',
      notes: ['12th passed · NDA · Instagram ad · Shared a phone number'],
      source: 'Instagram',
    })
  })

  it('dates a lead by the day in India, not in UTC', () => {
    expect(toFeedRow(lead({ leadAt: '2026-10-20T20:00:00+00:00' }))!.sourceDate).toBe('2026-10-21')
  })

  it('sets the interest only when the course names exactly one of NDA and SPI', () => {
    const interest = (course: string | null) => toFeedRow(lead({ course }))!.interest
    expect(interest('NDA, CDS, AFCAT')).toBe('NDA')
    expect(interest('SPI')).toBe('SPI')
    expect(interest('NDA and SPI')).toBeNull()
    expect(interest('CDS')).toBeNull()
    expect(interest('Sainik school')).toBeNull()
    expect(interest(null)).toBeNull()
  })

  it('names where a website lead came from by its page, and leaves out what GoPost did not know', () => {
    const row = toFeedRow(lead({ channel: 'website', page: 'PYQ Vault · quiz', fromAd: false, classLevel: null, course: null, reason: null }))!
    expect(row.notes).toEqual(['PYQ Vault · quiz'])
    expect(row.source).toBe('Website')
  })

  it('names the source by its channel alone, as staff know it (2026-10-26)', () => {
    const source = (channel: string) => toFeedRow(lead({ channel }))!.source
    expect(source('whatsapp')).toBe('WhatsApp')
    expect(source('facebook')).toBe('Facebook')
    expect(source('telegram')).toBe('Telegram')
  })

  it('skips a number that is not an Indian mobile', () => {
    expect(toFeedRow(lead({ mobile: '+447700900001' }))).toBeNull()
    expect(toFeedRow(lead({ mobile: '+915800000001' }))).toBeNull()
  })

  it('keeps a note within the history line limit', () => {
    expect(toFeedRow(lead({ reason: 'x'.repeat(5000) }))!.notes[0]!.length).toBeLessThanOrEqual(2000)
  })
})

describe('the class, as the note shows it', () => {
  it('writes the class as an ordinal and keeps the rest', () => {
    expect(classLabel('10')).toBe('10th')
    expect(classLabel('12 passed')).toBe('12th passed')
    expect(classLabel('12th')).toBe('12th')
    expect(classLabel('11')).toBe('11th')
    expect(classLabel('Graduate')).toBe('Graduate')
    expect(classLabel(null)).toBeNull()
  })
})

describe('a page from the feed', () => {
  it('accepts a page of leads and its next cursor', () => {
    expect(parseFeedPage({ leads: [lead()], next: 'c' })).toEqual({ leads: [lead()], next: 'c' })
    expect(parseFeedPage({ leads: [], next: null })).toEqual({ leads: [], next: null })
  })

  it('refuses anything else, rather than importing a half-understood page', () => {
    for (const body of [null, {}, { leads: 'x', next: null }, { leads: [], next: 3 }, { leads: [{ cursor: 'c' }], next: 'c' }]) {
      expect(() => parseFeedPage(body)).toThrow()
    }
  })
})

describe('asking for a page', () => {
  const FEED = 'https://gopost.example/api/feeds/admissions'

  // On 2026-10-26 GoPost answered limit=500 with an empty page past 2,579 leads,
  // which the sync took for "nothing new" for a day; 499 and below were whole.
  it('asks for fewer than 500 leads at a time', () => {
    const limit = Number(new URL(feedPageUrl(FEED, null)).searchParams.get('limit'))
    expect(limit).toBeGreaterThan(0)
    expect(limit).toBeLessThan(500)
  })

  it('starts from the cursor, encoded, and from the top without one', () => {
    const cursor = '2026-10-26T00:26:09.26947+00:00~fe695154-a8f4-4eb8-b56f-a3a348dfcd1d'
    expect(new URL(feedPageUrl(FEED, cursor)).searchParams.get('after')).toBe(cursor)
    expect(new URL(feedPageUrl(FEED, null)).searchParams.has('after')).toBe(false)
  })

  it('asks for a smaller page when told to', () => {
    expect(new URL(feedPageUrl(FEED, null, 1)).searchParams.get('limit')).toBe('1')
  })
})

describe('the warning on the lead list', () => {
  const now = Date.parse('2026-10-26T12:00:00Z')

  it('says nothing while the feed is healthy or has never run', () => {
    expect(feedWarning({ last_synced_at: '2026-10-26T11:45:00Z', last_error: null }, now)).toBeNull()
    expect(feedWarning({ last_synced_at: null, last_error: null }, now)).toBeNull()
    expect(feedWarning(null, now)).toBeNull()
  })

  it('shows the last error, even when no run has ever succeeded', () => {
    expect(feedWarning({ last_synced_at: '2026-10-26T11:45:00Z', last_error: 'GoPost answered 401' }, now)).toMatch(
      /GoPost answered 401/,
    )
    expect(feedWarning({ last_synced_at: null, last_error: 'GoPost answered 401' }, now)).toMatch(/GoPost answered 401/)
  })

  it('says so when no sync has run for three hours', () => {
    expect(feedWarning({ last_synced_at: '2026-10-26T08:30:00Z', last_error: null }, now)).toMatch(/GoPost/)
  })
})

describe('a sync', () => {
  // A fake GoPost with these pages, and a fake database that records each call.
  // `brokenAbove`: GoPost answers any larger page empty, as it did at 500 on
  // 2026-10-26 and at 100 and 200 on 2026-10-28 while 27 leads waited.
  function fake(pages: FeedLead[][], opts: { failOn?: number; brokenAbove?: number } = {}) {
    const calls: { kind: string; from?: string | null; next?: string | null; rows?: FeedRow[] }[] = []
    const asked: number[] = []
    let stored: string | null = null
    let clock = 0
    const counts = (rows: FeedRow[]): FeedCounts => ({ created: rows.length, merged: 0, ambiguous: [] })
    const deps: FeedDeps = {
      cursor: async () => stored,
      fetchPage: async (after, limit) => {
        asked.push(limit)
        const i = after === null ? 0 : Number(after.split('#')[1]) + 1
        if (opts.failOn === i) throw new Error('GoPost answered 500')
        if (opts.brokenAbove !== undefined && limit > opts.brokenAbove) return { leads: [], next: after }
        const leads = (pages[i] ?? []).slice(0, limit).map((l, j) => ({ ...l, cursor: `p#${i}#${j}` }))
        return { leads, next: leads.length ? `p#${i}` : after }
      },
      importPage: async (from, next, rows) => {
        calls.push({ kind: 'import', from, next, rows })
        stored = next
        return counts(rows)
      },
      preview: async (rows) => {
        calls.push({ kind: 'preview', rows })
        return counts(rows)
      },
      recordError: async (message) => {
        calls.push({ kind: 'error', next: message })
      },
      now: () => (clock += 1000),
    }
    return { deps, calls, asked }
  }

  it('imports page after page, each with the cursor it started from, until nothing is new', async () => {
    const { deps, calls } = fake([[lead(), lead({ mobile: '+919800000002' })], [lead({ mobile: '+919800000003' })]])
    const result = await syncFeed(deps)
    expect(result).toMatchObject({ pages: 2, leads: 3, created: 3, merged: 0, skipped: 0, done: true })
    expect(calls.map((c) => [c.kind, c.from, c.next, c.rows?.length])).toEqual([
      ['import', null, 'p#0', 2],
      ['import', 'p#0', 'p#1', 1],
      ['import', 'p#1', 'p#1', 0], // nothing new: still marks the feed as synced
    ])
  })

  it('counts a lead it cannot use as skipped and still moves past it', async () => {
    const { deps, calls } = fake([[lead({ mobile: '+447700900001' }), lead()]])
    const result = await syncFeed(deps)
    expect(result).toMatchObject({ leads: 2, created: 1, skipped: 1 })
    expect(calls[0]).toMatchObject({ next: 'p#0' })
  })

  it('writes nothing on a dry run, and still reads every page', async () => {
    const { deps, calls } = fake([[lead()], [lead({ mobile: '+919800000002' })]])
    const result = await syncFeed(deps, { dryRun: true })
    expect(result).toMatchObject({ pages: 2, created: 2, done: true })
    expect(calls.every((c) => c.kind === 'preview')).toBe(true)
  })

  it('stops between pages when its time is up, leaving the rest for the next run', async () => {
    const { deps, calls } = fake([[lead()], [lead({ mobile: '+919800000002' })], [lead({ mobile: '+919800000003' })]])
    // The fake clock moves a second each time it is read: once at the start, once after each page.
    const result = await syncFeed(deps, { budgetMs: 1500 })
    expect(result.done).toBe(false)
    expect(calls.filter((c) => c.kind === 'import').map((c) => c.next)).toEqual(['p#0', 'p#1'])
  })

  it('records a failure on the feed and reports it', async () => {
    const { deps, calls } = fake([[lead()], [lead({ mobile: '+919800000002' })]], { failOn: 1 })
    await expect(syncFeed(deps)).rejects.toThrow('GoPost answered 500')
    expect(calls.map((c) => c.kind)).toEqual(['import', 'error'])
  })

  it('checks an empty page with a one-lead ask before calling the feed quiet', async () => {
    const { deps, calls, asked } = fake([])
    const result = await syncFeed(deps)
    expect(result).toMatchObject({ created: 0, done: true, narrowed: false })
    expect(asked.at(-1)).toBe(1)
    expect(calls.map((c) => c.kind)).toEqual(['import'])
  })

  it('reads on in smaller pages when GoPost answers a full page empty with leads waiting', async () => {
    const { deps, calls } = fake([[lead(), lead({ mobile: '+919800000002' })], [lead({ mobile: '+919800000003' })]], {
      brokenAbove: 30,
    })
    const result = await syncFeed(deps)
    expect(result).toMatchObject({ pages: 2, created: 3, done: true, narrowed: true })
    expect(calls.map((c) => c.kind)).not.toContain('error')
  })

  it('records an error when GoPost hides waiting leads even from a small page', async () => {
    const { deps, calls } = fake([[lead()]], { brokenAbove: 10 })
    await expect(syncFeed(deps)).rejects.toThrow(/empty page/)
    expect(calls.map((c) => c.kind)).toEqual(['error'])
  })
})
