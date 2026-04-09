'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, TestTube, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export default function TestTestRailPage() {
  const [serverUrl, setServerUrl] = useState('')
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [errorDetails, setErrorDetails] = useState<any>(null)

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setErrorDetails(null)
    setResult(null)

    // Validate API key length - some TestRail instances provide shorter keys
    if (apiKey.length < 20) {
      setError('API key appears to be too short. Please check your TestRail API key.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/test-testrail-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          email: email.trim(),
          apiKey: apiKey.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Connection failed')
        setErrorDetails(data)
      } else {
        setResult(data)
      }
    } catch (error: any) {
      setError(error.message || 'Connection failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <TestTube className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle className="text-2xl">Test TestRail Connection</CardTitle>
          <CardDescription>
            Verify your TestRail credentials before connecting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleTest} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error}
                  {errorDetails && (
                    <div className="mt-2 text-xs">
                      <p><strong>Status:</strong> {errorDetails.status}</p>
                      <p><strong>URL:</strong> {errorDetails.url}</p>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {result && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Connection successful! Found {result.projectsCount} projects.
                </AlertDescription>
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
                Your TestRail instance URL (without trailing slash)
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
                The exact email you use to log into TestRail
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
              <div className="flex items-center space-x-2">
                <p className="text-sm text-gray-500">
                  Your TestRail API key (should be at least 20 characters)
                </p>
                {apiKey.length > 0 && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    apiKey.length >= 20 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {apiKey.length} chars
                  </span>
                )}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-blue-900 mb-2">How to get your API Key:</h4>
                <ol className="text-sm text-blue-800 space-y-1">
                  <li>1. Log in to your TestRail instance</li>
                  <li>2. Click on your profile picture → My Settings</li>
                  <li>3. Navigate to the "API Keys" section</li>
                  <li>4. Click "Generate API Key" or copy existing one</li>
                  <li>5. API keys can vary in length (20+ characters)</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-medium text-yellow-900 mb-2">Common Issues:</h4>
                <ul className="text-sm text-yellow-800 space-y-1">
                  <li>• API key too short (should be at least 20 characters)</li>
                  <li>• Wrong email address (use exact login email)</li>
                  <li>• Incorrect server URL format</li>
                  <li>• API key expired or revoked</li>
                  <li>• Server URL includes trailing slash</li>
                </ul>
              </div>
            </div>
          </div>

          {result && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-900 mb-2">Connection Successful!</h4>
              <div className="text-sm text-green-800">
                <p>Found {result.projectsCount} projects:</p>
                <ul className="mt-2 space-y-1">
                  {result.projects?.map((project: any) => (
                    <li key={project.id}>• {project.name}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 