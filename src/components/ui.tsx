// The app's few building blocks, so a button looks like a button on every
// page. No hooks here: these render in server and client components alike.
// Interactive pieces with state (the confirm dialog, the staff nav) live in
// their own 'use client' files.

import type { Tone } from '@/lib/leads'
import { Icon, type IconName } from './icons'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

// ── buttons ──────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900',
  secondary: 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'border border-rose-300 bg-white text-rose-700 shadow-sm hover:bg-rose-50',
  success: 'bg-emerald-700 text-white shadow-sm hover:bg-emerald-800',
}

const SIZE: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
}

/** Classes for anything that should look like a button: <button>, <Link> or <a>. */
export function btn(variant: Variant = 'primary', size: Size = 'md'): string {
  return cx(
    'min-h-tap inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    VARIANT[variant],
    SIZE[size],
  )
}

// ── form controls ────────────────────────────────────────────────────────────

/** A text box or select with no margin or width, for layouts that set their own. */
export const control =
  'min-h-tap rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-500 hover:border-slate-400 focus:border-brand-600 disabled:bg-slate-50'

/** The usual field: full width, just under its label. */
export const input = cx(control, 'mt-1 block w-full')

export const label = 'block text-sm font-medium text-slate-700'

export const hint = 'mt-1 text-xs text-slate-600'

// ── surfaces ─────────────────────────────────────────────────────────────────

export const card = 'rounded-xl border border-slate-200/80 bg-white shadow-card'

export function Card({
  as: Tag = 'div',
  className,
  children,
  ...rest
}: {
  as?: 'div' | 'section' | 'article' | 'form' | 'li' | 'aside'
  className?: string
  children: React.ReactNode
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cx(card, className)} {...rest}>
      {children}
    </Tag>
  )
}

/** A card's small uppercase heading. */
export function Eyebrow({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <h2 id={id} className={cx('text-xs font-semibold uppercase tracking-wider text-slate-600', className)}>
      {children}
    </h2>
  )
}

// ── badges ───────────────────────────────────────────────────────────────────

export type BadgeTone = Tone | 'brand'

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-sky-50 text-sky-800 ring-sky-200',
  accent: 'bg-violet-50 text-violet-800 ring-violet-200',
  success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-rose-50 text-rose-800 ring-rose-200',
  brand: 'bg-brand-50 text-brand-800 ring-brand-200',
}

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: BadgeTone
  icon?: IconName
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        TONE[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} className="h-3 w-3" />}
      {children}
    </span>
  )
}

// ── messages ─────────────────────────────────────────────────────────────────

const ALERT: Record<'info' | 'warning' | 'danger' | 'success', { box: string; icon: IconName }> = {
  info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: 'info' },
  warning: { box: 'border-amber-300 bg-amber-50 text-amber-900', icon: 'alert' },
  danger: { box: 'border-rose-300 bg-rose-50 text-rose-900', icon: 'alert' },
  success: { box: 'border-emerald-300 bg-emerald-50 text-emerald-900', icon: 'checkCircle' },
}

export function Alert({
  tone = 'info',
  role,
  className,
  children,
}: {
  tone?: keyof typeof ALERT
  role?: 'alert' | 'status'
  className?: string
  children: React.ReactNode
}) {
  const a = ALERT[tone]
  return (
    <div role={role} className={cx('flex gap-2.5 rounded-lg border px-3 py-2.5 text-sm', a.box, className)}>
      <Icon name={a.icon} className="mt-0.5 h-4 w-4" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// ── page furniture ───────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <div className="mt-1 text-sm text-slate-600">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({
  icon = 'inbox',
  title,
  children,
}: {
  icon?: IconName
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-600">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <p className="mt-3 font-medium text-slate-900">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-600">{children}</div>}
    </div>
  )
}

/** A grey block standing in for content while a page loads. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-md bg-slate-200/70 motion-reduce:animate-none', className)} />
}

/** Initials in a circle, for a lead or a staff member. */
export function Avatar({ name, className }: { name: string | null; className?: string }) {
  const initials = (name ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-100',
        className,
      )}
    >
      {initials || <Icon name="user" className="h-4 w-4" />}
    </span>
  )
}

/** The product's mark: a cap on the brand gradient, and the words "Aptitude Test". */
export function Mark({
  onDark = false,
  labelClassName,
  className,
}: {
  /** On the brand gradient: a glass tile and white words. */
  onDark?: boolean
  labelClassName?: string
  className?: string
}) {
  return (
    <span className={cx('inline-flex items-center gap-2.5', className)}>
      <span
        className={cx(
          'grid h-8 w-8 place-items-center rounded-lg text-white shadow-sm',
          onDark ? 'bg-white/15 ring-1 ring-inset ring-white/25' : 'bg-brand-gradient',
        )}
      >
        <Icon name="cap" className="h-[18px] w-[18px]" />
      </span>
      <span className={cx('font-semibold tracking-tight', onDark ? 'text-white' : 'text-slate-900', labelClassName)}>
        Aptitude Test
      </span>
    </span>
  )
}
