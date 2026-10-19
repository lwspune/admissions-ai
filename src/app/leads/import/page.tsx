import type { Metadata } from 'next'
import { canManageLeads } from '@/lib/staff'
import { notFound, redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { listSources } from '@/server/leads'
import { StaffShell } from '@/components/StaffShell'
import { PageHeader } from '@/components/ui'
import { ImportWizard } from './ImportWizard'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Import leads', robots: { index: false, follow: false } }

export default async function ImportPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/leads/import')
  // Cosmetic: import_leads refuses a telecaller in the database regardless.
  if (!canManageLeads(staff.role)) notFound()

  const sources = await listSources(await userClient())

  return (
    <StaffShell staff={staff} width="narrow">
      <PageHeader
        title="Import leads"
        description={
          <>
            Upload a CSV. From Google Sheets: File → Download → Comma-separated values. From Excel: Save As → CSV UTF-8.
            A number already in the system adds to that lead; it never changes its stage or who it is assigned to.
          </>
        }
      />
      <ImportWizard sources={sources} />
    </StaffShell>
  )
}
