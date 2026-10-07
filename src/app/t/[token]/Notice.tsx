// Every dead end a candidate can reach, in plain language.
//
// A parent reads these, often while the child is waiting. None of them should
// read like an error, and each says what to do next rather than what went wrong.

const MESSAGES: Record<string, { title: string; body: string }> = {
  not_found: {
    title: 'This link is not available',
    body: 'It may have been replaced by a newer link. Please check the most recent message from the institute, or ask them to send a fresh one.',
  },
  expired: {
    title: 'This link has expired',
    body: 'Links stay open for three hours. Please contact the institute and they will send a new one.',
  },
  too_late: {
    title: 'Not enough time left',
    body: 'The test needs its full time without interruption, and this link is close to expiring. Please ask the institute for a fresh link.',
  },
  submitted: {
    title: 'This test has already been completed',
    body: 'Thank you — we have the answers. The institute will be in touch.',
  },
}

export function Notice({ status }: { status: string }) {
  const message = MESSAGES[status] ?? MESSAGES.not_found!

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">{message.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message.body}</p>
      </div>
    </main>
  )
}
