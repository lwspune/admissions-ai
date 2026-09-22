import { describe, it, expect } from 'vitest'
import { resolveSeedStatus, type ItemStatus } from './items'

// Regression: a plain `npm run items:seed` used to write status='review' on
// every row it upserted, which silently demoted the entire live bank and left
// nothing drawable. Issuing a test in production would have failed with no
// error pointing at the seed. Re-seeding must never take an item out of
// circulation; only an explicit promotion may change status.
describe('resolveSeedStatus', () => {
  it('leaves a live item live when re-seeding without a promotion', () => {
    expect(resolveSeedStatus({ current: 'live', promote: false })).toBe('live')
  })

  it('leaves a retired item retired when re-seeding without a promotion', () => {
    expect(resolveSeedStatus({ current: 'retired', promote: false })).toBe('retired')
  })

  it('starts a brand new item at review', () => {
    expect(resolveSeedStatus({ current: null, promote: false })).toBe('review')
  })

  it('keeps an unreviewed item at review', () => {
    expect(resolveSeedStatus({ current: 'review', promote: false })).toBe('review')
  })

  it('promotes to live only when explicitly asked', () => {
    expect(resolveSeedStatus({ current: 'review', promote: true })).toBe('live')
    expect(resolveSeedStatus({ current: null, promote: true })).toBe('live')
  })

  it('can bring a retired item back, since promotion is a deliberate act', () => {
    expect(resolveSeedStatus({ current: 'retired', promote: true })).toBe('live')
  })

  it('never invents a status outside the database CHECK', () => {
    const allowed: ItemStatus[] = ['review', 'live', 'retired']
    const currents: (ItemStatus | null)[] = ['review', 'live', 'retired', null]
    for (const current of currents) {
      for (const promote of [true, false]) {
        expect(allowed).toContain(resolveSeedStatus({ current, promote }))
      }
    }
  })
})

describe('inPromotionScope', () => {
  it('promotes everything when no batch is named', () => {
    expect(inPromotionScopeHelper('a.json', undefined)).toBe(true)
    expect(inPromotionScopeHelper('b.json', undefined)).toBe(true)
  })

  it('promotes only the named batch', () => {
    expect(inPromotionScopeHelper('legacy-iq-2025.json', 'legacy-iq-2025.json')).toBe(true)
    expect(inPromotionScopeHelper('calibration-batch.json', 'legacy-iq-2025.json')).toBe(false)
  })

  it('accepts the batch name without its extension', () => {
    expect(inPromotionScopeHelper('legacy-iq-2025.json', 'legacy-iq-2025')).toBe(true)
  })
})

// Imported separately so the describe block above reads as behaviour, not plumbing.
import { inPromotionScope as inPromotionScopeHelper } from './items'
