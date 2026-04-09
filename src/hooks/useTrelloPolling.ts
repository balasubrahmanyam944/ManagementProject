"use client";

import { useEffect, useRef } from 'react';
import { useAuth } from './use-auth';

/**
 * Hook to start Trello polling for automatic change detection
 * 
 * ⚠️ IMPORTANT: Polling is a FALLBACK mechanism.
 * 
 * Webhooks are the PRIMARY method for real-time updates. Polling should only be used when:
 * - Webhooks are not registered
 * - Webhooks are in PENDING status (Trello can't reach callback URL)
 * - Webhooks are ACTIVE but have errors
 * 
 * The polling service will automatically check webhook status and only start if needed.
 * This polls Trello every 30 seconds to detect changes made by ANY user.
 */
export function useTrelloPolling(enabled: boolean = true) {
  const { user, isAuthenticated } = useAuth();
  const hasStartedRef = useRef(false);
  const lastEnabledRef = useRef<boolean | null>(null);

  useEffect(() => {
    console.log('🔄 TRELLO POLLING HOOK: ========== EFFECT RUNNING ==========');
    console.log('🔄 TRELLO POLLING HOOK: enabled:', enabled);
    console.log('🔄 TRELLO POLLING HOOK: isAuthenticated:', isAuthenticated);
    console.log('🔄 TRELLO POLLING HOOK: userId:', user?.id);
    console.log('🔄 TRELLO POLLING HOOK: hasStarted:', hasStartedRef.current);
    console.log('🔄 TRELLO POLLING HOOK: lastEnabled:', lastEnabledRef.current);
    
    // If disabled, reset the started flag so it can start again when enabled
    if (!enabled) {
      console.log('🔄 TRELLO POLLING HOOK: ❌ Disabled, resetting started flag');
      hasStartedRef.current = false;
      lastEnabledRef.current = false;
      console.log('🔄 TRELLO POLLING HOOK: =========================================');
      return;
    }
    
    if (!isAuthenticated || !user?.id) {
      console.log('🔄 TRELLO POLLING HOOK: ❌ Not authenticated or no user ID, skipping');
      console.log('🔄 TRELLO POLLING HOOK: =========================================');
      return;
    }

    // If enabled changed from false to true, reset the started flag
    if (lastEnabledRef.current === false && enabled === true) {
      console.log('🔄 TRELLO POLLING HOOK: ✅ Enabled changed from false to true, resetting started flag');
      hasStartedRef.current = false;
    }
    
    lastEnabledRef.current = enabled;

    // Prevent duplicate polling starts
    if (hasStartedRef.current) {
      console.log('🔄 TRELLO POLLING HOOK: ⚠️ Already started, skipping');
      console.log('🔄 TRELLO POLLING HOOK: =========================================');
      return;
    }
    
    console.log('🔄 TRELLO POLLING HOOK: ✅ All checks passed, proceeding to start polling');

    // Start polling via API
    const startPolling = async () => {
      try {
        console.log('🔄 TRELLO POLLING HOOK: Starting polling...');
        
        // Get base path from window location for tenant support
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const pathParts = pathname.split('/');
        const basePath = pathParts.length > 1 && pathParts[1] && !pathParts[1].includes('.') ? `/${pathParts[1]}` : '';
        
        const url = `${basePath}/api/webhooks/trello-polling/start`;
        console.log('🔄 TRELLO POLLING HOOK: Calling:', url);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        if (response.ok) {
          const data = await response.json();
          console.log('🔄 TRELLO POLLING HOOK: ✅ Started successfully:', data);
          hasStartedRef.current = true;
        } else {
          console.error('🔄 TRELLO POLLING HOOK: ❌ Failed with status:', response.status);
          const text = await response.text();
          console.error('🔄 TRELLO POLLING HOOK: Response:', text);
        }
      } catch (error) {
        console.error('❌ TRELLO POLLING HOOK: Failed to start:', error);
      }
    };

    // Small delay to ensure auth is ready
    console.log('🔄 TRELLO POLLING HOOK: Scheduling start in 2 seconds...');
    const timer = setTimeout(startPolling, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [enabled, isAuthenticated, user?.id]);
}

