import { describe, it, expect } from 'vitest'
import { normalizeMobile, mobilesMatch } from './mobile'

describe('normalizeMobile', () => {
  it('accepts a plain 10-digit number', () => {
    expect(normalizeMobile('9876543210')).toBe('9876543210')
  })

  it('accepts every valid Indian leading digit', () => {
    for (const d of ['6', '7', '8', '9']) {
      expect(normalizeMobile(`${d}876543210`)).toBe(`${d}876543210`)
    }
  })

  it('strips the +91 country code', () => {
    expect(normalizeMobile('+919876543210')).toBe('9876543210')
    expect(normalizeMobile('919876543210')).toBe('9876543210')
    expect(normalizeMobile('0091 9876543210')).toBe('9876543210')
  })

  it('strips a leading zero', () => {
    expect(normalizeMobile('09876543210')).toBe('9876543210')
  })

  it('strips spaces, dashes, brackets and dots — people paste from contacts', () => {
    expect(normalizeMobile('98765 43210')).toBe('9876543210')
    expect(normalizeMobile('98765-43210')).toBe('9876543210')
    expect(normalizeMobile('(98765) 43210')).toBe('9876543210')
    expect(normalizeMobile('98765.43210')).toBe('9876543210')
    expect(normalizeMobile('  +91 98765 43210  ')).toBe('9876543210')
  })

  it('rejects a number starting below 6 — not a valid Indian mobile', () => {
    expect(normalizeMobile('5876543210')).toBeNull()
    expect(normalizeMobile('1234567890')).toBeNull()
    expect(normalizeMobile('0000000000')).toBeNull()
  })

  it('rejects the wrong number of digits', () => {
    expect(normalizeMobile('987654321')).toBeNull()
    expect(normalizeMobile('98765432101')).toBeNull()
    expect(normalizeMobile('')).toBeNull()
  })

  it('rejects letters and junk', () => {
    expect(normalizeMobile('abcdefghij')).toBeNull()
    expect(normalizeMobile('98765abcde')).toBeNull()
    expect(normalizeMobile('<script>')).toBeNull()
  })

  it('rejects null-ish input rather than throwing', () => {
    // The candidate screen posts whatever is in the box, including nothing.
    expect(normalizeMobile(undefined as unknown as string)).toBeNull()
    expect(normalizeMobile(null as unknown as string)).toBeNull()
    expect(normalizeMobile(12345 as unknown as string)).toBeNull()
  })

  it('does not mistake a 12-digit string for a +91 number unless it starts 91', () => {
    expect(normalizeMobile('229876543210')).toBeNull()
  })
})

describe('mobilesMatch', () => {
  it('matches two spellings of the same number', () => {
    expect(mobilesMatch('+91 98765 43210', '9876543210')).toBe(true)
  })

  it('does not match different numbers', () => {
    expect(mobilesMatch('9876543210', '9876543211')).toBe(false)
  })

  it('never matches when either side is invalid', () => {
    // Two unparseable inputs must not compare equal as null === null.
    expect(mobilesMatch('junk', 'junk')).toBe(false)
    expect(mobilesMatch('', '')).toBe(false)
    expect(mobilesMatch('9876543210', 'junk')).toBe(false)
  })
})
