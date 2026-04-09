'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'

interface AuthProviderProps {
	children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
	const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
	
	return (
		<SessionProvider 
			basePath={`${basePath}/api/auth`}
			refetchInterval={0} // Disable automatic refetching to reduce load
		>
			{children}
		</SessionProvider>
	)
} 