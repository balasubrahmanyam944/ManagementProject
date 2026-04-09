'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TestTube, CheckCircle, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/hooks/use-toast'

export default function TestRailTokenPage() {
  const [serverUrl, setServerUrl] = useState('')
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState<'form' | 'connecting' | 'success'>('form')
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Validate inputs
      if (!serverUrl || !email || !apiKey) {
        setError('All fields are required')
        setLoading(false)
        return
      }

      // Test the connection first
      setStep('connecting')
      
      const response = await fetch('/api/integrations/testrail/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          consumerKey: email.trim(),
          accessToken: apiKey.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect TestRail')
      }

      setStep('success')
      toast({
        title: "TestRail Connected!",
        description: "Your TestRail integration has been successfully connected.",
      })

      // Redirect back to integrations page after a short delay
      setTimeout(() => {
        router.push('/integrations')
      }, 2000)

    } catch (error: any) {
      setError(error.message || 'Failed to connect TestRail')
      setStep('form')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'connecting') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Connecting to TestRail</h2>
              <p className="text-gray-600">Please wait while we verify your credentials and fetch your projects...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">TestRail Connected!</h2>
              <p className="text-gray-600">Your TestRail integration has been successfully connected. Redirecting...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <TestTube className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Connect TestRail</CardTitle>
          <CardDescription>
            Enter your TestRail credentials to connect your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="serverUrl">TestRail Server URL</Label>
              <Input
                id="serverUrl"
                type="url"
                placeholder="https://yourcompany.testrail.io"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                required
              />
              <p className="text-sm text-gray-500">
                Your TestRail instance URL (e.g., https://yourcompany.testrail.io)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="your-email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="text-sm text-gray-500">
                The email address you use to log into TestRail
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your TestRail API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
              />
              <p className="text-sm text-gray-500">
                Your TestRail API key (found in My Settings → API Keys)
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect TestRail'
              )}
            </Button>

            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                onClick={() => router.push('/integrations')}
                className="text-sm"
              >
                Cancel
              </Button>
            </div>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">How to get your API Key:</h4>
            <ol className="text-sm text-blue-800 space-y-1">
              <li>1. Log in to your TestRail instance</li>
              <li>2. Click on your profile picture → My Settings</li>
              <li>3. Navigate to the "API Keys" section</li>
              <li>4. Generate a new API key or copy your existing one</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 