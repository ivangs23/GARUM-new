import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isProtected =
    request.nextUrl.pathname.startsWith('/admin') ||
    request.nextUrl.pathname.startsWith('/staff')

  const isAuthPage =
    request.nextUrl.pathname === '/admin/login' ||
    request.nextUrl.pathname === '/staff/login'

  if (isProtected && !isAuthPage && !user) {
    const loginPath = request.nextUrl.pathname.startsWith('/admin')
      ? '/admin/login'
      : '/staff/login'
    return NextResponse.redirect(new URL(loginPath, request.url))
  }

  if (isAuthPage && user) {
    const dashboardPath = request.nextUrl.pathname.startsWith('/admin')
      ? '/admin'
      : '/staff'
    return NextResponse.redirect(new URL(dashboardPath, request.url))
  }

  return response
}
