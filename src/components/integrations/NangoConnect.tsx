'use client';

/**
 * Nango Connection Components
 * 
 * Frontend components for connecting integrations via Nango.
 * Uses tenant-scoped connection IDs for multi-tenant support.
 */

import React, { useState, useCallback, useEffect } from 'react';
import Nango from '@nangohq/frontend';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Link as LinkIcon,
  Unlink
} from 'lucide-react';

// Nango provider types
export type NangoProvider = 'jira' | 'trello' | 'slack' | 'testrail';

// Provider display information
const PROVIDER_INFO: Record<NangoProvider, {
  name: string;
  icon: string;
  color: string;
  description: string;
}> = {
  jira: {
    name: 'Jira',
    icon: '🎫',
    color: 'bg-blue-500 hover:bg-blue-600',
    description: 'Connect to Atlassian Jira for issue tracking',
  },
  trello: {
    name: 'Trello',
    icon: '📋',
    color: 'bg-sky-500 hover:bg-sky-600',
    description: 'Connect to Trello for board management',
  },
  slack: {
    name: 'Slack',
    icon: '💬',
    color: 'bg-purple-500 hover:bg-purple-600',
    description: 'Connect to Slack for team communication',
  },
  testrail: {
    name: 'TestRail',
    icon: '🧪',
    color: 'bg-green-500 hover:bg-green-600',
    description: 'Connect to TestRail for test case management',
  },
};

interface NangoConnectProps {
  provider: NangoProvider;
  tenantId: string;
  userId: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  className?: string;
  showDescription?: boolean;
}

/**
 * Get Nango frontend instance
 * 
 * For self-hosted Nango with proxy callback:
 * - The 'host' points to your LOCAL Nango server (e.g., http://localhost:3003)
 * - Nango automatically uses the proxy callback URL for OAuth flows
 * - Tokens are stored in your LOCAL PostgreSQL database
 */
import { getNangoServerUrl, getNangoPublicKey, validateNangoConfig } from '@/lib/integrations/nango-config';

function getNangoInstance(): Nango | null {
  // Validate configuration
  const validation = validateNangoConfig();
  if (!validation.valid) {
    console.error('❌ Nango Configuration Errors:');
    validation.errors.forEach(err => console.error('  -', err));
    return null;
  }
  
  const publicKey = getNangoPublicKey();
  const serverUrl = getNangoServerUrl();
  
  if (!publicKey) {
    console.error('NEXT_PUBLIC_NANGO_PUBLIC_KEY is not set');
    return null;
  }
  
  console.log('🔧 Nango: Initializing with:');
  console.log('  Server URL:', serverUrl);
  console.log('  Public Key:', publicKey.substring(0, 8) + '...');
  
  return new Nango({
    publicKey,
    host: serverUrl,
  });
}

/**
 * Generate tenant-scoped connection ID
 */
