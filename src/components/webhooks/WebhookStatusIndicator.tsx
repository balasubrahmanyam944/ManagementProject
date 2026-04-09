"use client";

import { useWebhookContextOptional } from '@/contexts/WebhookContext';
import { Wifi, WifiOff, Activity, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface WebhookStatusIndicatorProps {
  showLabel?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Visual indicator for webhook connection status
 * Shows a pulsing dot when receiving updates
 */
export function WebhookStatusIndicator({ 
  showLabel = false, 
  className,
  size = 'sm'
}: WebhookStatusIndicatorProps) {
  const webhookContext = useWebhookContextOptional();
  
  if (!webhookContext) {
    return null;
  }

  const { connected, connecting, hasRecentActivity, reconnect } = webhookContext;

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  const iconSize = {
    sm: 12,
    md: 16,
    lg: 20,
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-2", className)}>
            <div className="relative">
              {/* Status dot */}
              <div
                className={cn(
                  sizeClasses[size],
                  "rounded-full transition-colors",
                  connected 
                    ? hasRecentActivity 
                      ? "bg-green-500" 
                      : "bg-green-400"
                    : connecting 
                      ? "bg-yellow-400" 
                      : "bg-gray-400"
                )}
              />
              
              {/* Pulse animation for activity */}
              {connected && hasRecentActivity && (
                <div
                  className={cn(
                    sizeClasses[size],
                    "absolute inset-0 rounded-full bg-green-500 animate-ping opacity-75"
                  )}
                />
              )}
              
              {/* Connecting animation */}
              {connecting && (
                <div
                  className={cn(
                    sizeClasses[size],
                    "absolute inset-0 rounded-full bg-yellow-400 animate-pulse"
                  )}
                />
              )}
            </div>
            
            {showLabel && (
              <span className="text-xs text-muted-foreground">
                {connected 
                  ? hasRecentActivity 
                    ? 'Live' 
                    : 'Connected'
                  : connecting 
                    ? 'Connecting...' 
                    : 'Disconnected'}
              </span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-sm">
            <div className="font-medium mb-1">
              {connected ? 'Real-time updates active' : 'Real-time updates inactive'}
            </div>
            <div className="text-muted-foreground text-xs">
              {connected 
                ? 'Changes from Jira/Trello will appear automatically'
                : connecting 
                  ? 'Connecting to update server...'
                  : 'Click to reconnect'}
            </div>
            {!connected && !connecting && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => {
                  reconnect();
                  // Also trigger a test event to verify connection
                  setTimeout(() => {
                    fetch(`${process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''}/api/webhooks/test`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ integrationType: 'JIRA', projectId: 'TEST' })
                    }).catch(console.error);
                  }, 2000);
                }}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Reconnect
              </Button>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact badge showing live update status
 */
export function LiveUpdateBadge({ className }: { className?: string }) {
  const webhookContext = useWebhookContextOptional();
  
  if (!webhookContext || !webhookContext.connected) {
    return null;
  }

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      className
    )}>
      <Activity className="h-3 w-3" />
      <span>Live</span>
      {webhookContext.hasRecentActivity && (
        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
}

/**
 * Button to manually refresh with webhook status indicator
 */
interface RefreshButtonProps {
  onRefresh: () => void;
  loading?: boolean;
  className?: string;
  showStatus?: boolean;
}

export function RefreshButton({ 
  onRefresh, 
  loading = false, 
  className,
  showStatus = true 
}: RefreshButtonProps) {
  const webhookContext = useWebhookContextOptional();
  const isAutoRefreshing = webhookContext?.hasRecentActivity;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showStatus && webhookContext?.connected && (
        <WebhookStatusIndicator size="sm" />
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onRefresh}
        disabled={loading || isAutoRefreshing}
      >
        <RefreshCw className={cn(
          "h-4 w-4 mr-2",
          (loading || isAutoRefreshing) && "animate-spin"
        )} />
        {isAutoRefreshing ? 'Updating...' : loading ? 'Refreshing...' : 'Refresh'}
      </Button>
    </div>
  );
}

