import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Devanagari } from 'next/font/google'
import './globals.css'

// Self-hosted by Next at build time: no request to Google from a visitor's browser.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
// Inter has no Devanagari. Listed after it, so the browser takes Hindi letters
// from here and everything else from Inter. Not preloaded: its unicode-range
// means only a page that shows Hindi downloads it.
const hindi = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-hindi', display: 'swap', preload: false })

export const metadata: Metadata = {
  title: 'Admissions',
  // The candidate route must never be indexed — it carries minors' data.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#1e3a8a',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${hindi.variable}`}>
      <body className="min-h-screen bg-canvas font-sans text-slate-900 antialiased">{children}</body>
    </html>
  )
}
