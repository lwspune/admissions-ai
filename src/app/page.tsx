import { redirect } from 'next/navigation'

// The root is not a page. Middleware has already bounced anyone without a
// session to /login, so whoever reaches here is signed in and wants the
// console. A landing page here is a dead end: it was one, and a signed-in
// staff member had no way out of it.
export default function Home() {
  redirect('/leads')
}
