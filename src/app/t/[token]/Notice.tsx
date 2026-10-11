// Every dead end a candidate can reach, in plain language.
//
// A parent reads these, often while the child is waiting. None of them should
// read like an error, and each says what to do next rather than what went wrong.
// They come before the paper is known, so they say it in English and Hindi at
// once rather than offering a switch (2026-10-11).

import type { IconName } from '@/components/icons'
import { NOTICE_TEXT, type NoticeStatus } from '@/lib/candidateText'
import { Shell } from './Shell'

const LOOK: Record<NoticeStatus, { icon: IconName; tone: 'brand' | 'success' }> = {
  not_found: { icon: 'link', tone: 'brand' },
  expired: { icon: 'clock', tone: 'brand' },
  too_late: { icon: 'clock', tone: 'brand' },
  submitted: { icon: 'checkCircle', tone: 'success' },
}

export function Notice({ status }: { status: string }) {
  const key: NoticeStatus = status in NOTICE_TEXT ? (status as NoticeStatus) : 'not_found'
  const { en, hi } = NOTICE_TEXT[key]

  return (
    <Shell title={en.title} icon={LOOK[key].icon} tone={LOOK[key].tone}>
      <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{en.body}</p>
      <div lang="hi" className="mt-5 border-t border-slate-200 pt-5">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">{hi.title}</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{hi.body}</p>
      </div>
    </Shell>
  )
}
