import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { startAttempt } from '@/server/attempt'
import { clientIp, userAgent, fail, ok } from '../../_lib/request'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const token = typeof body?.token === 'string' ? body.token : ''
  const screen = typeof body?.screen === 'string' ? body.screen.slice(0, 64) : null

  try {
    const { attempt, questions, answers, resumed } = await startAttempt(serviceClient(), {
      token,
      context: { userAgent: userAgent(req), ip: clientIp(req), screen },
    })

    return ok({
      attemptId: attempt.id,
      deadlineAt: attempt.deadline_at,
      questions,
      answers,
      resumed,
    })
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not start the test.', 409)
  }
}
