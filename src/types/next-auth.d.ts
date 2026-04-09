import NextAuth from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER'
      subscription: string
      allowedPages?: string[]
      isVerified: boolean
    }
  }

  interface User {
    id: string
    email: string
    name?: string | null
    image?: string | null
    role: 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER'
    subscription: string
    allowedPages?: string[]
    isVerified: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId: string
    role: 'USER' | 'ADMIN' | 'PREMIUM' | 'MANAGER' | 'DEVELOPER' | 'TESTER'
    subscription: string
    allowedPages?: string[]
    isVerified: boolean
  }
} 