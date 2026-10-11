import type { MetadataRoute } from 'next'

// Only the homepage may be indexed (2026-10-11): it is the page other
// institutes find. `/$` is the root exactly, not a prefix. Everything else
// stays out: the staff console is behind a session and the candidate route
// carries minors' data behind a single-use token.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/$', disallow: '/' } }
}
