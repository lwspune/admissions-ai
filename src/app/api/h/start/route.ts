import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { startHiringAttempt } from '@/server/hiringAttempt'
import { clientIp, userAgent, fail, ok } from '../../_lib/request'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const mobile = typeof body?.mobile === 'string' ? body.mobile : ''

  try {
    const started = await startHiringAttempt(serviceClient(), {
      token,
      mobile,
      context: { userAgent: userAgent(req), ip: clientIp(req) },
    })
    return ok(started)
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not start the test.', 409)
  }
}
