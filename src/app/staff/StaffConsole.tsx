'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ROLES, ROLE_LABEL, MIN_PASSWORD, MAX_NAME, validateName, type Role } from '@/lib/staff'
import { Icon } from '@/components/icons'
import { Alert, Avatar, Badge, PageHeader, btn, card, control, cx, hint, input, label } from '@/components/ui'
import { useConfirm } from '@/components/ConfirmDialog'
import type { StaffAccount, StaffResult } from '@/server/staff'
import { addStaffAction, changeRoleAction, renameAction, removeStaffAction } from './actions'

const ROLE_HINT: Record<Role, string> = {
  telecaller: 'Adds candidates and issues tests. Never sees question text.',
  counsellor: 'Everything a telecaller does, plus full reports with questions.',
  superadmin: 'Everything, including answer keys and managing staff.',
}

/** The name as the server stored it, for echoing back after a create. */
function cleanName(raw: string) {
  const checked = validateName(raw)
  return checked.ok ? checked.value : raw
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
    <>
      <PageHeader
        title="Staff"
        description={`${accounts.length} account(s)`}
        actions={
          <button
            type="button"
            className={adding ? btn('secondary') : btn('primary')}
            aria-expanded={adding}
            onClick={() => setAdding((v) => !v)}
          >
            {adding ? (
              'Cancel'
            ) : (
              <>
                <Icon name="plus" className="h-4 w-4" />
                Add staff
              </>
            )}
          </button>
        }
      />

      {adding && <AddStaff signInUrl={signInUrl} />}

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3">
            <dt className="text-sm font-semibold text-slate-900">{ROLE_LABEL[r]}</dt>
            <dd className="mt-0.5 text-xs leading-relaxed text-slate-600">{ROLE_HINT[r]}</dd>
          </div>
        ))}
      </dl>

      <ul className={cx(card, 'mt-6 divide-y divide-slate-100')}>
        {accounts.map((a) => (
          <StaffRow key={a.id} account={a} isSelf={a.id === selfId} />
        ))}
      </ul>

      <p className="mt-4 text-xs text-slate-600">
        A role change or removal takes effect on pages immediately, and fully within an hour, once
        that person&apos;s current sign-in token expires.
      </p>
    </>
  )
}

