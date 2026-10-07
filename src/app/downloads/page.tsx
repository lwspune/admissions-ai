import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { currentStaff } from '@/server/auth'
import { CLASSES } from '@/lib/classes'
import { PackRow } from './PackRow'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Downloads', robots: { index: false, follow: false } }

/**
 * The parents' syllabus and sample-paper PDFs, one per admitting class, to
 * send before a test is issued as well as with it. Every staff role sends
 * them, so every role sees this page. The files themselves are public.
 */
export default async function DownloadsPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/downloads')

  // The deployed origin, or this request's host where it is unset (local), so
  // a copied or sent link is never a bare path.
  const host = (await headers()).get('host')
  const site = process.env.NEXT_PUBLIC_APP_URL || `${host?.startsWith('localhost') ? 'http' : 'https'}://${host}`

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/leads" className="text-sm text-slate-600 hover:underline">
        ← Leads
      </Link>

      <header className="mt-3 border-b border-slate-200 pb-4">
        <h1 className="text-xl font-semibold text-slate-900">Downloads</h1>
        <p className="mt-1 text-sm text-slate-600">
          Syllabus and sample paper for parents, one PDF per class the student is joining. The test link
          message already includes the right one.
        </p>
      </header>

      <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {CLASSES.map((classLevel) => (
          <PackRow key={classLevel} classLevel={classLevel} site={site} />
        ))}
      </ul>
    </main>
  )
}
