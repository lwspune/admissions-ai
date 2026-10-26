import { describe, it, expect } from 'vitest'
import {
  stageFromStatus,
  parseInterest,
  parseSourceDate,
  guessColumnMap,
  prepareImport,
  formatStageChange,
  isStage,
  STAGES,
  STAGE_TONE,
  COLUMN_TITLE,
  NEXT_STAGE,
  enquiryLabel,
  MAX_NOTE,
  parseLeadFilters,
  leadsHref,
  summaryHref,
  summaryBackHref,
  searchTerm,
  testStatus,
  testAction,
} from './leads'

describe('stageFromStatus', () => {
  it('maps the sheet’s two statuses, ignoring case and the trailing space it carries', () => {
    expect(stageFromStatus('CONNECTED ')).toBe('contacted')
    expect(stageFromStatus('NOT CONNECTED')).toBe('cnr')
    expect(stageFromStatus('not  connected')).toBe('cnr')
  })

  it('does not read NOT CONNECTED as CONNECTED', () => {
    expect(stageFromStatus('Not Connected')).not.toBe('contacted')
  })

  it('maps the usual words for an unanswered call to CNR', () => {
    for (const s of ['CNR', 'call not received', 'Not received', 'switched off', 'not reachable']) {
      expect(stageFromStatus(s)).toBe('cnr')
    }
  })

  it('maps our own stage labels back, so an exported list re-imports', () => {
    expect(stageFromStatus('In EIS')).toBe('in_eis')
    expect(stageFromStatus('Not interested')).toBe('not_interested')
  })

  it('reads "Qualified" as In EIS, which it became on 2026-10-26', () => {
    expect(stageFromStatus('Qualified')).toBe('in_eis')
  })

  it('returns null for blank or unknown text rather than guessing', () => {
    expect(stageFromStatus('')).toBeNull()
    expect(stageFromStatus('   ')).toBeNull()
    expect(stageFromStatus('will call later')).toBeNull()
  })
})

describe('parseInterest', () => {
  it('reads NDA and SPI in any case', () => {
    expect(parseInterest('NDA')).toBe('NDA')
    expect(parseInterest(' spi ')).toBe('SPI')
  })

  it('returns null for anything else', () => {
    expect(parseInterest('')).toBeNull()
    expect(parseInterest('JEE')).toBeNull()
  })
})

describe('parseSourceDate', () => {
  it('reads day/month/year, the Indian order', () => {
    expect(parseSourceDate('03/01/25')).toBe('2025-01-03')
    expect(parseSourceDate('3/2/2025')).toBe('2025-02-03')
    expect(parseSourceDate('31-12-2025')).toBe('2025-12-31')
  })

  it('reads an ISO date', () => {
    expect(parseSourceDate('2025-01-03')).toBe('2025-01-03')
  })

  it('refuses a date that does not exist rather than rolling it over', () => {
    expect(parseSourceDate('31/02/25')).toBeNull()
    expect(parseSourceDate('00/01/25')).toBeNull()
    expect(parseSourceDate('12/13/25')).toBeNull()
  })

  it('returns null for blank or free text', () => {
    expect(parseSourceDate('')).toBeNull()
    expect(parseSourceDate('last week')).toBeNull()
  })
})

describe('guessColumnMap', () => {
  it('matches the WhatsApp sheet’s headers', () => {
    expect(guessColumnMap(['NAME', 'CONTACT', 'STATUS', 'Choice', 'REMARK', 'DATE'])).toEqual({
      name: 'NAME',
      mobile: 'CONTACT',
      status: 'STATUS',
      interest: 'Choice',
      remark: 'REMARK',
      date: 'DATE',
    })
  })

  it('matches common alternatives', () => {
    expect(guessColumnMap(['Student Name', 'Phone Number', 'Course', 'Comments'])).toEqual({
      name: 'Student Name',
      mobile: 'Phone Number',
      interest: 'Course',
      remark: 'Comments',
    })
  })

  it('leaves out a field it cannot find', () => {
    expect(guessColumnMap(['foo', 'bar'])).toEqual({})
  })
})

const HEADER = ['NAME', 'CONTACT', 'STATUS', 'Choice', 'REMARK', 'DATE']
const MAP = { name: 'NAME', mobile: 'CONTACT', status: 'STATUS', interest: 'Choice', remark: 'REMARK', date: 'DATE' }

