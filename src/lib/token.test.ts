import { describe, it, expect } from 'vitest'
import { generateToken, isValidTokenShape, TOKEN_LENGTH } from './token'

describe('generateToken', () => {
  it('is the declared length', () => {
    expect(generateToken()).toHaveLength(TOKEN_LENGTH)
  })

  it('uses only URL-safe base62 characters', () => {
    for (let n = 0; n < 200; n++) {
      expect(generateToken()).toMatch(/^[0-9A-Za-z]+$/)
    }
  })

  it('does not repeat across many draws', () => {
    // The token is the only thing standing between a stranger and a
    // candidate's test, so collisions and predictability both matter.
    const seen = new Set(Array.from({ length: 5000 }, () => generateToken()))
    expect(seen.size).toBe(5000)
  })

  it('has no obvious positional bias', () => {
    // A modulo-biased generator concentrates early characters; this would
    // catch the crudest version of that.
    const firstChars = new Set(Array.from({ length: 500 }, () => generateToken()[0]))
    expect(firstChars.size).toBeGreaterThan(20)
  })
})

describe('isValidTokenShape', () => {
  it('accepts a generated token', () => {
    expect(isValidTokenShape(generateToken())).toBe(true)
  })

  it('rejects the wrong length', () => {
    expect(isValidTokenShape('abc')).toBe(false)
    expect(isValidTokenShape('a'.repeat(TOKEN_LENGTH + 1))).toBe(false)
  })

  it('rejects characters outside base62 — cheap defence against injection probes', () => {
    expect(isValidTokenShape(`${'a'.repeat(TOKEN_LENGTH - 1)}'`)).toBe(false)
    expect(isValidTokenShape(`${'a'.repeat(TOKEN_LENGTH - 1)}/`)).toBe(false)
    expect(isValidTokenShape(`${'a'.repeat(TOKEN_LENGTH - 1)}%`)).toBe(false)
  })

  it('rejects null-ish input rather than throwing', () => {
    expect(isValidTokenShape(undefined as unknown as string)).toBe(false)
    expect(isValidTokenShape(null as unknown as string)).toBe(false)
    expect(isValidTokenShape(123 as unknown as string)).toBe(false)
  })
})
