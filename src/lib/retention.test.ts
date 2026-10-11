import { describe, it, expect } from 'vitest'
import { retentionCutoff, lastActivity, isExpired, RETENTION_MONTHS } from './retention'

const at = (iso: string) => new Date(iso)

describe('retentionCutoff', () => {
  it('is twelve months, which is what the parent consents to', () => {
    expect(RETENTION_MONTHS).toBe(12)
  })

  it('goes back a year on an ordinary date', () => {
    expect(retentionCutoff(at('2026-09-23T10:00:00Z')).toISOString()).toBe('2025-09-23T10:00:00.000Z')
  })

  it('crosses a year boundary', () => {
    expect(retentionCutoff(at('2026-01-15T00:00:00Z')).toISOString()).toBe('2025-01-15T00:00:00.000Z')
  })

  // JS month arithmetic overflows forward: setMonth on the 31st of a short
  // month lands in the NEXT month. Left alone that pushes the cutoff later,
  // which purges records before twelve months have actually elapsed.
  it('clamps to the end of a shorter month rather than overflowing forward', () => {
    // 2028 is a leap year; 2027 is not.
    expect(retentionCutoff(at('2028-02-29T12:00:00Z')).toISOString()).toBe('2027-02-28T12:00:00.000Z')
  })

  it('never returns a cutoff later than twelve months ago', () => {
    for (const iso of ['2026-03-31T00:00:00Z', '2026-05-31T00:00:00Z', '2026-12-31T23:59:59Z']) {
      const now = at(iso)
      const cutoff = retentionCutoff(now)
      const twelveMonthsInDays = 365
      const elapsedDays = (now.getTime() - cutoff.getTime()) / 86_400_000
      expect(elapsedDays).toBeGreaterThanOrEqual(twelveMonthsInDays)
    }
  })

  it('honours a custom period, so the rule can be changed in one place', () => {
    expect(retentionCutoff(at('2026-09-23T00:00:00Z'), 6).toISOString()).toBe('2026-03-23T00:00:00.000Z')
  })
})

describe('lastActivity', () => {
  it('is the lead date when no test was ever issued', () => {
    expect(lastActivity('2025-01-01T00:00:00Z', []).toISOString()).toBe('2025-01-01T00:00:00.000Z')
  })

  // A lead created thirteen months ago who was reissued a test last week is
  // active, not expired. Anchoring on the lead row alone would delete them.
  it('is the newest assessment when one is newer than the lead', () => {
    const got = lastActivity('2025-01-01T00:00:00Z', [
      '2025-02-01T00:00:00Z',
      '2026-09-01T00:00:00Z',
      '2025-06-01T00:00:00Z',
    ])
    expect(got.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })

  it('is the lead date when every assessment is older, which should not happen but must not crash', () => {
    expect(lastActivity('2026-01-01T00:00:00Z', ['2025-01-01T00:00:00Z']).toISOString())
      .toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('isExpired', () => {
  const cutoff = at('2025-09-23T00:00:00Z')

  it('keeps a record dated exactly on the cutoff', () => {
    // The boundary is kept, not purged: deleting on the exact boundary would
    // erase data a day before the promised period is up.
    expect(isExpired(at('2025-09-23T00:00:00Z'), cutoff)).toBe(false)
  })

  it('purges a record older than the cutoff', () => {
    expect(isExpired(at('2025-09-22T23:59:59Z'), cutoff)).toBe(true)
  })

  it('keeps anything newer', () => {
    expect(isExpired(at('2026-01-01T00:00:00Z'), cutoff)).toBe(false)
  })
})
