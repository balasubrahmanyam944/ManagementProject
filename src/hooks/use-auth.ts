'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export type UserRole = 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER'
export type SubscriptionType = 'FREE' | 'PRO' | 'ENTERPRISE'

export interface AuthUser {
  id: string
  email: string
  name?: string | null
  image?: string | null
  role: UserRole
  subscription: SubscriptionType
  allowedPages?: string[]
  isVerified: boolean
}

export function useAuth() {
  const { data: session, status } = useSession()
  const router = useRouter()

  const user = useMemo(() => {
    if (!session?.user) return null
    return session.user as AuthUser
  }, [session])

  const isAuthenticated = status === 'authenticated'
  const isLoading = status === 'loading'

  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
  
  // Get the current origin (protocol + host + port) from the browser
  const getOrigin = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    // Fallback for server-side
    return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || '';
  };

  const login = useCallback(async (callbackUrl?: string) => {
    const origin = getOrigin();
    await signIn(undefined, { callbackUrl: callbackUrl || `${origin}${basePath}/dashboard` })
  }, [basePath])

  const logout = useCallback(async (callbackUrl?: string) => {
    const origin = getOrigin();
    // Use absolute URL to ensure redirect stays on the same host/port
    await signOut({ callbackUrl: callbackUrl || `${origin}${basePath}/auth/signin` })
  }, [basePath])

  const hasRole = useCallback((role: UserRole | UserRole[]): boolean => {
    if (!user) return false
    const roles = Array.isArray(role) ? role : [role]
    return roles.includes(user.role)
  }, [user])

  const hasSubscription = useCallback((subscription: SubscriptionType | SubscriptionType[]): boolean => {
    if (!user) return false
    const subscriptions = Array.isArray(subscription) ? subscription : [subscription]
    return subscriptions.includes(user.subscription)
  }, [user])

  const isAdmin = useMemo(() => hasRole('ADMIN'), [hasRole])
  const isPremium = useMemo(() => hasRole(['ADMIN', 'PREMIUM']), [hasRole])
  const isManager = useMemo(() => hasRole('MANAGER'), [hasRole])
  const isDeveloper = useMemo(() => hasRole('DEVELOPER'), [hasRole])
  const isTester = useMemo(() => hasRole('TESTER'), [hasRole])
  const hasPaidSubscription = useMemo(() => hasSubscription(['PRO', 'ENTERPRISE']), [hasSubscription])

  // Role-based access helpers
  const canAccessProjectOverview = useMemo(() => {
    // Manager can see all pages, Developer and Tester cannot see Project Overview
    return hasRole(['ADMIN', 'PREMIUM', 'MANAGER']) || hasRole('USER')
  }, [hasRole])

  const canAccessAllPages = useMemo(() => {
    // Manager can see all pages, Admin and Premium can see all
    return hasRole(['ADMIN', 'PREMIUM', 'MANAGER'])
  }, [hasRole])

  const requireAuth = useCallback((redirectTo?: string) => {
    if (!isAuthenticated && !isLoading) {
      const redirect = redirectTo || '/auth/signin'
      router.push(redirect)
      return false
    }
    return true
  }, [isAuthenticated, isLoading, router])

  const requireRole = useCallback((role: UserRole | UserRole[], redirectTo?: string) => {
    if (!requireAuth()) return false
    
    if (!hasRole(role)) {
      const redirect = redirectTo || '/dashboard?error=unauthorized'
      router.push(redirect)
      return false
    }
    return true
  }, [requireAuth, hasRole, router])

  const requireSubscription = useCallback((subscription: SubscriptionType | SubscriptionType[], redirectTo?: string) => {
    if (!requireAuth()) return false
    
    if (!hasSubscription(subscription)) {
      const redirect = redirectTo || '/dashboard?error=upgrade-required'
      router.push(redirect)
      return false
    }
    return true
  }, [requireAuth, hasSubscription, router])

  return {
    user,
    isAuthenticated,
    isLoading,
    isAdmin,
    isPremium,
    isManager,
    isDeveloper,
    isTester,
    hasPaidSubscription,
    canAccessProjectOverview,
    canAccessAllPages,
    login,
    logout,
    hasRole,
    hasSubscription,
    requireAuth,
    requireRole,
    requireSubscription,
  }
}

export function useRequireAuth(redirectTo?: string) {
  const { requireAuth } = useAuth()
  
  useMemo(() => {
    requireAuth(redirectTo)
  }, [requireAuth, redirectTo])
}

export function useRequireRole(role: UserRole | UserRole[], redirectTo?: string) {
  const { requireRole } = useAuth()
  
  useMemo(() => {
    requireRole(role, redirectTo)
  }, [requireRole, role, redirectTo])
}

export function useRequireSubscription(subscription: SubscriptionType | SubscriptionType[], redirectTo?: string) {
  const { requireSubscription } = useAuth()
  
  useMemo(() => {
    requireSubscription(subscription, redirectTo)
  }, [requireSubscription, subscription, redirectTo])
} 