'use server'

import { revalidatePath } from 'next/cache'
import { currentStaff } from '@/server/auth'
import { addStaff, changeStaffRole, renameStaff, removeStaff, type StaffResult } from '@/server/staff'

// Thin wrappers. The actor is resolved here from the verified session and
// never taken from the form; the superadmin check is in src/server/staff.ts.

const SIGNED_OUT: StaffResult = { ok: false, error: 'Your session has ended. Sign in again.' }

export async function addStaffAction(formData: FormData): Promise<StaffResult> {
  const actor = await currentStaff()
  if (!actor) return SIGNED_OUT

  const result = await addStaff(actor, {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
    role: String(formData.get('role') ?? ''),
  })
  if (result.ok) revalidatePath('/staff')
  return result
}

export async function changeRoleAction(targetId: string, role: string): Promise<StaffResult> {
  const actor = await currentStaff()
  if (!actor) return SIGNED_OUT

  const result = await changeStaffRole(actor, targetId, role)
  if (result.ok) revalidatePath('/staff')
  return result
}

export async function renameAction(targetId: string, name: string): Promise<StaffResult> {
  const actor = await currentStaff()
  if (!actor) return SIGNED_OUT

  const result = await renameStaff(actor, targetId, name)
  if (result.ok) revalidatePath('/staff')
  return result
}

export async function removeStaffAction(targetId: string): Promise<StaffResult> {
  const actor = await currentStaff()
  if (!actor) return SIGNED_OUT

  const result = await removeStaff(actor, targetId)
  if (result.ok) revalidatePath('/staff')
  return result
}
