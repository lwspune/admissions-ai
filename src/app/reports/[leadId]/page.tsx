import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { loadLeadReport } from '@/server/report'
import { ReportView } from './ReportView'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Report', robots: { index: false, follow: false } }

export default async function ReportPage({ params }: { params: Promise<{ leadId: string }> }) {
  const staff = await currentStaff()
  if (!staff) redirect('/login')

  const { leadId } = await params
  const data = await loadLeadReport(await userClient(), leadId, staff.role)
  if (!data) notFound()

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/leads" className="text-sm text-slate-500 hover:underline">
        ← Candidates
      </Link>
      <ReportView data={data} role={staff.role} />
    </main>
  )
}
