import type { MetadataRoute } from 'next'

// Nothing here should ever be indexed. The staff console is behind a session
// and the candidate route carries minors' data behind a single-use token.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } }
}
