'use server'

import { revalidatePath } from 'next/cache'
import { canManageLeads } from '@/lib/staff'
import { userClient, requireStaff } from '@/server/auth'
import { issueAssessment } from '@/server/assessments'
import { normalizeMobile } from '@/lib/mobile'
import { parseClassLevel } from '@/lib/classes'
import { isStage, isInterest, isUuid, MAX_NOTE } from '@/lib/leads'

export interface ActionResult {
  ok: boolean
  error?: string
  /** The candidate link, when an issue succeeded. */
  url?: string
  /** Where a paper test's question paper and answer sheet are printed from. */
  paperUrl?: string
  /** Leads on this number that this person can see, when a create needs a decision. */
  duplicates?: { id: string; name: string | null }[]
  /** Leads on this number assigned to someone else, which this person cannot see. */
  hiddenDuplicates?: number
}

/**
 * Creates a lead, or reports the ones already on that number.
 *
 * `contact_mobile` deliberately has no unique constraint: the link goes to the
 * parent, so siblings share a number and a hard constraint would make the
 * second child of a family unenterable. The duplicate check lives here instead
 * and forces an explicit choice rather than guessing.
 *
 * The count comes from `leads_on_mobile`, not from a select: a telecaller
 * cannot see another telecaller's leads, so a select would find nothing and
 * the check would pass while creating a duplicate.
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

  // Optional here: it can be set on the lead's page, and issuing refuses a
  // lead without one.
  const rawClass = formData.get('class_level')
  const classLevel = parseClassLevel(rawClass)
  if (String(rawClass ?? '') !== '' && classLevel === null) {
    return { ok: false, error: 'Choose a class from the list.' }
  }

  const rawInterest = String(formData.get('interest') ?? '')
  if (rawInterest !== '' && !isInterest(rawInterest)) return { ok: false, error: 'Choose NDA or SPI.' }

  if (!confirmedSibling) {
    const { data: total, error: countError } = await db.rpc('leads_on_mobile', { p_mobile: mobile })
    if (countError) return { ok: false, error: countError.message }

    if ((total as number) > 0) {
      const { data: visible } = await db.from('leads').select('id, name').eq('contact_mobile', mobile)
      return {
        ok: false,
        error: 'This number already has a lead.',
        duplicates: (visible ?? []) as { id: string; name: string | null }[],
        hiddenDuplicates: (total as number) - (visible?.length ?? 0),
      }
    }
  }

  // Someone typing a lead in has spoken to the family, so it starts where an
  // issued test would move it (migration 0024). Imports arrive New.
  const { error } = await db.from('leads').insert({
    name,
    contact_mobile: mobile,
    stage: 'contacted',
    city: str(formData.get('city')),
    school: str(formData.get('school')),
    board: str(formData.get('board')),
    class_level: classLevel,
    interest: rawInterest || null,
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

/**
 * Issues a paper test (2026-10-16): the same frozen paper, printed with an OMR
 * sheet, for a candidate sitting it at the institute. Returns where to print
 * it from. Counsellors and superadmin only — the database refuses anyone else
 * (migration 0018); this check only saves a telecaller a confusing error.
 */
export async function issuePaperForLead(leadId: string): Promise<ActionResult> {
  const staff = await requireStaff()
  if (!canManageLeads(staff.role)) return { ok: false, error: 'Only a counsellor can issue a paper test.' }
  if (!isUuid(leadId)) return { ok: false, error: 'Unknown lead.' }
  const db = await userClient()

  try {
    const { assessment } = await issueAssessment(db, { leadId, issuedBy: staff.id, mode: 'paper' })
    revalidatePath('/leads')
    revalidatePath(`/leads/${leadId}`)
    return { ok: true, paperUrl: `/leads/${leadId}/paper/${assessment.id}` }
  } catch (e) {
    console.error('leads: issue paper test failed:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'Could not issue the paper test.' }
  }
}

/** Author and time are stamped by the database from the session. */
export async function addNote(leadId: string, body: string): Promise<ActionResult> {
  await requireStaff()
  if (!isUuid(leadId)) return { ok: false, error: 'Unknown lead.' }
  const text = String(body ?? '').trim()
  if (!text) return { ok: false, error: 'Write a comment first.' }
  if (text.length > MAX_NOTE) return { ok: false, error: `Keep a comment under ${MAX_NOTE} characters.` }

  const db = await userClient()
  const { error } = await db.from('lead_comments').insert({ lead_id: leadId, body: text })
  if (error) return failed('add note', error)

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

/** The history line for the change is written by the database. */
export async function setStage(leadId: string, stage: string): Promise<ActionResult> {
  await requireStaff()
  if (!isUuid(leadId)) return { ok: false, error: 'Unknown lead.' }
  if (!isStage(stage)) return { ok: false, error: 'Choose a stage.' }

  const db = await userClient()
  const { data, error } = await db.from('leads').update({ stage }).eq('id', leadId).select('id')
  if (error) return failed('set stage', error)
  if (!data?.length) return { ok: false, error: 'This lead is not yours to change.' }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

/**
 * Assigns leads to a telecaller, or unassigns them (`assignee` empty).
 * Who may assign, and to whom, is the `leads_guard` trigger's decision.
 */
export async function assignLeads(leadIds: string[], assignee: string): Promise<ActionResult> {
  const staff = await requireStaff()
  if (!canManageLeads(staff.role)) return { ok: false, error: 'Only a counsellor or superadmin can assign leads.' }
  if (!Array.isArray(leadIds) || leadIds.length === 0) return { ok: false, error: 'Select at least one lead.' }
  if (leadIds.length > 500 || !leadIds.every(isUuid)) return { ok: false, error: 'Unknown lead.' }
  if (assignee !== '' && !isUuid(assignee)) return { ok: false, error: 'Choose a telecaller.' }

  const db = await userClient()
  const { error } = await db
    .from('leads')
    .update({ assigned_to: assignee || null })
    .in('id', leadIds)
  if (error) return failed('assign', error)

  revalidatePath('/leads')
  for (const id of leadIds) revalidatePath(`/leads/${id}`)
  return { ok: true }
}

export async function updateLead(leadId: string, formData: FormData): Promise<ActionResult> {
  await requireStaff()
  if (!isUuid(leadId)) return { ok: false, error: 'Unknown lead.' }

  const name = String(formData.get('name') ?? '').trim().replace(/\s+/g, ' ')
  const rawClass = formData.get('class_level')
  const classLevel = parseClassLevel(rawClass)
  if (String(rawClass ?? '') !== '' && classLevel === null) return { ok: false, error: 'Choose a class from the list.' }
  const interest = String(formData.get('interest') ?? '')
  if (interest !== '' && !isInterest(interest)) return { ok: false, error: 'Choose NDA or SPI.' }

  const db = await userClient()
  const { data, error } = await db
    .from('leads')
    .update({
      name: name || null,
      class_level: classLevel,
      interest: interest || null,
      school: str(formData.get('school')),
      city: str(formData.get('city')),
    })
    .eq('id', leadId)
    .select('id')
  if (error) {
    if (/not be removed/.test(error.message)) return { ok: false, error: 'A name can be corrected but not removed.' }
    return failed('update lead', error)
  }
  if (!data?.length) return { ok: false, error: 'This lead is not yours to change.' }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

function failed(action: string, error: { message: string }): ActionResult {
  console.error(`leads: ${action} failed:`, error)
  return { ok: false, error: error.message }
}

function str(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}