describe('prepareImport', () => {
  it('turns a sheet row into an import row', () => {
    const { rows, skipped } = prepareImport(
      [HEADER, ['Sanjay  Adhe ', '9284825042', 'CONNECTED ', 'NDA', 'Will talk to his son', '03/01/25']],
      MAP,
    )
    expect(skipped).toEqual([])
    expect(rows).toEqual([
      {
        mobile: '9284825042',
        name: 'Sanjay Adhe',
        stage: 'contacted',
        interest: 'NDA',
        sourceDate: '2025-01-03',
        notes: ['Will talk to his son'],
        sheetRows: [2],
      },
    ])
  })

  it('normalises the mobile the same way the lead form does', () => {
    const { rows } = prepareImport([HEADER, ['A', '+91 98765 43210', '', '', '', '']], MAP)
    expect(rows[0]!.mobile).toBe('9876543210')
  })

  it('keeps a lead with no name — the name is optional until a test is issued', () => {
    const { rows } = prepareImport([HEADER, ['', '9021231794', 'NOT CONNECTED', '', 'Not Received', '']], MAP)
    expect(rows[0]!.name).toBeNull()
    expect(rows[0]!.stage).toBe('cnr')
  })

  it('skips a row with no number, and one with a number that is not a mobile, saying which', () => {
    const { rows, skipped } = prepareImport(
      [HEADER, ['S. Shingre', '', '', '', '', ''], ['Landline', '0202567890', '', '', '', '']],
      MAP,
    )
    expect(rows).toEqual([])
    expect(skipped).toEqual([
      { sheetRow: 2, name: 'S. Shingre', mobile: '', reason: 'no_mobile' },
      { sheetRow: 3, name: 'Landline', mobile: '0202567890', reason: 'invalid_mobile' },
    ])
  })

  it('ignores completely blank rows without reporting them', () => {
    const { rows, skipped } = prepareImport([HEADER, ['', '', '', '', '', ''], ['A', '9876543210', '', '', '', '']], MAP)
    expect(skipped).toEqual([])
    expect(rows[0]!.sheetRows).toEqual([3])
  })

  it('merges two rows for one number into one lead, keeping both remarks in order', () => {
    const { rows } = prepareImport(
      [
        HEADER,
        ['', '9403446780', 'NOT CONNECTED', '', 'call not connected', ''],
        ['S. Shingre', '9403446780', 'CONNECTED', 'SPI', 'will think', '03/02/25'],
      ],
      MAP,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: 'S. Shingre',
      interest: 'SPI',
      stage: 'contacted',
      sourceDate: '2025-02-03',
      notes: ['call not connected', 'will think'],
      sheetRows: [2, 3],
    })
  })

  it('keeps a status or interest it does not recognise as a note, rather than losing it', () => {
    const { rows } = prepareImport([HEADER, ['A', '9876543210', 'BUSY', 'JEE', 'call later', '']], MAP)
    expect(rows[0]!.stage).toBeNull()
    expect(rows[0]!.interest).toBeNull()
    expect(rows[0]!.notes).toEqual(['call later · Status in source: BUSY · Choice in source: JEE'])
  })

  it('caps a note at the database limit', () => {
    const long = 'x'.repeat(MAX_NOTE + 50)
    const { rows } = prepareImport([HEADER, ['A', '9876543210', '', '', long, '']], MAP)
    expect(rows[0]!.notes[0]).toHaveLength(MAX_NOTE)
  })

  it('works with only the mobile mapped', () => {
    const { rows } = prepareImport([['Phone'], ['9876543210']], { mobile: 'Phone' })
    expect(rows[0]).toMatchObject({ mobile: '9876543210', name: null, stage: null, notes: [] })
  })

  it('refuses a map without a mobile column', () => {
    expect(() => prepareImport([HEADER], { name: 'NAME' })).toThrow(/mobile/i)
  })

  it('refuses a map naming a column the file does not have', () => {
    expect(() => prepareImport([HEADER], { mobile: 'PHONE' })).toThrow(/PHONE/)
  })

  it('refuses a file with no header row', () => {
    expect(() => prepareImport([], { mobile: 'PHONE' })).toThrow(/empty/i)
  })
})

