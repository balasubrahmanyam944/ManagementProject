'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, UserPlus, AlertCircle, CheckCircle, Sparkles, ArrowLeft, Shield, Activity, AlertTriangle } from 'lucide-react'

type UserRole = 'MANAGER' | 'TESTER' | 'DEVELOPER'

interface SignUpForm {
  name: string
  email: string
  password: string
  confirmPassword: string
  role: UserRole
}

export default function SignUpPage() {
  const router = useRouter()
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState<SignUpForm>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'DEVELOPER'
  })
  const [errors, setErrors] = useState<Partial<SignUpForm>>({})
  const [success, setSuccess] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Partial<SignUpForm> = {}

    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters'
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    } else {
      // Enforce tenant domain match: <name>@<tenant>.com
      const tenant = (process.env.NEXT_PUBLIC_TENANT_BASEPATH || '').replace(/^\//, '')
      if (tenant) {
        const expectedDomain = `${tenant}.com`
        const actualDomain = formData.email.split('@')[1]?.toLowerCase() || ''
        if (actualDomain !== expectedDomain) {
          newErrors.email = `Email must be of the form <name>@${tenant}.com`
        }
      }
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    } else if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(formData.password)) {
      newErrors.password = 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }

    // Confirm password validation
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your password'
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setErrors({})

    try {
      const response = await fetch(`${basePath}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name.trim(),
          email: formData.email.toLowerCase(),
          password: formData.password,
          role: formData.role,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.error === 'User already exists') {
          setErrors({ email: 'An account with this email already exists' })
        } else {
          setErrors({ email: data.error || 'Failed to create account' })
        }
        return
      }

      // Check if user needs email verification (for tenants)
      const isTenant = !!basePath
      const needsVerification = isTenant && !data.user?.isVerified

      if (needsVerification) {
        // For tenants: redirect to verify-email page
        // Note: Don't manually prepend basePath - Next.js router handles it automatically
        router.push(`/auth/verify-email?email=${encodeURIComponent(formData.email.toLowerCase())}`)
        return
      }

      // For parent app or already verified: auto sign in
      setSuccess(true)
      
      const signInResult = await signIn('credentials', {
        email: formData.email.toLowerCase(),
        password: formData.password,
        redirect: false,
      })

      if (signInResult?.error) {
        // If auto sign-in fails, redirect to sign-in page with message
        router.push(`/auth/signin?message=Account created successfully! Please sign in.`)
      } else if (signInResult?.ok) {
        // If auto sign-in succeeds, redirect to dashboard
        router.push(`/dashboard`)
      }

    } catch (error) {
      console.error('Registration error:', error)
      setErrors({ email: 'Something went wrong. Please try again.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (field: keyof SignUpForm, value: string) => {
    // Trim spaces for email, remove all spaces for password fields
    let sanitizedValue = value
    if (field === 'email') {
      sanitizedValue = value.replace(/\s/g, '')
    } else if (field === 'password' || field === 'confirmPassword') {
      sanitizedValue = value.replace(/\s/g, '')
    }
    
    setFormData(prev => ({ ...prev, [field]: sanitizedValue }))
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'MANAGER':
        return <Shield className="h-4 w-4" />
      case 'TESTER':
        return <AlertTriangle className="h-4 w-4" />
      case 'DEVELOPER':
        return <Activity className="h-4 w-4" />
      default:
        return null
    }
  }

  const getRoleDescription = (role: UserRole) => {
    switch (role) {
      case 'MANAGER':
        return 'Manage projects, view analytics, and oversee team performance'
      case 'TESTER':
        return 'Create and manage test cases, track testing progress'
      case 'DEVELOPER':
        return 'View project details, track development progress'
      default:
        return ''
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 gradient-mesh" />
        <Card className="w-full max-w-md mx-auto shadow-elevated relative backdrop-blur-sm bg-card/95 animate-scale-in">
          <CardContent className="pt-10 pb-8 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30">
              <CheckCircle className="h-10 w-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Account Created!</h2>
            <p className="text-muted-foreground mb-6">
              Signing you in automatically...
            </p>
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Please wait...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 gradient-mesh" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
      
      {/* Floating orbs */}
      <div className="absolute top-1/4 right-1/4 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-1.5s' }} />
      
      <Card className="w-full max-w-md mx-auto shadow-elevated relative backdrop-blur-sm bg-card/95 border-border/50 animate-scale-in">
        <CardHeader className="space-y-1 text-center pb-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
            <UserPlus className="h-7 w-7 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold">Create Account</CardTitle>
          <CardDescription className="text-base">
            Join <span className="text-gradient font-semibold">UPMY</span> and start managing your projects
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your full name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                required
                disabled={isLoading}
                className="h-11 px-4 bg-muted/50 border-border/50 focus:bg-background transition-colors"
              />
              {errors.name && (
                <p className="text-sm text-red-500 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.name}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email address"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                onKeyDown={(e) => e.key === ' ' && e.preventDefault()}
                onPaste={(e) => {
                  e.preventDefault();
                  const pastedText = e.clipboardData.getData('text').replace(/\s/g, '');
                  handleInputChange('email', pastedText);
                }}
                required
                disabled={isLoading}
                className="h-11 px-4 bg-muted/50 border-border/50 focus:bg-background transition-colors"
              />
              {errors.email && (
                <p className="text-sm text-red-500 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.email}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create password"
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  onKeyDown={(e) => e.key === ' ' && e.preventDefault()}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pastedText = e.clipboardData.getData('text').replace(/\s/g, '');
                    handleInputChange('password', pastedText);
                  }}
                  required
                  disabled={isLoading}
                  className="h-11 px-4 bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
                {errors.password && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium">Confirm</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                  onKeyDown={(e) => e.key === ' ' && e.preventDefault()}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pastedText = e.clipboardData.getData('text').replace(/\s/g, '');
                    handleInputChange('confirmPassword', pastedText);
                  }}
                  required
                  disabled={isLoading}
                  className="h-11 px-4 bg-muted/50 border-border/50 focus:bg-background transition-colors"
                />
                {errors.confirmPassword && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                    {errors.confirmPassword}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role" className="text-sm font-medium">Select Your Role</Label>
              <Select
                value={formData.role}
                onValueChange={(value: UserRole) => handleInputChange('role', value)}
                disabled={isLoading}
              >
                <SelectTrigger className="h-11 bg-muted/50 border-border/50 focus:bg-background">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANAGER" className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
                        <Shield className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <span className="font-medium">Manager</span>
                        <p className="text-xs text-muted-foreground">Manage projects and teams</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="TESTER" className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center">
                        <AlertTriangle className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <span className="font-medium">Tester</span>
                        <p className="text-xs text-muted-foreground">Create and manage test cases</p>
                      </div>
                    </div>
                  </SelectItem>
                  <SelectItem value="DEVELOPER" className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                        <Activity className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <span className="font-medium">Developer</span>
                        <p className="text-xs text-muted-foreground">Track development progress</p>
                      </div>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              {formData.role && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                  <Sparkles className="h-3 w-3 text-primary" />
                  {getRoleDescription(formData.role)}
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-purple-500 hover:opacity-90 transition-opacity mt-2" 
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <UserPlus className="mr-2 h-5 w-5" />
              )}
              Create Account
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center pt-2">
            By creating an account, you agree to our{' '}
            <Link href="/terms" className="text-primary hover:underline">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="text-primary hover:underline">
              Privacy Policy
            </Link>
          </p>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4 pt-2">
          <Separator />
          <div className="text-sm text-muted-foreground text-center">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-primary font-semibold hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="h-3.5 w-3.5" /> Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
