/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // A verification `next build` must not overwrite the .next directory a
  // running `next dev` is serving from — doing so 404s every chunk and leaves
  // the dev server silently broken until it is restarted.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    // The parents' PDFs are open without a login; robots.txt already says
    // stay out, and this keeps a PDF out of an index that ignores it.
    const pack = { source: '/parent-pack/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }
    // Preview deployments must never be indexed (spec 11).
    if (process.env.VERCEL_ENV === 'production') return [pack]
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }]
  },
}
export default nextConfig
