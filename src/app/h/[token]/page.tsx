import 'katex/dist/katex.min.css'
import type { Metadata } from 'next'
import { serviceClient } from '@/server/supabase'
import { openHiringTest } from '@/server/hiringAttempt'
import { HIRING_SUBJECT_LABEL } from '@/lib/hiring'
import { Shell } from '@/app/t/[token]/Shell'
import { HiringFlow } from './HiringFlow'

// The teacher screening test's link (HIRING_TEST_SPEC.md). Never cached: the
// window, the state and the attempt all move.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Teacher screening test',
  robots: { index: false, follow: false },
}

const NOTICE = {
  not_found: {
    title: 'This link is not active',
    body: 'It may have been replaced by a newer link. Please use the latest link the institute sent you, or ask them for one.',
  },
  expired: {
    title: 'This link has expired',
    body: 'The test had to be started within 24 hours of the link being sent. Please ask the institute for a new link.',
  },
  submitted: {
    title: 'Your test is submitted',
    body: 'Thank you. The institute has your answers and will be in touch.',
  },
} as const

export default async function HiringTestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await openHiringTest(serviceClient(), token)

  if (result.status !== 'ok') {
    const { title, body } = NOTICE[result.status]
    return (
      <Shell title={title} icon={result.status === 'submitted' ? 'checkCircle' : result.status === 'expired' ? 'clock' : 'link'} tone={result.status === 'submitted' ? 'success' : 'brand'}>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{body}</p>
      </Shell>
    )
  }

  return (
    <HiringFlow
      token={token}
      applicantName={result.applicantName}
      subject={HIRING_SUBJECT_LABEL[result.subject]}
      expiresAt={result.expiresAt}
      questionCount={result.questionCount}
      minutes={result.minutes}
      started={result.started}
    />
  )
}
