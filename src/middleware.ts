import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
    const pathname = req.nextUrl.pathname
    const withBase = (p: string) => `${basePath}${p}`

    if (pathname.startsWith(withBase('/api/')) || pathname.startsWith('/api/')) {
      return NextResponse.next()
    }

    const token = req.nextauth.token
    const isAuth = !!token

    const isAuthPage = pathname.startsWith(withBase('/auth')) || pathname === withBase('/auth')
    const isAdminPage = pathname.startsWith(withBase('/admin'))
    const isDashboard = pathname.startsWith(withBase('/dashboard'))
    const isProjectOverview = pathname.startsWith(withBase('/project-overview'))
    const isCommunicationOverview = pathname.startsWith(withBase('/communication-overview'))
    const isTestcasesPage = pathname.startsWith(withBase('/testcases'))

    const publicPaths = ['/features', '/pricing', '/about', '/contact']
    const isPublicPage = publicPaths.some(p => pathname === withBase(p))

    // Redirect /shared/project/* to /gmail/shared/project/* if basePath is set
    // This must happen BEFORE other checks to catch routes without basePath
    if (basePath && pathname.startsWith('/shared/project/') && !pathname.startsWith(withBase('/shared/project/'))) {
      const shareId = pathname.replace('/shared/project/', '');
      const redirectUrl = new URL(`${basePath}/shared/project/${shareId}`, req.url);
      console.log(`🔄 Middleware: Redirecting /shared/project/${shareId} to ${redirectUrl.pathname}`);
      return NextResponse.redirect(redirectUrl);
    }

    if (isAuthPage && isAuth) {
      return NextResponse.redirect(new URL(withBase('/dashboard'), req.url))
    }

    // Allow shared routes with basePath
    if (
      isPublicPage ||
      pathname === withBase('/') ||
      pathname.startsWith(withBase('/shared'))
    ) {
      return NextResponse.next()
    }

    if ((isDashboard || !isPublicPage) && !isAuth && !isAuthPage) {
      let from = pathname
      if (req.nextUrl.search) from += req.nextUrl.search
      // Use relative URL for callbackUrl to ensure it uses the current request origin
      const callbackUrl = withBase(`/auth/signin?callbackUrl=${encodeURIComponent(from)}`)
      return NextResponse.redirect(new URL(callbackUrl, req.url))
    }

    // Block unverified users from accessing protected routes (only for tenants)
    const isTenant = !!basePath
    const isVerifyPage = pathname.startsWith(withBase('/auth/verify-email')) || pathname === withBase('/auth/verify-email')
    const isVerifyApi = pathname.startsWith(withBase('/api/auth/verify'))
    
    // Only enforce verification for tenants, not for parent app
    if (isTenant && isAuth && token && !isVerifyPage && !isVerifyApi && !isAuthPage) {
      const isVerified = (token as any)?.isVerified
      
      // Allow access to public routes even if unverified
      if (!isPublicPage && pathname !== withBase('/') && !pathname.startsWith(withBase('/shared'))) {
        if (!isVerified) {
          return NextResponse.redirect(new URL(withBase('/auth/verify-email'), req.url))
        }
      }
    }

    const userAllowedPages = (token?.allowedPages as string[]) || []
    const currentPage = pathname.replace(new RegExp(`^${basePath}/?`), '').replace(/^\//, '')
    
    // Check if user has explicit access to current page or any parent path
    // e.g., if path is "admin/roles", check for "admin/roles", "admin", or any parent segment
    const hasExplicitPageAccess = (() => {
      if (userAllowedPages.includes(currentPage)) return true
      // Check parent paths: "admin/roles" -> check "admin"
      const pathSegments = currentPage.split('/')
      for (let i = pathSegments.length; i > 0; i--) {
        const parentPath = pathSegments.slice(0, i).join('/')
        if (userAllowedPages.includes(parentPath)) return true
      }
      return false
    })()

    if (isAdminPage && token?.role !== 'ADMIN' && !hasExplicitPageAccess) {
      return NextResponse.redirect(new URL(withBase('/dashboard?error=unauthorized'), req.url))
    }

    if (isProjectOverview && ['DEVELOPER', 'TESTER'].includes(token?.role as string) && !hasExplicitPageAccess) {
      return NextResponse.redirect(new URL(withBase('/dashboard?error=access-denied&message=Project Overview is not available for your role'), req.url))
    }

    // Communication Overview has same access as Project Overview
    if (isCommunicationOverview && ['DEVELOPER', 'TESTER'].includes(token?.role as string) && !hasExplicitPageAccess) {
      // Check if user has project-overview access (inherits from it)
      const hasProjectOverviewAccess = userAllowedPages.includes('project-overview')
      if (!hasProjectOverviewAccess) {
        return NextResponse.redirect(new URL(withBase('/dashboard?error=access-denied&message=Communication Overview is not available for your role'), req.url))
      }
    }

    if (isTestcasesPage && !['TESTER', 'ADMIN', 'MANAGER'].includes(token?.role as string) && !hasExplicitPageAccess) {
      return NextResponse.redirect(new URL(withBase('/dashboard?error=access-denied&message=Testcases page is not available for your role'), req.url))
    }

    const premiumRoutes = ['/premium', '/advanced-analytics', '/priority-support']
    const isPremiumRoute = premiumRoutes.some(route => pathname.startsWith(withBase(route)))
    if (isPremiumRoute && !['ADMIN', 'PREMIUM'].includes(token?.role as string)) {
      return NextResponse.redirect(new URL(withBase('/dashboard?error=upgrade-required'), req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
        const pathname = req.nextUrl.pathname
        const withBase = (p: string) => `${basePath}${p}`

        const isPublicRoute = [
          '/', '/features', '/pricing', '/about', '/contact', '/terms', '/privacy',
          '/auth/signin', '/auth/register', '/auth/signup', '/auth/error', '/auth/verify-request', '/auth/verify-email',
        ].some(p => pathname === withBase(p)) || pathname.startsWith(withBase('/shared'))

        if (pathname.startsWith(withBase('/api/')) || pathname.startsWith('/api/')) return true
        if (isPublicRoute) return true
        return !!token
      },
    },
  }
)

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public|.*\\..*).*)'
  ],
} 