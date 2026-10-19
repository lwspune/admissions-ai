import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { submitHiringTest } from '@/server/hiringAttempt'
import { fail, ok } from '../../_lib/request'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : ''
  const reason = body?.reason === 'timer' ? 'timer' : 'manual'
  if (!attemptId) return fail('attemptId is required')

  try {
    // Graded in the database; the score is not returned to the applicant.
    await submitHiringTest(serviceClient(), { attemptId, reason })
    return ok({})
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not submit.', 409)
  }
}
