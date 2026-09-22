import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return <LoginForm next={next ?? '/leads'} />
}
