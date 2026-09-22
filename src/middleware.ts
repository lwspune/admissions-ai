import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Refreshes the Supabase session cookie on every staff request and bounces
// anyone without one to /login.
//
// The candidate route is deliberately excluded: /t/[token] is public by design
// and the token plus the parent's number is its gate.

// robots.txt must be reachable by a crawler that has no session — the
// middleware was redirecting it to /login, so the rules never got read.
const PUBLIC = ['/login', '/t/', '/api/t/', '/robots.txt']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next()
  }

  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) req.cookies.set(name, value)
          res = NextResponse.next({ request: req })
          for (const { name, value, options } of toSet) res.cookies.set(name, value, options)
        },
      },
    },
  )

  // getUser(), not getSession(): the latter trusts a cookie the browser can
  // edit. This call also refreshes an expiring token, which is why the
  // middleware exists at all.
  const { data } = await supabase.auth.getUser()

  if (!data.user) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  return res
}

export const config = {
  matcher: [
    // Everything except static assets and the favicon.
    '/((?!_next/static|_next/image|favicon.ico|.*[.](?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
