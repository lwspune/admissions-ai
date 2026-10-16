import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { loadLeadReport } from '@/server/report'
import { sheetPhotoUrl } from '@/server/paperScan'
import { Icon } from '@/components/icons'
import { StaffShell } from '@/components/StaffShell'
import { ReportView } from './ReportView'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Report', robots: { index: false, follow: false } }

export default async function ReportPage({ params }: { params: Promise<{ leadId: string }> }) {
  const staff = await currentStaff()
  if (!staff) redirect('/login')

  const { leadId } = await params
  const db = await userClient()
  const data = await loadLeadReport(db, leadId, staff.role)
  if (!data) notFound()
  // Counsellors and superadmin only; null for anyone else and for an online test.
  const photoUrl =
    data.attempt?.submitReason === 'paper' ? await sheetPhotoUrl(db, data.issue.id, staff.role) : null

  return (
    <StaffShell staff={staff}>
      <Link
        href={`/leads/${leadId}`}
        className="inline-flex min-h-tap items-center gap-1 rounded text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        Back to lead
      </Link>
      <ReportView data={data} role={staff.role} photoUrl={photoUrl} />
    </StaffShell>
  )
}
