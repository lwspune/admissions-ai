'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ROLES, MIN_PASSWORD, type Role } from '@/lib/staff'
import type { StaffAccount, StaffResult } from '@/server/staff'
import { addStaffAction, changeRoleAction, removeStaffAction } from './actions'

const ROLE_LABEL: Record<Role, string> = {
  telecaller: 'Telecaller',
  counsellor: 'Counsellor',
  superadmin: 'Superadmin',
}

const ROLE_HINT: Record<Role, string> = {
  telecaller: 'Adds candidates and issues tests. Never sees question text.',
  counsellor: 'Everything a telecaller does, plus full reports with questions.',
  superadmin: 'Everything, including answer keys and managing staff.',
}

export function StaffConsole({
  selfId,
  accounts,
  signInUrl,
}: {
  selfId: string
  accounts: StaffAccount[]
  signInUrl: string
}) {
  const [adding, setAdding] = useState(false)

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/leads" className="text-sm text-slate-500 hover:underline">
        ← Candidates
      </Link>

      <header className="mt-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Staff</h1>
          <p className="mt-1 text-sm text-slate-500">{accounts.length} account(s)</p>
        </div>
        <button
          type="button"
          className="min-h-tap rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          aria-expanded={adding}
          onClick={() => setAdding((v) => !v)}
        >
          {adding ? 'Cancel' : 'Add staff'}
        </button>
      </header>

      {adding && <AddStaff signInUrl={signInUrl} />}

      <dl className="mt-5 grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r}>
            <dt className="inline font-medium text-slate-800">{ROLE_LABEL[r]}: </dt>
            <dd className="inline">{ROLE_HINT[r]}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-5 space-y-3">
        {accounts.map((a) => (
          <StaffRow key={a.id} account={a} isSelf={a.id === selfId} />
        ))}
      </ul>

      <p className="mt-6 text-xs text-slate-500">
        A role change or removal takes effect on pages immediately, and fully within an hour, once
        that person&apos;s current sign-in token expires.
      </p>
    </main>
  )
}

function AddStaff({ signInUrl }: { signInUrl: string }) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null)
  const [copied, setCopied] = useState(false)

  function submit(formData: FormData) {
    setError('')
    setCreated(null)
    setCopied(false)
    start(async () => {
      const r = await addStaffAction(formData)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setCreated({
        email: String(formData.get('email')).trim().toLowerCase(),
        password: String(formData.get('password')),
      })
      form.current?.reset()
      router.refresh()
    })
  }

  const details = created
    ? `Sign in at ${signInUrl}\nEmail: ${created.email}\nPassword: ${created.password}`
    : ''

  return (
    <form ref={form} className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4" action={submit}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email<span aria-hidden="true"> *</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className="min-h-tap mt-1 w-full rounded border border-slate-300 px-3 py-2 text-base"
          />
        </div>
        <div>
          <label htmlFor="role" className="block text-sm font-medium text-slate-700">
            Role<span aria-hidden="true"> *</span>
          </label>
          <select
            id="role"
            name="role"
            required
            defaultValue=""
            className="min-h-tap mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-base"
          >
            <option value="" disabled>
              Choose…
            </option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password<span aria-hidden="true"> *</span>
          </label>
          {/* Plain text on purpose: the superadmin has to read it out or copy it
              to hand over. It is never shown again after this screen. */}
          <input
            id="password"
            name="password"
            type="text"
            required
            minLength={MIN_PASSWORD}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="password-hint"
            className="min-h-tap mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-base"
          />
          <p id="password-hint" className="mt-1 text-xs text-slate-500">
            At least {MIN_PASSWORD} characters. Share it with them privately.
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {error}
        </p>
      )}

      {created && (
        <div role="status" className="mt-3 rounded border border-green-300 bg-green-50 p-3 text-sm">
          <p className="font-medium text-green-900">Account created. Send them these details:</p>
          <pre className="mt-2 whitespace-pre-wrap break-all font-mono text-green-900">{details}</pre>
          <button
            type="button"
            className="min-h-tap mt-2 rounded border border-green-400 bg-white px-3 py-2 text-sm font-medium"
            onClick={async () => {
              await navigator.clipboard.writeText(details)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      )}

      <button
        type="submit"
        className="min-h-tap mt-4 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        disabled={pending}
      >
        {pending ? 'Creating…' : 'Create account'}
      </button>
    </form>
  )
}

function StaffRow({ account, isSelf }: { account: StaffAccount; isSelf: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [role, setRole] = useState<string>(account.role ?? '')
  const [error, setError] = useState('')

  const selectId = `role-${account.id}`
  const dirty = role !== (account.role ?? '')

  function run(action: () => Promise<StaffResult>) {
    setError('')
    start(async () => {
      const r = await action()
      if (!r.ok) setError(r.error)
      router.refresh()
    })
  }

  return (
    <li className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all font-medium text-slate-900">
            {account.email}
            {isSelf && <span className="ml-2 text-sm font-normal text-slate-500">(you)</span>}
          </p>
          <p className="text-xs text-slate-500">
            {account.lastSignInAt
              ? `Last signed in ${new Date(account.lastSignInAt).toLocaleString('en-IN', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}`
              : 'Never signed in'}
          </p>
          {!account.role && (
            <p className="text-xs font-medium text-amber-800">
              No role — this person sees an empty console. Choose one.
            </p>
          )}
        </div>

        {isSelf ? (
          <p className="text-sm text-slate-700">{account.role ? ROLE_LABEL[account.role] : 'No role'}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="sr-only">
              Role for {account.email}
            </label>
            {/* Saved with an explicit button, not on change: on Windows the
                arrow keys change a closed select's value, so a keyboard user
                would re-role someone just by moving through the options. */}
            <select
              id={selectId}
              value={role}
              disabled={pending}
              onChange={(e) => setRole(e.target.value)}
              className="min-h-tap rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {!account.role && (
                <option value="" disabled>
                  No role
                </option>
              )}
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            {dirty && (
              <button
                type="button"
                disabled={pending}
                aria-label={`Save role for ${account.email}`}
                className="min-h-tap rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => run(() => changeRoleAction(account.id, role))}
              >
                Save
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              aria-label={`Remove ${account.email}`}
              className="min-h-tap rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-800 disabled:opacity-50"
              onClick={() => {
                if (window.confirm(`Remove ${account.email}? They will no longer be able to sign in.`)) {
                  run(() => removeStaffAction(account.id))
                }
              }}
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-amber-900">
          {error}
        </p>
      )}
    </li>
  )
}
