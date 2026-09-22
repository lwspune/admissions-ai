import type { NextRequest } from 'next/server'
import { serviceClient } from '@/server/supabase'
import { saveAnswer } from '@/server/attempt'
import { fail, ok } from '../../_lib/request'
import { CHOICES } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId : ''
  const position = Number(body?.position)
  const activeMs = Number(body?.activeMs ?? 0)

  const choice = CHOICES.includes(body?.choice) ? body.choice : null
  const numericValue =
    body?.numericValue === null || body?.numericValue === undefined || body?.numericValue === ''
      ? null
      : Number(body.numericValue)

  if (!attemptId) return fail('attemptId is required')
  if (numericValue !== null && !Number.isFinite(numericValue)) return fail('numericValue must be a number')

  try {
    await saveAnswer(serviceClient(), { attemptId, position, choice, numericValue, activeMs })
    return ok({})
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'Could not save the answer.', 409)
  }
}
