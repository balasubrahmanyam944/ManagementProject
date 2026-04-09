"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ExternalLink, Key, Mail, Globe } from 'lucide-react';
import { connectJiraApiTokenAction } from '@/app/integrations/jira-actions';

interface JiraApiTokenFormProps {
  onSuccess: () => void;
}

export function JiraApiTokenForm({ onSuccess }: JiraApiTokenFormProps) {
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    setError(null);

    try {
      const result = await connectJiraApiTokenAction(email, apiToken, siteUrl);
      
      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || result.message);
      }
    } catch (error: any) {
      setError(error.message || 'An unexpected error occurred');
    } finally {
      setIsConnecting(false);
    }
  };

  const openJiraTokenPage = () => {
    window.open('https://id.atlassian.com/manage-profile/security/api-tokens', '_blank');
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Key className="h-5 w-5" />
          <span>Connect with API Token</span>
        </CardTitle>
        <CardDescription>
          Use your Jira email and API token to connect (simpler than OAuth)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center space-x-2">
              <Mail className="h-4 w-4" />
              <span>Email Address</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="your-email@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {/* API Token */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="apiToken" className="flex items-center space-x-2">
                <Key className="h-4 w-4" />
                <span>API Token</span>
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openJiraTokenPage}
                className="text-xs"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Get Token
              </Button>
            </div>
            <Input
              id="apiToken"
              type="password"
              placeholder="Your Jira API token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              required
            />
          </div>

          {/* Site URL */}
          <div className="space-y-2">
            <Label htmlFor="siteUrl" className="flex items-center space-x-2">
              <Globe className="h-4 w-4" />
              <span>Jira Site URL</span>
            </Label>
            <Input
              id="siteUrl"
              type="url"
              placeholder="https://yourcompany.atlassian.net"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              required
            />
          </div>

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            disabled={isConnecting || !email || !apiToken || !siteUrl}
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect to Jira'
            )}
          </Button>
        </form>

        {/* Instructions */}
        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">How to get your API token:</h4>
          <ol className="text-xs text-muted-foreground space-y-1">
            <li>1. Click "Get Token" button above</li>
            <li>2. Log in to your Atlassian account</li>
            <li>3. Click "Create API token"</li>
            <li>4. Give it a name (e.g., "UPMY Integration")</li>
            <li>5. Copy the token and paste it here</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
} 