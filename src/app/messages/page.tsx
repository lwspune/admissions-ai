import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { currentStaff, userClient } from '@/server/auth'
import { listContactMessages } from '@/server/contact'
import { StaffShell } from '@/components/StaffShell'
import { Icon } from '@/components/icons'
import { Badge, Card, EmptyState, PageHeader, btn, cx } from '@/components/ui'
import { markReadAction } from './actions'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Messages', robots: { index: false, follow: false } }

const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })

/** What visitors to the homepage sent through its contact form. Superadmin only. */
export default async function MessagesPage() {
  const staff = await currentStaff()
  if (!staff) redirect('/login?next=/messages')
  // 404, as /items and /staff do. RLS shows anyone else nothing regardless.
  if (staff.role !== 'superadmin') notFound()

  const messages = await listContactMessages(await userClient())
  const unread = messages.filter((m) => !m.readAt).length

  return (
    <StaffShell staff={staff} width="narrow">
      <PageHeader
        title="Messages"
        description={
          messages.length === 0 ? 'From the contact form on the homepage.' : `From the contact form on the homepage. ${unread} unread.`
        }
      />

      {messages.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon="inbox" title="No messages yet">
            When someone writes through the form on the homepage, it appears here.
          </EmptyState>
        </Card>
      ) : (
        <ul className="mt-6 space-y-3">
          {messages.map((m) => (
            <Card as="li" key={m.id} className={cx('p-4 sm:p-5', !m.readAt && 'border-brand-200 ring-1 ring-brand-100')}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {m.name}
                    {!m.readAt && <Badge tone="brand">New</Badge>}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-600">{when.format(new Date(m.createdAt))}</p>
                </div>
                <form action={markReadAction.bind(null, m.id, !m.readAt)}>
                  <button type="submit" className={btn('ghost', 'sm')}>
                    {m.readAt ? 'Mark unread' : 'Mark read'}
                  </button>
                </form>
              </div>

              <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800">{m.message}</p>

              <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-sm">
                {m.phone && (
                  <a href={`tel:+91${m.phone}`} className="inline-flex items-center gap-1.5 text-brand-800 hover:underline">
                    <Icon name="phone" className="h-4 w-4" />
                    {m.phone}
                  </a>
                )}
                {m.email && (
                  <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 break-all text-brand-800 hover:underline">
                    <Icon name="message" className="h-4 w-4" />
                    {m.email}
                  </a>
                )}
              </p>
            </Card>
          ))}
        </ul>
      )}
    </StaffShell>
  )
}
