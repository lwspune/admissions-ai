'use server'

import { revalidatePath } from 'next/cache'
import { userClient, requireStaff } from '@/server/auth'
import { issueAssessment } from '@/server/assessments'
import { normalizeMobile } from '@/lib/mobile'

export interface ActionResult {
  ok: boolean
  error?: string
  /** The candidate link, when an issue succeeded. */
  url?: string
  /** Leads already on this number, when a create needs a decision. */
  duplicates?: { id: string; name: string }[]
}

/**
 * Creates a lead, or reports the ones already on that number.
 *
 * `contact_mobile` deliberately has no unique constraint: the link goes to the
 * parent, so siblings share a number and a hard constraint would make the
 * second child of a family unenterable. The duplicate check lives here instead
 * and forces an explicit choice rather than guessing.
 */
export async function createLead(formData: FormData): Promise<ActionResult> {
  await requireStaff()
  const db = await userClient()

  const name = String(formData.get('name') ?? '').trim()
  const rawMobile = String(formData.get('contact_mobile') ?? '')
  const confirmedSibling = formData.get('confirm_sibling') === 'yes'

  if (!name) return { ok: false, error: 'Enter the candidate’s name.' }

  const mobile = normalizeMobile(rawMobile)
  if (!mobile) {
    return { ok: false, error: 'Enter a valid 10-digit Indian mobile number.' }
  }

  if (!confirmedSibling) {
    const { data: existing } = await db
      .from('leads')
      .select('id, name')
      .eq('contact_mobile', mobile)

    if (existing?.length) {
      return {
        ok: false,
        error: 'This number already has a candidate.',
        duplicates: existing as { id: string; name: string }[],
      }
    }
  }

  const { error } = await db.from('leads').insert({
    name,
    contact_mobile: mobile,
    city: str(formData.get('city')),
    school: str(formData.get('school')),
    board: str(formData.get('board')),
    class_level: str(formData.get('class_level')),
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/leads')
  return { ok: true }
}

/**
 * Issues a test and returns the link for the staff member to paste into
 * WhatsApp. Reissuing is the same call: the cap and the voiding of the old
 * token both live in the database.
 */
export async function issueForLead(leadId: string): Promise<ActionResult> {
  const staff = await requireStaff()
  const db = await userClient()

  try {
    const { assessment } = await issueAssessment(db, { leadId, issuedBy: staff.id })
    const base = process.env.NEXT_PUBLIC_APP_URL ?? ''
    revalidatePath('/leads')
    return { ok: true, url: `${base}/t/${assessment.token}` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not issue the test.' }
  }
}

function str(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}
