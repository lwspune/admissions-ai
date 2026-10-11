import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { currentStaff } from '@/server/auth'
import { Mark } from '@/components/ui'
import { ContactDialog } from './ContactDialog'
import { ProductTour } from './ProductTour'

// The one page a search engine may read (robots.ts), for other institutes.
// Kept to one line, the admin animation and a way to get in touch (2026-10-11).
export const metadata: Metadata = {
  title: 'Aptitude Test',
  description: 'Aptitude testing and lead management for education institutes.',
  robots: { index: true, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function Home() {
  // Staff come here to work, not to read about the product: a signed-in
  // member who lands on the root goes straight to the console.
  if (await currentStaff()) redirect('/leads')

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Mark />
        <Link
          href="/login"
          className="min-h-tap inline-flex items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-white hover:text-slate-900"
        >
          Staff sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 pb-16 pt-6">
        <h1 className="text-center text-xl font-medium tracking-tight text-slate-700 sm:text-2xl">
          Aptitude testing and lead management for education institutes
        </h1>
        <p className="sr-only">An animated sample of the staff and question bank screens, with invented names.</p>
        <div className="mt-8">
          <ProductTour />
        </div>
        <div className="mt-8 flex justify-center">
          <ContactDialog />
        </div>
      </main>
    </div>
  )
}
