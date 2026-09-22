// Client IP parsing for the `inet` columns.
//
// The value comes from x-forwarded-for, which a client can set to anything.
// It lands in a Postgres `inet` column, and a malformed value fails the INSERT
// — the same INSERT that starts an attempt. So a candidate (or anyone sending
// a bogus header) could otherwise stop themselves taking the test at all.
//
// Anything that is not unmistakably an address becomes null. The IP is a
// rate-limit input and a forensic hint, never an authorisation decision, so
// losing one is cheap and mis-storing one is not.

/** Longer than any legitimate forwarding chain; beyond this, do not parse. */
const MAX_HEADER = 1024

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

export function parseClientIp(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_HEADER) return null

  // The first entry is the client; every later one is a proxy. Taking the last
  // would record Vercel's edge and make per-IP limiting meaningless.
  let candidate = value.split(',')[0]?.trim() ?? ''
  if (!candidate) return null

  // [2001:db8::1]:443 → 2001:db8::1
  const bracketed = candidate.match(/^\[(.+)\](?::\d+)?$/)
  if (bracketed) candidate = bracketed[1]!

  // 203.0.113.7:54321 → 203.0.113.7. Only ever applied when there is exactly
  // one colon, so a bare IPv6 address is left alone.
  if (candidate.split(':').length === 2 && IPV4.test(candidate.split(':')[0]!)) {
    candidate = candidate.split(':')[0]!
  }

  if (isIpv4(candidate) || isIpv6(candidate)) return candidate
  return null
}

function isIpv4(value: string): boolean {
  const match = value.match(IPV4)
  if (!match) return false
  return match.slice(1).every((octet) => {
    const n = Number(octet)
    // Reject leading zeros too: "010.1.1.1" is ambiguous across parsers.
    return n >= 0 && n <= 255 && String(n) === octet
  })
}

function isIpv6(value: string): boolean {
  if (!value.includes(':')) return false
  if (!/^[0-9A-Fa-f:.]+$/.test(value)) return false

  // At most one "::" compression.
  if (value.split('::').length > 2) return false

  // ::ffff:203.0.113.7 — an IPv4-mapped address, which Vercel sometimes reports.
  const lastPart = value.slice(value.lastIndexOf(':') + 1)
  if (lastPart.includes('.')) {
    if (!isIpv4(lastPart)) return false
    return isIpv6Groups(value.slice(0, value.lastIndexOf(':') + 1) + '0', true)
  }

  return isIpv6Groups(value, false)
}

function isIpv6Groups(value: string, mapped: boolean): boolean {
  const compressed = value.includes('::')
  const groups = value.split(':').filter((g) => g !== '')
  if (groups.some((g) => g.length > 4 || !/^[0-9A-Fa-f]+$/.test(g))) return false

  const max = mapped ? 7 : 8
  return compressed ? groups.length <= max : groups.length === max
}
