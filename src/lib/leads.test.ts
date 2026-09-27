import { describe, it, expect } from 'vitest'
import {
  stageFromStatus,
  parseInterest,
  parseSourceDate,
  guessColumnMap,
  prepareImport,
  formatStageChange,
  isStage,
  MAX_NOTE,
  parseLeadFilters,
  searchTerm,
  testStatus,
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
    expect(stageFromStatus('Qualified')).toBe('qualified')
    expect(stageFromStatus('In EIS')).toBe('in_eis')
    expect(stageFromStatus('Not interested')).toBe('not_interested')
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

  it('reads every filter from the query string', () => {
    expect(
      parseLeadFilters({ q: ' Adhe ', stage: 'cnr', interest: 'SPI', source: ID, assignee: 'none', page: '3' }),
    ).toEqual({ q: 'Adhe', stage: 'cnr', interest: 'SPI', source: ID, assignee: 'none', page: 3 })
  })

  it('drops anything it does not recognise instead of passing it to the query', () => {
    expect(
      parseLeadFilters({ stage: 'closed', interest: 'JEE', source: 'x); drop', assignee: 'bob', page: '-2' }),
    ).toEqual({ q: '', stage: null, interest: null, source: null, assignee: null, page: 1 })
  })

  it('takes the first value when a parameter repeats', () => {
    expect(parseLeadFilters({ stage: ['new', 'cnr'] }).stage).toBe('new')
  })

  it('accepts "me" and a staff id as the assignee', () => {
    expect(parseLeadFilters({ assignee: 'me' }).assignee).toBe('me')
    expect(parseLeadFilters({ assignee: ID }).assignee).toBe(ID)
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
})
