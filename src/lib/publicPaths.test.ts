import { describe, it, expect } from 'vitest'
import { isPublicPath } from './publicPaths'

describe('isPublicPath', () => {
  it('opens the homepage, and only the homepage, at the root', () => {
    expect(isPublicPath('/')).toBe(true)
  })

  // The root is a prefix of every path. Were it matched like the others, the
  // whole staff console would open without a session.
  it.each(['/leads', '/leads/import', '/reports/abc', '/items', '/staff', '/messages', '/downloads'])(
    'keeps %s behind a session',
    (path) => {
      expect(isPublicPath(path)).toBe(false)
    },
  )

  it.each(['/login', '/t/abc123', '/api/t/answer', '/api/cron/purge', '/robots.txt', '/parent-pack/class-9.pdf'])(
    'opens %s as before',
    (path) => {
      expect(isPublicPath(path)).toBe(true)
    },
  )

  it('does not open a path that merely starts with a public word', () => {
    expect(isPublicPath('/loginx')).toBe(false)
    expect(isPublicPath('/tx')).toBe(false)
  })
})
