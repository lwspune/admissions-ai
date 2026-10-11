'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { browserClient } from '@/lib/browserClient'
import { Alert, Mark, btn, card, input, label } from '@/components/ui'

export function LoginForm({ next }: { next: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')

    const { error } = await browserClient().auth.signInWithPassword({ email, password })
    if (error) {
      // Deliberately not "no such user" vs "wrong password" — that difference
      // tells an attacker which addresses are real.
      setError('Email or password is incorrect.')
      setBusy(false)
      return
    }

    router.push(next)
    router.refresh()
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[radial-gradient(ellipse_at_top,_#e0e7ff_0%,_transparent_60%)] px-4 py-10">
      <Mark className="mb-8" />
      <form onSubmit={submit} className={`${card} w-full max-w-sm p-6 shadow-raised sm:p-8`}>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Sign in</h1>

        <label htmlFor="email" className={`${label} mt-6`}>
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          className={input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password" className={`${label} mt-4`}>
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className={input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <Alert tone="danger" role="alert" className="mt-4">
            {error}
          </Alert>
        )}

        <button type="submit" className={`${btn('primary', 'lg')} mt-6 w-full`} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
