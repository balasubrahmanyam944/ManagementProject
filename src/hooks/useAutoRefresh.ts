"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useWebhookContextOptional } from '@/contexts/WebhookContext';

type IntegrationType = 'JIRA' | 'TRELLO' | 'TESTRAIL' | 'SLACK';

interface UseAutoRefreshOptions {
  // Which integration types to listen for
  integrationTypes: IntegrationType[];
  
  // Callback to refresh data
  onRefresh: () => void | Promise<void>;
  
  // Optional: filter by project ID
  projectId?: string;
  
  // Debounce refresh calls (ms)
  debounceMs?: number;
  
  // Show loading state during refresh
  showLoading?: boolean;
  
  // Enable/disable auto refresh
  enabled?: boolean;
}

interface UseAutoRefreshReturn {
  // Whether a webhook-triggered refresh is in progress
  refreshing: boolean;
  
  // Last refresh timestamp
  lastRefreshedAt: Date | null;
  
  // Count of webhook-triggered refreshes
  refreshCount: number;
  
  // Manual trigger refresh
  triggerRefresh: () => void;
  
  // Whether there's recent activity for subscribed integrations
  hasActivity: boolean;
}

/**
 * Hook that automatically refreshes data when webhook events are received
 * for the specified integration types.
 * 
 * Usage:
 * ```tsx
 * const { refreshing, lastRefreshedAt } = useAutoRefresh({
 *   integrationTypes: ['JIRA', 'TRELLO'],
 *   onRefresh: fetchProjectData,
 *   projectId: 'PROJECT-123',
 *   debounceMs: 2000,
 * });
 * ```
 */
