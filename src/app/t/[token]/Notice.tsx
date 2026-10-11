// Every dead end a candidate can reach, in plain language.
//
// A parent reads these, often while the child is waiting. None of them should
// read like an error, and each says what to do next rather than what went wrong.

import type { IconName } from '@/components/icons'
import { Shell } from './Shell'

const MESSAGES: Record<string, { title: string; body: string; icon: IconName; tone: 'brand' | 'success' }> = {
  not_found: {
    title: 'This link is not available',
    icon: 'link',
    tone: 'brand',
    body: 'It may have been replaced by a newer link. Please check the most recent message from the institute, or ask them to send a fresh one.',
  },
  expired: {
    title: 'This link has expired',
    icon: 'clock',
    tone: 'brand',
    body: 'Links stay open for three hours. Please contact the institute and they will send a new one.',
  },
  too_late: {
    title: 'Not enough time left',
    icon: 'clock',
    tone: 'brand',
    body: 'The test needs its full time without interruption, and this link is close to expiring. Please ask the institute for a fresh link.',
  },
  submitted: {
    title: 'This test has already been completed',
    icon: 'checkCircle',
    tone: 'success',
    body: 'Thank you — we have the answers. The institute will be in touch.',
  },
}

export function Notice({ status }: { status: string }) {
  const message = MESSAGES[status] ?? MESSAGES.not_found!

  return (
    <Shell title={message.title} icon={message.icon} tone={message.tone}>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{message.body}</p>
    </Shell>
  )
}
