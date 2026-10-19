import type { Metadata } from 'next'
import { canManageLeads } from '@/lib/staff'
import { redirect } from 'next/navigation'
import { currentStaff } from '@/server/auth'
import { StaffShell } from '@/components/StaffShell'
import { ScanConsole } from './ScanConsole'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Scan sheets', robots: { index: false, follow: false } }

/**
 * Scanning paper-test answer sheets (2026-10-16). Counsellors and superadmin:
 * the database refuses anyone else's scan (record_paper_scan) and the sheet
 * photos (storage policies); a telecaller is sent back to the leads.
 */
export default async function ScanPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/scan')
  if (!canManageLeads(staff.role)) redirect('/leads')

  return (
    <StaffShell staff={staff}>
      <ScanConsole />
    </StaffShell>
  )
}