describe('parseLeadFilters', () => {
  const ID = '0b6f3c1e-8a2d-4c55-9f1e-2d3c4b5a6f70'

  it('reads every filter, the stage the pipeline shows, and the page', () => {
    expect(
      parseLeadFilters({ q: ' Adhe ', interest: 'SPI', source: ID, assignee: 'none', stage: 'cnr', page: '3' }),
    ).toEqual({ q: 'Adhe', interest: 'SPI', source: ID, assignee: 'none', stage: 'cnr', page: 3 })
  })

  it('opens on New leads, page one', () => {
    expect(parseLeadFilters({})).toMatchObject({ stage: 'new', page: 1 })
  })

  it('drops anything it does not recognise instead of passing it to the query', () => {
    expect(
      parseLeadFilters({ interest: 'JEE', source: 'x); drop', assignee: 'bob', stage: 'qualified', page: '-2' }),
    ).toEqual({ q: '', interest: null, source: null, assignee: null, stage: 'new', page: 1 })
  })

  it('takes the first value when a parameter repeats', () => {
    expect(parseLeadFilters({ stage: ['contacted', 'cnr'] }).stage).toBe('contacted')
  })

  it('accepts "me" and a staff id as the assignee', () => {
    expect(parseLeadFilters({ assignee: 'me' }).assignee).toBe('me')
    expect(parseLeadFilters({ assignee: ID }).assignee).toBe(ID)
  })
})

