import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { saveHiringAnswer } from '@/server/hiringAttempt'
import { CHOICES, type Choice } from '@/lib/types'
import { fail, ok } from '../../_lib/request'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : ''
  const position = Number(body?.position)
  const choice: Choice | null = CHOICES.includes(body?.choice) ? body.choice : null
  const numericValue = body?.numericValue === null || body?.numericValue === undefined ? null : Number(body.numericValue)

  if (!attemptId) return fail('attemptId is required')
  if (numericValue !== null && !Number.isFinite(numericValue)) return fail('Enter a whole number from 0 to 9999.')

  try {
    await saveHiringAnswer(serviceClient(), { attemptId, position, choice, numericValue })
    return ok({})
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the answer.', 409)
  }
}
