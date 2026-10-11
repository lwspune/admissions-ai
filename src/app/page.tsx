import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentStaff } from '@/server/auth'
import { Icon, type IconName } from '@/components/icons'
import { Mark, btn, card, cx } from '@/components/ui'
import { ContactForm } from './ContactForm'
import { ProductTour } from './ProductTour'

// The one page a search engine may read (robots.ts), for other institutes.
export const metadata: Metadata = {
  title: 'Aptitude Test — an admissions test for coaching institutes',
  description:
    'Send each applicant a 30-minute reasoning test on WhatsApp. It grades itself and reports to your counsellors, with leads, staff and parent summaries in one place.',
  robots: { index: true, follow: false },
}

export const dynamic = 'force-dynamic'

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'link',
    title: 'One link per applicant',
    body: 'Issued from the lead, sent to the parent’s WhatsApp, open for three hours. The number it was sent to is the key.',
  },
  {
    icon: 'book',
    title: 'Fair to every class',
    body: 'English, maths and science for admits to classes 8 to 12, drawn only from what the class has been taught.',
  },
  {
    icon: 'lock',
    title: 'Graded on the server',
    body: 'The answer key never reaches the phone. The score is ready the moment the test ends.',
  },
  {
    icon: 'message',
    title: 'English and Hindi',
    body: 'Maths and science questions can be read in Hindi at the tap of a switch.',
  },
  {
    icon: 'users',
    title: 'Leads in one place',
    body: 'Import your enquiry sheets, assign telecallers, track stages, and keep every call note.',
  },
  {
    icon: 'chart',
    title: 'You set the bar',
    body: 'No pass mark is built in. The test reports the score; your team decides who joins.',
  },
]

export default async function Home() {
  // Staff come here to work, not to read about the product: a signed-in
  // member who lands on the root goes straight to the console.
  if (await currentStaff()) redirect('/leads')

  return (
    <div className="min-h-screen">
      <header className="bg-brand-gradient text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Mark onDark />
          <Link
            href="/login"
            className="min-h-tap inline-flex items-center rounded-lg px-3 text-sm font-medium text-white/90 hover:bg-white/10 hover:text-white"
          >
            Staff sign in
          </Link>
        </div>

        <div className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pb-20 sm:pt-14">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-200">For coaching institutes</p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">
            An admissions test that runs itself.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-brand-100 sm:text-lg">
            Send each applicant a 30-minute reasoning test on WhatsApp. It is taken on the parent’s phone, graded on the
            server, and on your counsellor’s screen the moment it ends.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#contact" className={cx(btn('secondary', 'lg'), 'border-transparent text-brand-900')}>
              Get in touch
            </a>
            <a
              href="#tour"
              className={cx(btn('ghost', 'lg'), 'text-white ring-1 ring-inset ring-white/40 hover:bg-white/10')}
            >
              See it working
              <Icon name="chevronDown" className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <main>
        <section id="tour" aria-labelledby="tour-title" className="mx-auto max-w-6xl scroll-mt-4 px-4 pt-12 sm:pt-16">
          <h2 id="tour-title" className="text-2xl font-semibold tracking-tight text-slate-900">
            What your team sees once signed in
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600">Sample screens with invented names. The question is from the sample paper parents receive.</p>
          <div className="mt-6">
            <ProductTour />
          </div>
        </section>

        <section aria-labelledby="features-title" className="mx-auto max-w-6xl px-4 pt-16 sm:pt-20">
          <h2 id="features-title" className="text-2xl font-semibold tracking-tight text-slate-900">
            Built for the admissions desk
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.title} className={cx(card, 'p-5')}>
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                  <Icon name={f.icon} className="h-5 w-5" />
                </span>
                <h3 className="mt-3 font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="contact" aria-labelledby="contact-title" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 sm:py-20">
          <div className={cx(card, 'grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_1.4fr]')}>
            <div>
              <h2 id="contact-title" className="text-2xl font-semibold tracking-tight text-slate-900">
                Interested?
              </h2>
              <p className="mt-2 leading-relaxed text-slate-600">
                Tell us about your institute and we will get back to you to talk it through.
              </p>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-slate-600">
          <Mark />
          <Link href="/login" className="rounded hover:text-slate-900 hover:underline">
            Staff sign in
          </Link>
        </div>
      </footer>
    </div>
  )
}