export function useAutoRefresh({
  integrationTypes,
  onRefresh,
  projectId,
  debounceMs = 2000,
  showLoading = true,
  enabled = true,
}: UseAutoRefreshOptions): UseAutoRefreshReturn {
  const pathname = usePathname();
  
  // Check if we're on a page that should auto-refresh
  // Only refresh on project overview or project details pages
  // This prevents errors when webhook events arrive while on other pages
  const shouldAutoRefresh = useCallback(() => {
    if (!pathname) return false;
    
    // Match both tenant and non-tenant routes:
    // - /project-overview or /[tenant]/project-overview
    // - /project/[id] or /[tenant]/project/[id]
    const isProjectOverview = pathname.includes('/project-overview');
    const isProjectDetails = pathname.includes('/project/') && !pathname.includes('/project-overview');
    
    return isProjectOverview || isProjectDetails;
  }, [pathname]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [hasActivity, setHasActivity] = useState(false);
  
  const webhookContext = useWebhookContextOptional();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Keep onRefresh ref updated
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  // Perform the refresh
  const performRefresh = useCallback(async () => {
    console.log('🔄 useAutoRefresh: ========== PERFORMING REFRESH ==========');
    
    // Check if we're on a page that should auto-refresh
    if (!shouldAutoRefresh()) {
      console.log('🔄 useAutoRefresh: ⏭️ Skipping refresh - not on project overview or project details page');
      console.log('🔄 useAutoRefresh: Current pathname:', pathname);
      console.log('🔄 useAutoRefresh: Notifications will still be shown');
      console.log('🔄 useAutoRefresh: =========================================');
      return;
    }
    
    console.log('🔄 useAutoRefresh: ✅ On project page, proceeding with refresh');
    console.log('🔄 useAutoRefresh: Current pathname:', pathname);
    
    if (!onRefreshRef.current) {
      console.error('🔄 useAutoRefresh: ❌ onRefresh callback is not available!');
      return;
    }
    
    console.log('🔄 useAutoRefresh: onRefresh callback exists, calling...');
    
    if (showLoading) {
      setRefreshing(true);
    }
    
    try {
      const refreshStartTime = Date.now();
      console.log('🔄 useAutoRefresh: Executing onRefresh callback...');
      await onRefreshRef.current();
      const refreshDuration = Date.now() - refreshStartTime;
      setLastRefreshedAt(new Date());
      setRefreshCount(prev => prev + 1);
      console.log(`🔄 useAutoRefresh: ✅ Refresh completed in ${refreshDuration}ms`);
    } catch (error) {
      console.error('🔄 useAutoRefresh: ❌ Auto-refresh failed:', error);
      if (error instanceof Error) {
        console.error('🔄 useAutoRefresh: Error message:', error.message);
        console.error('🔄 useAutoRefresh: Error stack:', error.stack);
      }
    } finally {
      if (showLoading) {
        setRefreshing(false);
      }
      console.log('🔄 useAutoRefresh: =========================================');
    }
  }, [showLoading, shouldAutoRefresh, pathname]);

  // Debounced refresh - use ref to ensure latest version is always used
  const debouncedRefreshRef = useRef<() => void>();
  
  // Update ref when dependencies change
  useEffect(() => {
    debouncedRefreshRef.current = () => {
      // Clear any pending refresh
      if (debounceRef.current) {
        console.log('🔄 useAutoRefresh: Clearing previous debounced refresh');
        clearTimeout(debounceRef.current);
      }
      
      console.log(`🔄 useAutoRefresh: Scheduling debounced refresh in ${debounceMs}ms`);
      // Schedule new refresh
      debounceRef.current = setTimeout(() => {
        console.log('🔄 useAutoRefresh: Debounce timeout expired, executing refresh');
        performRefresh();
      }, debounceMs);
    };
  }, [performRefresh, debounceMs]);
  
  const debouncedRefresh = useCallback(() => {
    if (debouncedRefreshRef.current) {
      debouncedRefreshRef.current();
    } else {
      console.error('🔄 useAutoRefresh: ❌ debouncedRefreshRef.current is not set!');
    }
  }, []);

  // Manual trigger
  const triggerRefresh = useCallback(() => {
    // Clear debounce and refresh immediately
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    performRefresh();
  }, [performRefresh]);

  // Memoize integration types to prevent unnecessary re-subscriptions
  const integrationTypesKey = integrationTypes.sort().join(',');
  
  // Track subscription state
  const subscriptionRef = useRef<(() => void) | null>(null);
  const subscribedConfigRef = useRef<{ integrationTypesKey: string; projectId: string | undefined } | null>(null);
  
  // Subscribe to webhook events
  useEffect(() => {
    if (!webhookContext || !enabled) {
      console.log('🔄 useAutoRefresh: Skipping subscription - webhookContext:', !!webhookContext, 'enabled:', enabled);
      return;
    }

    // Check if config changed
    const currentConfig = { integrationTypesKey, projectId };
    const previousConfig = subscribedConfigRef.current;
    const configChanged = !previousConfig || 
      previousConfig.integrationTypesKey !== integrationTypesKey ||
      previousConfig.projectId !== projectId;

    // If already subscribed with same config, don't resubscribe
    if (subscriptionRef.current && !configChanged) {
      console.log('🔄 useAutoRefresh: ⚠️ Already subscribed with same config, skipping duplicate subscription');
      return;
    }

    // If config changed, clean up old subscription first
    if (subscriptionRef.current && configChanged) {
      console.log('🔄 useAutoRefresh: ⚠️ Config changed, cleaning up old subscription');
      console.log('🔄 useAutoRefresh: Old config:', previousConfig);
      console.log('🔄 useAutoRefresh: New config:', currentConfig);
      subscriptionRef.current();
      subscriptionRef.current = null;
      subscribedConfigRef.current = null;
    }

    console.log('🔄 useAutoRefresh: ========== SETTING UP SUBSCRIPTION ==========');
    console.log('🔄 useAutoRefresh: Subscribing to', integrationTypesKey, 'events', projectId ? `for project ${projectId}` : '');
    console.log('🔄 useAutoRefresh: Integration types:', integrationTypes);
    console.log('🔄 useAutoRefresh: Project ID:', projectId);

    const unsubscribe = webhookContext.subscribe(integrationTypes, (event) => {
      // Get current pathname directly (not from closure) to ensure we have the latest value
      const currentPathname = typeof window !== 'undefined' ? window.location.pathname : pathname;
      
      console.log('🔄 useAutoRefresh: ========== EVENT RECEIVED ==========');
      console.log('🔄 useAutoRefresh: Event details:', {
        type: event.type,
        integrationType: event.integrationType,
        eventProjectId: event.projectId,
        subscribedProjectId: projectId,
        eventProjectIdType: typeof event.projectId,
        subscribedProjectIdType: typeof projectId,
        currentPathname: currentPathname,
        hookPathname: pathname,
      });
      
      // FIRST: Check if we're on a page that should auto-refresh
      // This prevents errors when webhook events arrive while on other pages
      // Use currentPathname directly to avoid stale closure issues
      const isProjectOverview = currentPathname?.includes('/project-overview') || false;
      const isProjectDetails = currentPathname?.includes('/project/') && !currentPathname?.includes('/project-overview') || false;
      const shouldRefresh = isProjectOverview || isProjectDetails;
      
      if (!shouldRefresh) {
        console.log('🔄 useAutoRefresh: ⏭️ Skipping refresh - not on project overview or project details page');
        console.log('🔄 useAutoRefresh: Current pathname:', currentPathname);
        console.log('🔄 useAutoRefresh: isProjectOverview:', isProjectOverview);
        console.log('🔄 useAutoRefresh: isProjectDetails:', isProjectDetails);
        console.log('🔄 useAutoRefresh: Notifications will still be shown');
        console.log('🔄 useAutoRefresh: =========================================');
        return;
      }
      
      // SECOND: If projectId is specified, filter events
      if (projectId && event.projectId) {
        const projectIdMatch = event.projectId === projectId;
        const projectIdStringMatch = String(event.projectId) === String(projectId);
        console.log('🔄 useAutoRefresh: Project ID comparison:', {
          exactMatch: projectIdMatch,
          stringMatch: projectIdStringMatch,
          eventProjectId: `"${event.projectId}"`,
          subscribedProjectId: `"${projectId}"`,
        });
        
        if (!projectIdMatch && !projectIdStringMatch) {
          console.log('🔄 useAutoRefresh: ❌ Skipping - different project');
          console.log('🔄 useAutoRefresh: =========================================');
          return;
        }
      } else if (projectId && !event.projectId) {
        console.log('🔄 useAutoRefresh: ⚠️ Warning - subscribed to specific project but event has no projectId');
      }

      console.log('🔄 useAutoRefresh: ✅ Project matches and on correct page, triggering refresh');
      console.log('🔄 useAutoRefresh: =========================================');

      // Set activity indicator
      setHasActivity(true);
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      activityTimeoutRef.current = setTimeout(() => {
        setHasActivity(false);
      }, 5000);

      // Trigger debounced refresh - use ref directly to avoid stale closure issues
      console.log('🔄 useAutoRefresh: About to schedule debounced refresh');
      console.log('🔄 useAutoRefresh: debounceRef.current:', debounceRef.current);
      console.log('🔄 useAutoRefresh: debouncedRefreshRef.current:', !!debouncedRefreshRef.current);
      
      // Clear any pending refresh
      if (debounceRef.current) {
        console.log('🔄 useAutoRefresh: Clearing previous debounced refresh');
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      
      // Schedule new refresh directly (don't rely on callback that might be stale)
      console.log(`🔄 useAutoRefresh: Scheduling debounced refresh in ${debounceMs}ms`);
      debounceRef.current = setTimeout(() => {
        console.log('🔄 useAutoRefresh: ========== DEBOUNCE TIMEOUT EXPIRED ==========');
        console.log('🔄 useAutoRefresh: Executing refresh now...');
        
        // Use the ref to get the latest performRefresh
        if (onRefreshRef.current) {
          console.log('🔄 useAutoRefresh: onRefreshRef.current exists, calling...');
          performRefresh();
        } else {
          console.error('🔄 useAutoRefresh: ❌ onRefreshRef.current is null!');
        }
      }, debounceMs);
      
      console.log('🔄 useAutoRefresh: ✅ Debounced refresh scheduled, timeout ID:', debounceRef.current);
    });

    // Store unsubscribe function and current config
    subscriptionRef.current = unsubscribe;
    subscribedConfigRef.current = currentConfig;

    return () => {
      // React always runs cleanup before re-running the effect
      // We need to check if the config actually changed
      // The closure values (integrationTypesKey, projectId) are from the PREVIOUS render
      // The stored config (subscribedConfigRef.current) is what we subscribed to
      
      const storedConfig = subscribedConfigRef.current;
      const closureConfig = { integrationTypesKey, projectId };
      
      // If stored config matches closure config, the config hasn't changed
      // This means React is just re-running the effect (re-render), not changing config
      // In this case, we should NOT cleanup - the new effect will see the same config and skip resubscription
      if (storedConfig && 
          storedConfig.integrationTypesKey === closureConfig.integrationTypesKey &&
          storedConfig.projectId === closureConfig.projectId) {
        console.log('🔄 useAutoRefresh: ⚠️ Re-render detected, skipping cleanup (config unchanged)');
        console.log('🔄 useAutoRefresh: Stored config:', storedConfig);
        console.log('🔄 useAutoRefresh: Closure config:', closureConfig);
        // Don't cleanup - let the new effect run see the same config and skip resubscription
        return;
      }
      
      // Config changed or component unmounting - cleanup is needed
      console.log('🔄 useAutoRefresh: ========== CLEANING UP SUBSCRIPTION ==========');
      if (storedConfig) {
        console.log('🔄 useAutoRefresh: Config changed - cleaning up old subscription');
        console.log('🔄 useAutoRefresh: Old config:', storedConfig);
        console.log('🔄 useAutoRefresh: New config:', closureConfig);
      } else {
        console.log('🔄 useAutoRefresh: Component unmounting');
      }
      console.log('🔄 useAutoRefresh: Unsubscribing from', integrationTypesKey, 'events');
      
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      
      // Clear the stored config so the new effect knows to subscribe
      subscribedConfigRef.current = null;
      
      // DON'T clear debounce on cleanup - let it complete if it's already scheduled
      // The timeout will complete even if component re-renders
      
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      console.log('🔄 useAutoRefresh: ============================================');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webhookContext, enabled, integrationTypesKey, projectId]);

  return {
    refreshing,
    lastRefreshedAt,
    refreshCount,
    triggerRefresh,
    hasActivity,
  };
}

/**
 * Simple hook to check if webhook connection is active
 */
export function useWebhookStatus() {
  const webhookContext = useWebhookContextOptional();
  
  return {
    connected: webhookContext?.connected ?? false,
    connecting: webhookContext?.connecting ?? false,
    hasRecentActivity: webhookContext?.hasRecentActivity ?? false,
    reconnect: webhookContext?.reconnect ?? (() => {}),
  };
}

/**
 * Hook to get notification count and actions
 */
export function useNotifications() {
  const webhookContext = useWebhookContextOptional();
  
  return {
    unreadCount: webhookContext?.unreadCount ?? 0,
    events: webhookContext?.events ?? [],
    markAllAsRead: webhookContext?.markAllAsRead ?? (() => {}),
    markAsRead: webhookContext?.markAsRead ?? (() => {}),
    clearEvents: webhookContext?.clearEvents ?? (() => {}),
    lastEvent: webhookContext?.lastEvent ?? null,
  };
}

