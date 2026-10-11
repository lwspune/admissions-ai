import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { currentStaff } from '@/server/auth'
import { CLASSES } from '@/lib/classes'
import { StaffShell } from '@/components/StaffShell'
import { PageHeader, card } from '@/components/ui'
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
    <StaffShell staff={staff} width="narrow">
      <PageHeader
        title="Downloads"
        description="Syllabus and sample paper for parents, in English and Hindi, for the class the student is joining. The test link message already includes the English one; send the Hindi one from here."
      />

      <ul className={`${card} mt-6 divide-y divide-slate-100 overflow-hidden`}>
        {CLASSES.map((classLevel) => (
          <PackRow key={classLevel} classLevel={classLevel} site={site} />
        ))}
      </ul>
    </StaffShell>
  )
}