function AddStaff({ signInUrl }: { signInUrl: string }) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null)
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
        name: cleanName(String(formData.get('name'))),
        email: String(formData.get('email')).trim().toLowerCase(),
        password: String(formData.get('password')),
      })
      form.current?.reset()
      router.refresh()
    })
  }

  const details = created
    ? `Hi ${created.name}, your staff account is ready.\nSign in at ${signInUrl}\nEmail: ${created.email}\nPassword: ${created.password}`
    : ''

  return (
    <form ref={form} className={cx(card, 'mt-6 p-4 sm:p-6')} action={submit}>
      <h2 className="text-base font-semibold text-slate-900">New staff account</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className={label}>
            Full name<span aria-hidden="true"> *</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={MAX_NAME}
            autoComplete="off"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="email" className={label}>
            Email<span aria-hidden="true"> *</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="off"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="role" className={label}>
            Role<span aria-hidden="true"> *</span>
          </label>
          <select
            id="role"
            name="role"
            required
            defaultValue=""
            className={input}
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
          <label htmlFor="password" className={label}>
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
            className={cx(input, 'font-mono')}
          />
          <p id="password-hint" className={hint}>
            At least {MIN_PASSWORD} characters. Share it with them privately.
          </p>
        </div>
      </div>

      {error && (
        <Alert tone="warning" role="alert" className="mt-4">
          {error}
        </Alert>
      )}

      {created && (
        <div role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium text-emerald-900">
            <Icon name="checkCircle" className="h-4 w-4" />
            Account created. Send them these details:
          </p>
          <pre className="mt-3 whitespace-pre-wrap break-all rounded-lg bg-white p-3 font-mono text-xs text-slate-800 ring-1 ring-inset ring-emerald-200">
            {details}
          </pre>
          <button
            type="button"
            className={cx(btn('secondary', 'sm'), 'mt-3')}
            onClick={async () => {
              await navigator.clipboard.writeText(details)
              setCopied(true)
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} className="h-4 w-4" />
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button type="submit" className={btn('primary')} disabled={pending}>
          {pending ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </form>
  )
}

function StaffRow({ account, isSelf }: { account: StaffAccount; isSelf: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [role, setRole] = useState<string>(account.role ?? '')
  const [error, setError] = useState('')
  const { confirm, dialog } = useConfirm()

  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(account.name ?? '')

  const who = account.name ?? account.email
  const selectId = `role-${account.id}`
  const nameId = `name-${account.id}`
  const dirty = role !== (account.role ?? '')

  function run(action: () => Promise<StaffResult>, onOk?: () => void) {
    setError('')
    start(async () => {
      const r = await action()
      if (!r.ok) setError(r.error)
      else onOk?.()
      router.refresh()
    })
  }

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
        <Avatar name={account.name ?? account.email} className="mt-0.5" />
        <div className="min-w-0">
          {editingName ? (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                run(() => renameAction(account.id, name), () => setEditingName(false))
              }}
            >
              <label htmlFor={nameId} className="sr-only">
                Name for {account.email}
              </label>
              <input
                id={nameId}
                value={name}
                required
                maxLength={MAX_NAME}
                autoFocus
                disabled={pending}
                onChange={(e) => setName(e.target.value)}
                className={control}
              />
              <button type="submit" disabled={pending} className={btn('primary', 'sm')}>
                Save
              </button>
              <button
                type="button"
                disabled={pending}
                className={btn('secondary', 'sm')}
                onClick={() => {
                  setName(account.name ?? '')
                  setEditingName(false)
                  setError('')
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <p className="flex flex-wrap items-center gap-x-2 break-all font-semibold text-slate-900">
              {account.name ?? <span className="font-normal italic text-slate-600">No name</span>}
              {isSelf && <Badge tone="brand">You</Badge>}
              <button
                type="button"
                aria-label={`Edit name for ${account.email}`}
                className="min-h-tap inline-flex items-center gap-1 rounded px-1.5 text-sm font-medium text-brand-700 hover:text-brand-800"
                onClick={() => setEditingName(true)}
              >
                <Icon name="pencil" className="h-3.5 w-3.5" />
                Edit name
              </button>
            </p>
          )}
          <p className="break-all text-sm text-slate-600">{account.email}</p>
          <p className="mt-0.5 text-xs text-slate-600">
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
        </div>

        {isSelf ? (
          <Badge tone="neutral">{account.role ? ROLE_LABEL[account.role] : 'No role'}</Badge>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={selectId} className="sr-only">
              Role for {who}
            </label>
            {/* Saved with an explicit button, not on change: on Windows the
                arrow keys change a closed select's value, so a keyboard user
                would re-role someone just by moving through the options. */}
            <select
              id={selectId}
              value={role}
              disabled={pending}
              onChange={(e) => setRole(e.target.value)}
              className={control}
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
                aria-label={`Save role for ${who}`}
                className={btn('primary', 'sm')}
                onClick={() => run(() => changeRoleAction(account.id, role))}
              >
                Save
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              aria-label={`Remove ${who}`}
              className={btn('danger', 'sm')}
              onClick={async () => {
                if (
                  await confirm({
                    title: 'Remove this account?',
                    body: `Remove ${who} (${account.email})? They will no longer be able to sign in.`,
                    confirm: 'Remove',
                    danger: true,
                  })
                ) {
                  run(() => removeStaffAction(account.id))
                }
              }}
            >
              <Icon name="trash" className="h-4 w-4" />
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
      {dialog}
    </li>
  )
}
