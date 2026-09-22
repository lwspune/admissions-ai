/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // Preview deployments must never be indexed (spec 11).
    if (process.env.VERCEL_ENV === 'production') return []
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex' }] }]
  },
}
export default nextConfig
