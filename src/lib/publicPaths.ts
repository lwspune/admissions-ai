// Which paths open without a staff session. The middleware asks this; every
// path on the list guards itself, because the middleware protects it from
// nothing.
//
// /login — where everyone else is sent.
//
// /t/ and /api/t/ — the candidate route. The token plus the parent's number is
// its gate.
//
// /api/cron/ — Vercel Cron carries no session, so the middleware would
// redirect the purge to /login and it would never run, reporting 307s nobody
// reads. Those routes guard themselves with CRON_SECRET.
//
// /robots.txt — a crawler has no session; redirected, the rules never got read.
//
// /parent-pack/ — the parents' syllabus and sample-paper PDFs, linked from the
// issue message: a parent has no session. Static files holding no candidate
// data and no bank item (src/lib/parentPack.ts).
const PREFIXES = ['/login', '/t/', '/api/t/', '/api/cron/', '/robots.txt', '/parent-pack/']

// The homepage, for signed-out visitors (2026-10-11): mock-ups and a contact
// form, nothing read from the database. Matched exactly — the root is a prefix
// of every path, so a prefix match would open the whole console.
const EXACT = ['/']

export function isPublicPath(pathname: string): boolean {
  if (EXACT.includes(pathname)) return true
  return PREFIXES.some((p) => pathname === p || (p.endsWith('/') && pathname.startsWith(p)))
}