describe('leadsHref', () => {
  const ID = '0b6f3c1e-8a2d-4c55-9f1e-2d3c4b5a6f70'
  const none = parseLeadFilters({})

  it('is the bare list with no filters', () => {
    expect(leadsHref(none)).toBe('/leads')
  })

  it('writes back what parseLeadFilters reads', () => {
    const filters = parseLeadFilters({ q: 'Adhe Rao', interest: 'SPI', source: ID, assignee: 'me', stage: 'cnr', page: '3' })
    const query = leadsHref(filters).split('?')[1]
    expect(parseLeadFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(filters)
  })

  it('switches stage from the pipeline, keeping the filters and starting at page one', () => {
    expect(leadsHref(parseLeadFilters({ q: 'Rao', page: '4' }), { stage: 'contacted' })).toBe('/leads?q=Rao&stage=contacted')
    expect(leadsHref(parseLeadFilters({ stage: 'cnr' }), { stage: 'new' })).toBe('/leads')
  })

  it('turns the page within a stage', () => {
    expect(leadsHref(parseLeadFilters({ stage: 'cnr', page: '2' }), { page: 3 })).toBe('/leads?stage=cnr&page=3')
    expect(leadsHref(parseLeadFilters({ page: '2' }), { page: 1 })).toBe('/leads')
  })
})

describe('the next stage', () => {
  it('is the owner’s usual next step, and none from an outcome', () => {
    expect(NEXT_STAGE).toEqual({ new: 'contacted', cnr: 'contacted', contacted: 'in_eis', in_eis: null, not_interested: null })
  })
})

describe('the score sheet goes back to the list it was opened from', () => {
  const LEAD = '6b7d8c18-3af7-47fc-9ca4-3ca24eb78adb'

  it('carries the list filters to the sheet and back', () => {
    const filters = parseLeadFilters({ q: 'Sonakshi', stage: 'contacted', page: '2' })
    const href = summaryHref(LEAD, filters)
    expect(href.startsWith(`/reports/${LEAD}/summary?back=`)).toBe(true)
    const back = new URL(href, 'https://x.test').searchParams.get('back')
    expect(summaryBackHref(back)).toBe(leadsHref(filters))
  })

  it('opens the sheet plainly from an unfiltered list', () => {
    expect(summaryHref(LEAD, parseLeadFilters({}))).toBe(`/reports/${LEAD}/summary`)
  })

  it('falls back to the list when there is nothing to go back to', () => {
    expect(summaryBackHref(null)).toBe('/leads')
    expect(summaryBackHref(undefined)).toBe('/leads')
    expect(summaryBackHref('')).toBe('/leads')
  })

  it('only ever leads to the list, whatever the address says', () => {
    for (const back of ['https://evil.test/leads', '//evil.test', '/staff', 'javascript:alert(1)', 'stage=closed&x=1']) {
      expect(summaryBackHref(back)).toBe('/leads')
    }
  })
})

describe('searchTerm', () => {
  it('searches the mobile when the text is a number', () => {
    expect(searchTerm('98765 43')).toEqual({ column: 'contact_mobile', pattern: '%9876543%' })
  })

  it('searches the name otherwise, with LIKE wildcards escaped', () => {
    expect(searchTerm('Adhe')).toEqual({ column: 'name', pattern: '%Adhe%' })
    expect(searchTerm('50%_off')).toEqual({ column: 'name', pattern: '%50\\%\\_off%' })
  })

  it('returns null for nothing to search', () => {
    expect(searchTerm('   ')).toBeNull()
  })
})

describe('testStatus', () => {
  const a = (state: string, seq = 1) => ({ state, issue_seq: seq, expires_at: '2026-09-28T10:00:00Z' })

  it('says so when no test has been issued', () => {
    expect(testStatus([])).toBe('No test')
  })

  it('says completed once any issue was submitted', () => {
    expect(testStatus([a('voided', 1), a('submitted', 2)])).toBe('Test completed')
  })

  it('shows the live issue’s state and its number', () => {
    expect(testStatus([a('voided', 1), a('opened', 2)])).toBe('Link opened · issue 2 of 3')
  })

  it('shows the latest issue when none is live', () => {
    expect(testStatus([a('expired', 1)])).toBe('Expired · issue 1 of 3')
  })

  it('says a paper test is on paper, since no link was sent', () => {
    expect(testStatus([{ ...a('issued', 1), mode: 'paper' }])).toBe('Paper test issued · issue 1 of 3')
    expect(testStatus([{ ...a('issued', 1), mode: 'online' }])).toBe('Link sent · issue 1 of 3')
  })
})

describe('testAction', () => {
  const a = (state: string, seq = 1) => ({ state, issue_seq: seq })

  it('offers a first link when no test has been issued', () => {
    expect(testAction([])).toBe('issue')
  })

  it('offers the report once any issue was submitted', () => {
    expect(testAction([a('voided', 1), a('submitted', 2)])).toBe('report')
  })

  it('offers a reissue while links remain, whatever became of the last one', () => {
    expect(testAction([a('opened', 1)])).toBe('reissue')
    expect(testAction([a('voided', 1), a('started', 2)])).toBe('reissue')
    expect(testAction([a('expired', 1)])).toBe('reissue')
  })

  it('offers nothing once the third link is used and nothing was submitted', () => {
    expect(testAction([a('voided', 1), a('voided', 2), a('opened', 3)])).toBeNull()
  })
})

describe('stages', () => {
  it('knows its own stages and nothing else', () => {
    expect(isStage('cnr')).toBe(true)
    expect(isStage('CNR')).toBe(false)
    expect(isStage('closed')).toBe(false)
  })

  it('renders a stage change stored by the database as words', () => {
    expect(formatStageChange('new → cnr')).toBe('Stage: New → CNR')
    expect(formatStageChange('contacted → in_eis')).toBe('Stage: Contacted → In EIS')
  })

  it('shows an unrecognised stage change as stored rather than hiding it', () => {
    expect(formatStageChange('garbled')).toBe('Stage: garbled')
  })

  it('gives every stage a badge tone, so a new stage cannot render unstyled', () => {
    for (const s of STAGES) expect(STAGE_TONE[s]).toBeTruthy()
  })

  it('reads the two outcomes as outcomes and an unanswered call as needing another', () => {
    expect(STAGE_TONE.in_eis).toBe('success')
    expect(STAGE_TONE.not_interested).toBe('danger')
    expect(STAGE_TONE.cnr).toBe('warning')
    expect(STAGE_TONE.new).toBe('neutral')
  })

  it('runs the board in the owner’s order, five columns and no Qualified', () => {
    expect(STAGES).toEqual(['new', 'cnr', 'contacted', 'in_eis', 'not_interested'])
    expect(isStage('qualified')).toBe(false)
    expect(STAGES.map((s) => COLUMN_TITLE[s])).toEqual(['New leads', 'CNR', 'Contacted', 'In EIS', 'Not interested'])
  })
})

describe('the date on a lead’s row', () => {
  it('says when the person enquired, or when a hand-added lead was typed in', () => {
    expect(enquiryLabel('2026-10-25', true, 2026)).toBe('Enquired 25 Oct')
    expect(enquiryLabel('2026-10-22', false, 2026)).toBe('Added 22 Oct')
  })

  it('names the year only when it is not this one', () => {
    expect(enquiryLabel('2025-05-21', true, 2026)).toBe('Enquired 21 May 2025')
    expect(enquiryLabel('2026-01-03', true, 2026)).toBe('Enquired 3 Jan')
  })

  it('shows the date as stored, whatever the server’s time zone', () => {
    expect(enquiryLabel('2026-03-01', true, 2026)).toBe('Enquired 1 Mar')
  })
})
