import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isPublicPath } from '@/lib/publicPaths'
import { isRole, roleMayOpen, homeFor } from '@/lib/staff'

// Refreshes the Supabase session cookie on every staff request and bounces
// anyone without one to /login. What opens without a session, and why, is in
// src/lib/publicPaths.ts.

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  // The homepage is public, but a session there is still refreshed: staff
  // whose token has lapsed should reach /leads, not the page for visitors.
  const home = pathname === '/'
  if (isPublicPath(pathname) && !home) {
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
    if (home) return res
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // A teacher works on /hiring and nothing else; /hiring is for teachers and
  // superadmin (src/lib/staff.ts). One gate here, ahead of every page, server
  // action and API route under it. The role is app_metadata, which only the
  // admin API writes; the database refuses the same people underneath.
  const role = data.user.app_metadata?.role
  if (!home && isRole(role) && !roleMayOpen(role, pathname)) {
    const url = req.nextUrl.clone()
    url.pathname = homeFor(role)
    url.search = ''
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
