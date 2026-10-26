import { describe, it, expect } from 'vitest'
import { leadsCsv, exportFilename, downloadStamp, handleLeadExport, type ExportRow, type ExportDeps } from './leadExport'

// "Download for Excel" on /leads (2026-10-26), after GoPost's: everything in
// the stage on screen, or only what reached the app since your last download
// of that stage. Counsellors and superadmin only.

const row = (over: Partial<ExportRow> = {}): ExportRow => ({
  name: 'Ansh Rajpoot',
  mobile: '9258874963',
  interest: 'NDA',
  classLevel: 11,
  stage: 'new',
  sources: ['Website'],
  enquiredOn: '2026-10-25',
  assignedTo: 'Unassigned',
  test: 'No test',
  ...over,
})

describe('the CSV', () => {
  it('has a header and one line per lead, ready for Excel', () => {
    const csv = leadsCsv([row()])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('Name,Mobile,Interest,Admission class,Stage,Source,Enquired,Assigned to,Test')
    expect(lines[1]).toBe('Ansh Rajpoot,92588 74963,NDA,11,New,Website,2026-10-25,Unassigned,No test')
  })

  it('writes a mobile with a space, so Excel keeps it as text', () => {
    expect(leadsCsv([row()])).toContain('92588 74963')
  })

  it('keeps a cell from running as a formula, and quotes commas and quotes', () => {
    const csv = leadsCsv([row({ name: '=HYPERLINK("x")', sources: ['Website', 'WhatsApp'] })])
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`)
    expect(csv).toContain('"Website, WhatsApp"')
  })

  it('keeps names in any script, and leaves blanks blank', () => {
    const csv = leadsCsv([row({ name: 'अधुरं प्रेम', interest: null, classLevel: null })])
    expect(csv).toContain('अधुरं प्रेम,92588 74963,,,New')
  })
})

describe('the file name', () => {
  it('says what is in it and when, in India', () => {
    expect(exportFilename('all', 'new', '2026-10-26T19:00:00Z')).toBe('leads-new-leads-all-2026-10-27.csv')
    expect(exportFilename('new', 'not_interested', '2026-10-26T10:00:00Z')).toBe('leads-not-interested-new-2026-10-26.csv')
  })
})

describe('a download', () => {
  const AT = '2026-10-26T12:00:00.000Z'
  function fake(over: Partial<ExportDeps> = {}) {
    const calls: { load?: { since: string | null; until: string }; record?: unknown } = {}
    const deps: ExportDeps = {
      mayDownload: async () => true,
      lastDownload: async () => '2026-10-26T09:00:00.000Z',
      load: async (window) => {
        calls.load = window
        return [row()]
      },
      record: async (d) => {
        calls.record = d
      },
      now: () => new Date(AT),
      logger: { error: () => {} },
      ...over,
    }
    return { deps, calls }
  }
  const post = (kind: string, origin = 'https://app.test') =>
    new Request('https://app.test/leads/export', {
      method: 'POST',
      headers: { origin },
      body: new URLSearchParams({ kind, stage: 'new' }),
    })

  it('gives everything in the stage, and moves the download point after building the file', async () => {
    const { deps, calls } = fake()
    const res = await handleLeadExport(post('all'), deps)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toContain('leads-new-leads-all-2026-10-26.csv')
    expect(calls.load).toEqual({ since: null, until: AT })
    expect(calls.record).toEqual({ kind: 'all', stage: 'new', count: 1, since: null, at: AT })
  })

  it('gives only what arrived since your last download of the stage', async () => {
    const { deps, calls } = fake()
    await handleLeadExport(post('new'), deps)
    expect(calls.load).toEqual({ since: '2026-10-26T09:00:00.000Z', until: AT })
  })

  it('still gives the file when saving the download point fails', async () => {
    const { deps } = fake({ record: async () => Promise.reject(new Error('down')) })
    const res = await handleLeadExport(post('all'), deps)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('Ansh Rajpoot')
  })

  it('refuses a telecaller, another site, and anything but all or new', async () => {
    expect((await handleLeadExport(post('all'), fake({ mayDownload: async () => false }).deps)).status).toBe(403)
    expect((await handleLeadExport(post('all', 'https://evil.test'), fake().deps)).status).toBe(403)
    expect((await handleLeadExport(post('everything'), fake().deps)).status).toBe(400)
  })
})

describe('the last download, as the menu says it', () => {
  it('is the day and time in India, in 12-hour time', () => {
    expect(downloadStamp('2026-10-26T12:40:00Z')).toBe('26 Oct, 6:10 pm')
    expect(downloadStamp('2026-10-26T19:05:00Z')).toBe('27 Oct, 12:35 am')
    expect(downloadStamp('2026-10-26T06:30:00Z')).toBe('26 Oct, 12:00 pm')
  })
})
