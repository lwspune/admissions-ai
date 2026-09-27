import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { currentStaff, userClient } from '@/server/auth'
import { listSources } from '@/server/leads'
import { ImportWizard } from './ImportWizard'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Import leads', robots: { index: false, follow: false } }

export default async function ImportPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/leads/import')
  // Cosmetic: import_leads refuses a telecaller in the database regardless.
  if (staff.role === 'telecaller') notFound()

  const sources = await listSources(await userClient())

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link href="/leads" className="text-sm text-slate-600 hover:underline">
        ← All leads
      </Link>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Import leads</h1>
      <p className="mt-1 text-sm text-slate-600">
        Upload a CSV. From Google Sheets: File → Download → Comma-separated values. From Excel: Save As → CSV UTF-8.
        A number already in the system adds to that lead; it never changes its stage or who it is assigned to.
      </p>
      <ImportWizard sources={sources} />
    </main>
  )
}
