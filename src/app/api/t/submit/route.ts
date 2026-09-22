import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { submitAttempt } from '@/server/attempt'
import { fail, ok } from '../../_lib/request'

const REASONS = ['manual', 'timer', 'window'] as const

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : ''
  const reason = REASONS.includes(body?.reason) ? body.reason : 'manual'

  if (!attemptId) return fail('attemptId is required')

  try {
    // Graded server-side; the result is deliberately NOT returned to the
    // candidate. Showing a score would leak the key to the next candidate.
    await submitAttempt(serviceClient(), { attemptId, reason })
    return ok({})
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not submit.', 409)
  }
}
