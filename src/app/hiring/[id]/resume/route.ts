import { NextResponse, type NextRequest } from 'next/server'
import { currentStaff, userClient } from '@/server/auth'
import { hiringResumeUrl } from '@/server/hiring'
import { canHire } from '@/lib/staff'
import type { ResumeKind } from '@/lib/hiring'

export const dynamic = 'force-dynamic'

/**
 * Opens an applicant's resume: a fresh ten-minute storage link on every click,
 * so a page left open never holds a dead one. The session client reads the
 * applicant and signs the link, so RLS and the storage policy decide who gets it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const staff = await currentStaff()
  if (!staff || !canHire(staff.role) || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse('Not found', { status: 404 })

  const db = await userClient()
  const { data } = await db.from('hiring_applicants').select('id, name, resume_type').eq('id', id).maybeSingle()
  const url = data && (await hiringResumeUrl(db, { id, name: data.name as string, resumeType: data.resume_type as ResumeKind | null }))
  if (!url) return new NextResponse('Not found', { status: 404 })
  return NextResponse.redirect(url, 303)
}
