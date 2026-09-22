import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { identify } from '@/server/attempt'
import { clientIp, ok } from '../../_lib/request'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const mobile = typeof body?.mobile === 'string' ? body.mobile : ''

  const result = await identify(serviceClient(), { token, mobile, ip: clientIp(req) })

  if (!result.ok) {
    // 200, not 401: this is an expected answer to a question, and a distinct
    // status code is one more signal to anyone probing the endpoint.
    return Response.json({
      ok: false,
      locked: result.locked,
      remaining: result.remaining,
      error: result.locked
        ? 'Too many attempts. Please contact the institute for a new link.'
        : 'That number does not match this link.',
    })
  }

  return ok({ candidateName: result.candidateName })
}
