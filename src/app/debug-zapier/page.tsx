'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react'

export default function DebugZapierPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''

  const testZapier = async () => {
    setLoading(true)
    setResult(null)

    try {
      const response = await fetch(`${basePath}/api/auth/test-zapier`)
      const data = await response.json()
      setResult(data)
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to test Zapier webhook',
      })
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = () => {
    if (!result) return null
    if (result.testResult === 'SUCCESS') return <CheckCircle className="h-5 w-5 text-green-500" />
    if (result.testResult === 'FAILED' || result.testResult === 'ERROR') return <XCircle className="h-5 w-5 text-red-500" />
    if (result.testResult === 'NOT_CONFIGURED') return <AlertCircle className="h-5 w-5 text-yellow-500" />
    return null
  }

  const getStatusColor = () => {
    if (!result) return ''
    if (result.testResult === 'SUCCESS') return 'border-green-500'
    if (result.testResult === 'FAILED' || result.testResult === 'ERROR') return 'border-red-500'
    if (result.testResult === 'NOT_CONFIGURED') return 'border-yellow-500'
    return ''
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle>Zapier Webhook Diagnostics</CardTitle>
          <CardDescription>
            Test your Zapier webhook configuration and email sending
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={testZapier} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              'Test Zapier Webhook'
            )}
          </Button>

          {result && (
            <div className={`border rounded-lg p-4 ${getStatusColor()}`}>
              <div className="flex items-center gap-2 mb-4">
                {getStatusIcon()}
                <h3 className="font-semibold">Test Results</h3>
              </div>

              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <strong>Webhook Configured:</strong>{' '}
                    {result.webhookConfigured ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-red-600">No</span>
                    )}
                  </div>
                  <div>
                    <strong>Webhook URL:</strong>{' '}
                    <code className="text-xs">{result.webhookUrl}</code>
                  </div>
                  <div>
                    <strong>Base Path:</strong> <code>{result.basePath || '(none)'}</code>
                  </div>
                  <div>
                    <strong>App URL:</strong> <code className="text-xs">{result.appUrl}</code>
                  </div>
                </div>

                {result.testResult && (
                  <div className="mt-4">
                    <strong>Test Result:</strong>{' '}
                    <span
                      className={
                        result.testResult === 'SUCCESS'
                          ? 'text-green-600'
                          : result.testResult === 'NOT_CONFIGURED'
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }
                    >
                      {result.testResult}
                    </span>
                  </div>
                )}

                {result.message && (
                  <Alert className="mt-4">
                    <AlertDescription>{result.message}</AlertDescription>
                  </Alert>
                )}

                {result.error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertDescription>
                      <strong>Error:</strong> {result.error}
                    </AlertDescription>
                  </Alert>
                )}

                {result.testPayload && (
                  <div className="mt-4">
                    <strong>Test Payload:</strong>
                    <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs overflow-auto">
                      {JSON.stringify(result.testPayload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <h3 className="font-semibold">Troubleshooting Steps:</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>
                <strong>Check Environment Variable:</strong> Make sure{' '}
                <code>ZAPIER_WEBHOOK_URL</code> is set in your <code>.env.local</code> file
              </li>
              <li>
                <strong>Check Server Logs:</strong> After signup, look for logs starting with 📧,
                📤, 📥, ✅, or ❌
              </li>
              <li>
                <strong>Verify Zapier Zap:</strong> Go to{' '}
                <a
                  href="https://zapier.com/app/zaps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Zapier Dashboard
                </a>{' '}
                and ensure your Zap is turned ON
              </li>
              <li>
                <strong>Check Zap History:</strong> In Zapier, check if webhooks are being received
              </li>
              <li>
                <strong>Test Manually:</strong> Use curl to test your webhook:
                <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                  {`curl -X POST YOUR_ZAPIER_WEBHOOK_URL \\
  -H "Content-Type: application/json" \\
  -d '{"email":"test@example.com","verify_link":"https://example.com/verify?token=test","name":"Test"}'`}
                </pre>
              </li>
              <li>
                <strong>Check Resend API:</strong> Verify your Resend API key is correct in Zapier
                and your domain is verified
              </li>
              <li>
                <strong>Check Spam Folder:</strong> Verification emails might be in spam/junk
                folder
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

