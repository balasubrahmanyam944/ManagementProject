"use client";

import { useEffect } from 'react';
import { useAuth } from './use-auth';

/**
 * Hook to start Jira polling for automatic change detection
 * 
 * ⚠️ IMPORTANT: Polling is a FALLBACK mechanism.
 * 
 * Webhooks are the PRIMARY method for real-time updates. Polling should only be used when:
 * - Webhooks are not registered
 * - Webhooks are in PENDING status
 * - Webhooks are ACTIVE but have errors or haven't been triggered recently
 * 
 * The polling service will automatically check webhook status and only start if needed.
 * This polls Jira every 30 seconds to detect changes made by ANY user.
 */
export function useJiraPolling(enabled: boolean = true) {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!enabled || !isAuthenticated || !user?.id) {
      return;
    }

    // Start polling via API
    const startPolling = async () => {
      try {
        const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
        const response = await fetch(`${basePath}/api/webhooks/polling/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('🔄 JIRA POLLING: Started:', data);
        }
      } catch (error) {
        console.error('❌ JIRA POLLING: Failed to start:', error);
      }
    };

    // Small delay to ensure auth is ready
    const timer = setTimeout(startPolling, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [enabled, isAuthenticated, user?.id]);
}

