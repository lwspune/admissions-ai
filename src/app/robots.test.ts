import { describe, it, expect } from 'vitest'
import robots from './robots'

// The homepage is the one page a search engine may read (2026-10-11). The
// candidate route carries minors' data and the console is behind a session,
// so everything else stays disallowed.
describe('robots.txt', () => {
  it('allows the root exactly and disallows everything else', () => {
    const { rules } = robots()
    const rule = Array.isArray(rules) ? rules : [rules]
    expect(rule).toEqual([{ userAgent: '*', allow: '/$', disallow: '/' }])
  })
})
