'use server'

import { revalidatePath } from 'next/cache'
import { currentStaff, userClient } from '@/server/auth'
import { addApplicant, issueHiringTest, type HiringResult } from '@/server/hiring'
import { canHire } from '@/lib/staff'

// Thin wrappers over src/server/hiring.ts, on the session client: the
// database decides who may add and issue (can_hire, issue_hiring_test). The
// role check here only spares a wrong role a confusing database error.

type Client = { ok: true; db: Awaited<ReturnType<typeof userClient>> } | { ok: false; error: string }

async function hiringClient(): Promise<Client> {
  const staff = await currentStaff()
  if (!staff) return { ok: false, error: 'Your session has ended. Sign in again.' }
  if (!canHire(staff.role)) return { ok: false, error: 'Only a teacher or superadmin can do this.' }
  return { ok: true, db: await userClient() }
}

export async function addApplicantAction(formData: FormData): Promise<HiringResult<{ id: string }>> {
  const c = await hiringClient()
  if (!c.ok) return c
  const result = await addApplicant(c.db, {
    name: String(formData.get('name') ?? ''),
    mobile: String(formData.get('mobile') ?? ''),
    subject: String(formData.get('subject') ?? ''),
  })
  if (result.ok) revalidatePath('/hiring')
  return result
}

/** Issues (or reissues) a link; returns its URL for the WhatsApp message. */
export async function issueTestAction(applicantId: string): Promise<HiringResult<{ url: string }>> {
  const c = await hiringClient()
  if (!c.ok) return c
  const result = await issueHiringTest(c.db, applicantId)
  if (!result.ok) return result
  revalidatePath('/hiring')
  return { ok: true, url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/h/${result.token}` }
}
