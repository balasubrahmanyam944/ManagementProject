'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TestTube, CheckCircle, AlertCircle, Sparkles, ArrowRight } from 'lucide-react'
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
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-green-500/5" />
        
        <Card className="w-full max-w-md mx-auto shadow-elevated relative backdrop-blur-sm bg-card/95 border-border/50 animate-scale-in">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-500" />
          <CardContent className="pt-10 pb-8">
            <div className="text-center">
              <div className="relative mx-auto mb-6 w-20 h-20">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <TestTube className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-2">Connecting to TestRail</h2>
              <p className="text-muted-foreground">Please wait while we verify your credentials and fetch your projects...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 gradient-mesh" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-green-500/5" />
        
        <Card className="w-full max-w-md mx-auto shadow-elevated relative backdrop-blur-sm bg-card/95 border-border/50 animate-scale-in">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-500" />
          <CardContent className="pt-10 pb-8">
            <div className="text-center">
              <div className="mx-auto mb-6 w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-lg">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>
              <h2 className="text-xl font-semibold mb-2">TestRail Connected!</h2>
              <p className="text-muted-foreground">Your TestRail integration has been successfully connected. Redirecting...</p>
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
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-green-500/5" />
      
      {/* Floating orbs */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl animate-float" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-green-500/20 rounded-full blur-3xl animate-float" style={{ animationDelay: '-1.5s' }} />
      
      <Card className="w-full max-w-md mx-auto shadow-elevated relative backdrop-blur-sm bg-card/95 border-border/50 animate-scale-in">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-500" />
        <CardHeader className="text-center pb-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-500 shadow-lg">
            <TestTube className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold">Connect TestRail</CardTitle>
          <CardDescription className="text-base">
            Enter your TestRail credentials to connect your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="animate-scale-in">
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
                className="bg-muted/50"
              />
              <p className="text-sm text-muted-foreground">
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
                className="bg-muted/50"
              />
              <p className="text-sm text-muted-foreground">
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
                className="bg-muted/50"
              />
              <p className="text-sm text-muted-foreground">
                Your TestRail API key (found in My Settings → API Keys)
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500 hover:opacity-90" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Connect TestRail
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
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

          <div className="mt-6 p-4 rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/10 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-emerald-500" />
              <h4 className="font-semibold text-foreground">How to get your API Key:</h4>
            </div>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Log in to your TestRail instance</li>
              <li>Click on your profile picture → My Settings</li>
              <li>Navigate to the "API Keys" section</li>
              <li>Generate a new API key or copy your existing one</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
