'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { browserClient } from '@/lib/browserClient'

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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <form onSubmit={submit} className="rounded-lg border border-slate-200 bg-white p-6">
        <h1 className="text-lg font-semibold text-slate-900">Sign in</h1>

        <label htmlFor="email" className="mt-5 block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          className="min-h-tap mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password" className="mt-4 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className="min-h-tap mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="min-h-tap mt-5 w-full rounded bg-slate-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
          disabled={busy}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  )
}
