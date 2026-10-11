import type { Metadata } from 'next'
import { serviceClient } from '@/server/supabase'
import { openByToken } from '@/server/attempt'
import { CandidateFlow } from './CandidateFlow'
import { Notice } from './Notice'

// Never cached: the window, the state and the attempt all move.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Aptitude Test',
  robots: { index: false, follow: false },
}

export default async function TestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await openByToken(serviceClient(), token)

  if (result.status !== 'ok') {
    return <Notice status={result.status} />
  }

  return (
    <CandidateFlow
      token={token}
      candidateName={result.candidateName}
      expiresAt={result.expiresAt}
      questionCount={result.questionCount}
      minutes={result.minutes}
      syllabusClass={result.syllabusClass}
      hindi={result.hindi}
    />
  )
}
