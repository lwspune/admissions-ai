import { describe, it, expect } from 'vitest'
import { bearerMatches } from './bearer'

// The check behind every route that opens without a session and guards
// itself: the purge and the GoPost sync.

describe('bearerMatches', () => {
  it('lets in the bearer of the secret only', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true)
    expect(bearerMatches('Bearer s3creT', 's3cret')).toBe(false)
    expect(bearerMatches('Bearer s3cret-and-more', 's3cret')).toBe(false)
    expect(bearerMatches('s3cret', 's3cret')).toBe(false)
    expect(bearerMatches(null, 's3cret')).toBe(false)
  })

  it('stays closed when no secret is configured', () => {
    expect(bearerMatches('Bearer ', '')).toBe(false)
    expect(bearerMatches('Bearer anything', undefined)).toBe(false)
  })
})
