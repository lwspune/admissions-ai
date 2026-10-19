import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { identifyApplicant } from '@/server/hiringAttempt'
import { clientIp, ok } from '../../_lib/request'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const mobile = typeof body?.mobile === 'string' ? body.mobile : ''

  const result = await identifyApplicant(serviceClient(), { token, mobile, ip: clientIp(req) })
  if (!result.ok) {
    // 200, as /api/t/identify: an expected answer, not an error to probe for.
    return Response.json({
      ok: false,
      locked: result.locked,
      remaining: result.remaining,
      error: result.locked
        ? 'Too many attempts. Please ask the institute for a new link.'
        : 'That number does not match this link.',
    })
  }
  return ok({ applicantName: result.applicantName })
}
