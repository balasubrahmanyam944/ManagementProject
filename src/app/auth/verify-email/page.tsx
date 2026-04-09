'use client'

import { useState, Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/use-auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Mail, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isAuthenticated } = useAuth()
  const [isResending, setIsResending] = useState(false)
  const [resendSuccess, setResendSuccess] = useState(false)
  const [resendError, setResendError] = useState('')

  const error = searchParams.get('error')
  const verified = searchParams.get('verified')
  const emailFromQuery = searchParams.get('email')

  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
  
  // Use email from query param if available, otherwise use user email from session
  const displayEmail = emailFromQuery || user?.email || ''

  // Redirect if already verified
  useEffect(() => {
    if (isAuthenticated && user?.isVerified) {
      // Note: Don't manually prepend basePath - Next.js router handles it automatically
      router.push(`/dashboard`)
    }
  }, [isAuthenticated, user, router])

  const handleResendEmail = async () => {
    const emailToResend = displayEmail || user?.email
    
    if (!emailToResend) {
      setResendError('Email not found. Please sign in again.')
      return
    }

    setIsResending(true)
    setResendError('')
    setResendSuccess(false)

    try {
      const response = await fetch(`${basePath}/api/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: emailToResend }),
      })

      const data = await response.json()

      if (response.ok) {
        setResendSuccess(true)
      } else {
        setResendError(data.error || 'Failed to resend verification email')
      }
    } catch (error) {
      console.error('Resend error:', error)
      setResendError('Failed to resend verification email. Please try again.')
    } finally {
      setIsResending(false)
    }
  }

  const getErrorMessage = (errorParam: string | null) => {
    switch (errorParam) {
      case 'invalid_token':
        return 'Invalid verification token. Please request a new verification email.'
      case 'invalid_or_expired_token':
        return 'This verification link has expired or is invalid. Please request a new verification email.'
      case 'verification_failed':
        return 'Verification failed. Please try again or request a new verification email.'
      default:
        return null
    }
  }

  const errorMessage = getErrorMessage(error)

  if (verified === 'true') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-2xl">Email Verified!</CardTitle>
            <CardDescription>
              Your email has been successfully verified. You can now access all features.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              className="w-full"
              onClick={() => router.push(`/dashboard`)}
            >
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
            <Mail className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl">Verify Your Email</CardTitle>
          <CardDescription>
            {displayEmail
              ? `We've sent a verification link to ${displayEmail}. Please check your email and click the link to verify your account.`
              : 'Please check your email for a verification link.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          {resendSuccess && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                Verification email sent! Please check your inbox.
              </AlertDescription>
            </Alert>
          )}

          {resendError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{resendError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground text-center">
              Didn't receive the email? Check your spam folder or click below to resend.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleResendEmail}
              disabled={isResending || !displayEmail}
            >
              {isResending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>
          </div>

          <div className="pt-4 border-t">
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground mb-2">
                Troubleshooting Tips
              </summary>
              <div className="space-y-2 mt-2 pl-4">
                <p>• Check your spam/junk folder</p>
                <p>• Check "Promotions" tab in Gmail</p>
                <p>• Wait a few minutes - emails can be delayed</p>
                <p>• Verify the email address is correct: <strong>{displayEmail}</strong></p>
                <p>• Check server logs for email sending errors</p>
                <p className="mt-2 text-xs">
                  <strong>Note:</strong> If emails still don't arrive, check your server console logs for email configuration errors.
                  The email service requires proper SMTP configuration or Zapier webhook setup.
                </p>
              </div>
            </details>
          </div>

          {/* <div className="pt-4 border-t">
            <p className="text-sm text-center text-muted-foreground">
              Already verified?{' '}
              <Link
                href={`${basePath}/dashboard`}
                className="text-primary hover:underline"
              >
                Go to Dashboard
              </Link>
            </p>
          </div> */}
        </CardContent>
      </Card>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}

