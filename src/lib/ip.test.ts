import { describe, it, expect } from 'vitest'
import { parseClientIp } from './ip'

describe('parseClientIp', () => {
  it('accepts a plain IPv4 address', () => {
    expect(parseClientIp('203.0.113.7')).toBe('203.0.113.7')
  })

  it('accepts a plain IPv6 address', () => {
    expect(parseClientIp('2001:db8::1')).toBe('2001:db8::1')
    expect(parseClientIp('::1')).toBe('::1')
  })

  it('takes the FIRST entry of an x-forwarded-for chain — that is the client', () => {
    // Taking the last would record Vercel's proxy and make per-IP limiting useless.
    expect(parseClientIp('203.0.113.7, 70.41.3.18, 150.172.238.178')).toBe('203.0.113.7')
  })

  it('strips a port from an IPv4 address', () => {
    expect(parseClientIp('203.0.113.7:54321')).toBe('203.0.113.7')
  })

  it('strips brackets and port from an IPv6 address', () => {
    expect(parseClientIp('[2001:db8::1]:54321')).toBe('2001:db8::1')
    expect(parseClientIp('[::1]')).toBe('::1')
  })

  it('trims surrounding whitespace', () => {
    expect(parseClientIp('  203.0.113.7  ')).toBe('203.0.113.7')
    expect(parseClientIp('203.0.113.7 ,  70.41.3.18')).toBe('203.0.113.7')
  })

  it('returns null for anything that is not an address', () => {
    // The value lands in a Postgres `inet` column. A malformed one fails the
    // INSERT, and that INSERT is how an attempt starts — so a spoofed header
    // would stop a candidate taking the test at all.
    expect(parseClientIp('garbage')).toBeNull()
    expect(parseClientIp('unknown')).toBeNull()
    expect(parseClientIp("'; drop table attempts;--")).toBeNull()
    expect(parseClientIp('999.999.999.999')).toBeNull()
    expect(parseClientIp('203.0.113')).toBeNull()
    expect(parseClientIp('203.0.113.7.8')).toBeNull()
    expect(parseClientIp('')).toBeNull()
  })

  it('returns null for null-ish input rather than throwing', () => {
    expect(parseClientIp(null)).toBeNull()
    expect(parseClientIp(undefined)).toBeNull()
    expect(parseClientIp(12345 as unknown as string)).toBeNull()
  })

  it('rejects an over-long header instead of trying to parse it', () => {
    expect(parseClientIp('1.2.3.4'.padEnd(5000, ','))).toBeNull()
  })

  it('accepts the IPv4-mapped IPv6 form Vercel sometimes reports', () => {
    expect(parseClientIp('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7')
  })
})