function getConnectionId(tenantId: string, userId: string): string {
  const sanitizedTenant = tenantId.replace(/[^a-zA-Z0-9_-]/g, '');
  const sanitizedUser = userId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${sanitizedTenant}_${sanitizedUser}`;
}

/**
 * NangoConnectButton - Button to connect a single integration
 */
export function NangoConnectButton({
  provider,
  tenantId,
  userId,
  onConnect,
  onDisconnect,
  onError,
  className = '',
  showDescription = false,
}: NangoConnectProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const { toast } = useToast();
  
  const providerInfo = PROVIDER_INFO[provider];
  const connectionId = getConnectionId(tenantId, userId);
  
  // Check connection status on mount
  useEffect(() => {
    checkConnectionStatus();
  }, [provider, tenantId, userId]);
  
  const checkConnectionStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const response = await fetch(
        `/api/nango/status?provider=${provider}&tenantId=${tenantId}&userId=${userId}`
      );
      const data = await response.json();
      setIsConnected(data.connected);
    } catch (error) {
      console.error('Error checking connection status:', error);
      setIsConnected(false);
    } finally {
      setIsChecking(false);
    }
  }, [provider, tenantId, userId]);
  
  const handleConnect = useCallback(async () => {
    const nango = getNangoInstance();
    if (!nango) {
      toast({
        title: 'Configuration Error',
        description: 'Nango is not configured properly.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsConnecting(true);
    
    try {
      console.log(`🔄 Nango: Connecting ${provider} for ${connectionId}`);
      
      // Open Nango OAuth popup
      const result = await nango.auth(provider, connectionId);
      
      console.log(`✅ Nango: Connected ${provider}`, result);
      
      setIsConnected(true);
      
      toast({
        title: 'Connected!',
        description: `Successfully connected to ${providerInfo.name}.`,
      });
      
      onConnect?.();
    } catch (error) {
      console.error(`❌ Nango: Connection failed for ${provider}:`, error);
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      toast({
        title: 'Connection Failed',
        description: `Failed to connect to ${providerInfo.name}: ${errorMessage}`,
        variant: 'destructive',
      });
      
      onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setIsConnecting(false);
    }
  }, [provider, connectionId, providerInfo.name, toast, onConnect, onError]);
  
  const handleDisconnect = useCallback(async () => {
    setIsConnecting(true);
    
    try {
      console.log(`🔄 Nango: Disconnecting ${provider} for ${connectionId}`);
      
      // Call backend to disconnect
      const response = await fetch('/api/nango/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          tenantId,
          userId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }
      
      console.log(`✅ Nango: Disconnected ${provider}`);
      
      setIsConnected(false);
      
      toast({
        title: 'Disconnected',
        description: `Successfully disconnected from ${providerInfo.name}.`,
      });
      
      onDisconnect?.();
    } catch (error) {
      console.error(`❌ Nango: Disconnect failed for ${provider}:`, error);
      
      toast({
        title: 'Disconnect Failed',
        description: `Failed to disconnect from ${providerInfo.name}.`,
        variant: 'destructive',
      });
      
      onError?.(error instanceof Error ? error : new Error('Disconnect failed'));
    } finally {
      setIsConnecting(false);
    }
  }, [provider, connectionId, tenantId, userId, providerInfo.name, toast, onDisconnect, onError]);
  
  if (isChecking) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Checking...</span>
      </div>
    );
  }
  
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {showDescription && (
        <p className="text-sm text-muted-foreground">{providerInfo.description}</p>
      )}
      
      <div className="flex items-center gap-3">
        {isConnected ? (
          <>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Connected</span>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isConnecting}
              className="text-red-600 border-red-200 hover:bg-red-50"
            >
              {isConnecting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Unlink className="h-4 w-4 mr-2" />
              )}
              Disconnect
            </Button>
          </>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
            className={providerInfo.color}
          >
            {isConnecting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <LinkIcon className="h-4 w-4 mr-2" />
            )}
            Connect {providerInfo.name}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * NangoIntegrationCard - Card component for integration with status
 */
interface NangoIntegrationCardProps extends NangoConnectProps {
  title?: string;
}

export function NangoIntegrationCard({
  provider,
  tenantId,
  userId,
  title,
  onConnect,
  onDisconnect,
  onError,
  className = '',
}: NangoIntegrationCardProps) {
  const providerInfo = PROVIDER_INFO[provider];
  
  return (
    <div className={`border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{providerInfo.icon}</span>
          <h3 className="font-semibold">{title || providerInfo.name}</h3>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground mb-4">
        {providerInfo.description}
      </p>
      
      <NangoConnectButton
        provider={provider}
        tenantId={tenantId}
        userId={userId}
        onConnect={onConnect}
        onDisconnect={onDisconnect}
        onError={onError}
      />
    </div>
  );
}

/**
 * NangoIntegrationsList - List of all available integrations
 */
interface NangoIntegrationsListProps {
  tenantId: string;
  userId: string;
  providers?: NangoProvider[];
  onConnect?: (provider: NangoProvider) => void;
  onDisconnect?: (provider: NangoProvider) => void;
  className?: string;
}

export function NangoIntegrationsList({
  tenantId,
  userId,
  providers = ['jira', 'trello', 'slack', 'testrail'],
  onConnect,
  onDisconnect,
  className = '',
}: NangoIntegrationsListProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`}>
      {providers.map((provider) => (
        <NangoIntegrationCard
          key={provider}
          provider={provider}
          tenantId={tenantId}
          userId={userId}
          onConnect={() => onConnect?.(provider)}
          onDisconnect={() => onDisconnect?.(provider)}
        />
      ))}
    </div>
  );
}

/**
 * Hook for managing Nango connection status
 */
export function useNangoConnection(
  provider: NangoProvider,
  tenantId: string,
  userId: string
) {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/nango/status?provider=${provider}&tenantId=${tenantId}&userId=${userId}`
      );
      const data = await response.json();
      setIsConnected(data.connected);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to check status'));
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [provider, tenantId, userId]);
  
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);
  
  const connect = useCallback(async () => {
    const nango = getNangoInstance();
    if (!nango) {
      throw new Error('Nango is not configured');
    }
    
    const connectionId = getConnectionId(tenantId, userId);
    await nango.auth(provider, connectionId);
    setIsConnected(true);
  }, [provider, tenantId, userId]);
  
  const disconnect = useCallback(async () => {
    const response = await fetch('/api/nango/disconnect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, tenantId, userId }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to disconnect');
    }
    
    setIsConnected(false);
  }, [provider, tenantId, userId]);
  
  return {
    isConnected,
    isLoading,
    error,
    connect,
    disconnect,
    refresh: checkStatus,
  };
}

export default NangoConnectButton;

