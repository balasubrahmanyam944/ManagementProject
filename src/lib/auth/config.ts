import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { db } from '../db/database'
import { securityManager } from '../security'

// Define enums as constants
const AuditAction = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT', 
  REGISTER: 'REGISTER',
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  CONNECT_INTEGRATION: 'CONNECT_INTEGRATION',
  DISCONNECT_INTEGRATION: 'DISCONNECT_INTEGRATION',
  CREATE_PROJECT: 'CREATE_PROJECT',
  UPDATE_PROJECT: 'UPDATE_PROJECT',
  DELETE_PROJECT: 'DELETE_PROJECT',
  SYNC_DATA: 'SYNC_DATA',
  EXPORT_DATA: 'EXPORT_DATA',
  CHANGE_SUBSCRIPTION: 'CHANGE_SUBSCRIPTION',
  ADMIN_ACTION: 'ADMIN_ACTION'
} as const

type UserRole = 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER'

const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
const withBase = (p: string) => `${basePath}${p}`

export const authConfig: NextAuthOptions = {
  ...(basePath ? { basePath: withBase('/api/auth') } : {}),
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: withBase('/auth/signin'),
    signOut: withBase('/auth/signin'),
    error: withBase('/auth/error'),
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Get client IP from headers
          const clientIP = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0] || 'unknown'
          
          // Check if login is allowed using security manager
          const loginValidation = securityManager.validateLoginAttempt(credentials.email, clientIP)
          
          if (!loginValidation.allowed) {
            throw new Error(loginValidation.reason || 'Account temporarily locked')
          }

          // Find user
          const user = await db.findUserByEmail(credentials.email)

          if (!user || !user.password) {
            securityManager.recordLoginAttempt(credentials.email, false, clientIP)
            return null
          }

          // Verify password
          const isValidPassword = await bcrypt.compare(credentials.password, user.password)
          
          if (!isValidPassword) {
            securityManager.recordLoginAttempt(credentials.email, false, clientIP)
            return null
          }

          // Check if user is active
          if (!user.isActive) {
            throw new Error('Account is deactivated')
          }

          // Check email verification (only for tenants)
          const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
          const isTenant = !!basePath
          
          if (isTenant && !user.isVerified) {
            // For tenants: block login if not verified
            throw new Error('Please verify your email before logging in. Check your inbox for the verification link.')
          }

          // Record successful login
          securityManager.recordLoginAttempt(credentials.email, true, clientIP)

          // Update last login
          await db.updateUser(user._id.toString(), { lastLoginAt: new Date() })

          // Get subscription
          const subscription = await db.findSubscriptionByUserId(user._id.toString())

          // Log successful login
          await db.createAuditLog({
            userId: user._id,
              action: AuditAction.LOGIN,
              details: { provider: 'credentials', method: 'email_password' },
              ipAddress: clientIP,
              userAgent: req.headers?.['user-agent'] as string,
          })

          return {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            subscription: subscription?.type || 'FREE',
            allowedPages: user.allowedPages,
            isVerified: user.isVerified || false,
          }
        } catch (error) {
          console.error('Authentication error:', error)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Include user data in JWT token
      if (user) {
        token.role = user.role
        token.subscription = user.subscription
        token.userId = user.id
        token.allowedPages = user.allowedPages
        token.isVerified = (user as any).isVerified || false
      }

      // For existing tokens, refresh user data periodically
      if (token.userId && !user) {
        try {
          const dbUser = await db.findUserWithSubscription(token.userId as string)

          if (dbUser) {
            token.role = dbUser.role
            token.subscription = dbUser.subscription?.type || 'FREE'
            token.name = dbUser.name
            token.email = dbUser.email
            token.picture = dbUser.image
            token.allowedPages = dbUser.allowedPages
            token.isVerified = dbUser.isVerified || false
          }
        } catch (error) {
          console.error('Error refreshing user data in JWT:', error)
        }
      }

      return token
    },
    async session({ session, token }) {
      // Include additional user data in session
      if (token && session.user) {
        session.user.id = token.userId as string
        session.user.role = token.role as UserRole
        session.user.subscription = token.subscription as string
        session.user.allowedPages = token.allowedPages as string[]
        session.user.isVerified = (token.isVerified as boolean) || false
      }

      return session
    },
    async redirect({ url, baseUrl }) {
      // If url is already a full absolute URL, use it as-is (preserves the origin/port)
      try {
        const urlObj = new URL(url);
        // URL is already absolute - check if it has the correct origin
        // If it's a full URL with origin, return it as-is to preserve the port
        if (urlObj.origin && urlObj.origin !== 'null') {
          console.log('🔍 Auth Redirect: Using absolute URL as-is:', url);
          return url;
        }
      } catch {
        // URL is not absolute, continue processing
      }
      
      // For relative URLs, use baseUrl (which is the request origin) instead of env vars
      // baseUrl should be the origin of the current request (e.g., https://172.21.48.1:9005)
      const requestOrigin = baseUrl || 
                           process.env.NEXT_PUBLIC_APP_URL || 
                           process.env.APP_URL || 
                           process.env.NEXTAUTH_URL || '';
      
      // Normalize the origin (remove trailing slash)
      const normalizedOrigin = requestOrigin.replace(/\/$/, '');
      
      // Extract path from url (might be relative or absolute)
      let redirectPath = url;
      try {
        const urlObj = new URL(url);
        // If it's a full URL, extract the pathname
        redirectPath = urlObj.pathname + urlObj.search;
      } catch {
        // url is already a path, use it as-is
      }
      
      // Ensure redirectPath starts with /
      if (!redirectPath.startsWith('/')) {
        redirectPath = '/' + redirectPath;
      }
      
      // Apply basePath if needed
      const finalPath = redirectPath.startsWith(withBase('/')) ? redirectPath : withBase(redirectPath);
      
      const finalUrl = `${normalizedOrigin}${finalPath}`;
      console.log('🔍 Auth Redirect: Constructed URL:', finalUrl, { baseUrl, requestOrigin, redirectPath, finalPath });
      
      return finalUrl;
    },
  },
  events: {
    async signOut({ token }) {
      // Log logout event
      if (token?.userId) {
        await db.createAuditLog({
          userId: new (await import('mongodb')).ObjectId(token.userId as string),
            action: AuditAction.LOGOUT,
            details: { method: 'manual' },
        })
      }
    },
    async session({ token }) {
      // Update session activity
      if (token?.userId) {
        await db.updateUser(token.userId as string, { lastLoginAt: new Date() })
      }
    },
  },
  debug: process.env.NODE_ENV === 'development',
} 