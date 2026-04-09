"use client";

import React, { createContext, useContext, useCallback, useEffect, useState, useRef } from 'react';
// Import useSession from next-auth/react - ensure this module is available
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import type { WebhookBroadcastMessage } from '@/types/webhooks';

// Event types for different integrations
type IntegrationType = 'JIRA' | 'TRELLO' | 'TESTRAIL' | 'SLACK';

interface WebhookEvent extends WebhookBroadcastMessage {
  id: string;
  read?: boolean;
}

interface WebhookContextValue {
  // Connection state
  connected: boolean;
  connecting: boolean;
  
  // Events
  lastEvent: WebhookEvent | null;
  events: WebhookEvent[];
  
  // Notification counts
  unreadCount: number;
  
  // Actions
  reconnect: () => void;
  clearEvents: () => void;
  markAllAsRead: () => void;
  markAsRead: (eventId: string) => void;
  deleteEvent: (eventId: string) => void;
  
  // Subscriptions - components can register callbacks for specific integrations
  subscribe: (
    integrationTypes: IntegrationType[],
    callback: (event: WebhookEvent) => void
  ) => () => void;
  
  // For showing live indicator
  hasRecentActivity: boolean;
}

const WebhookContext = createContext<WebhookContextValue | null>(null);

export function useWebhookContext() {
  const context = useContext(WebhookContext);
  if (!context) {
    throw new Error('useWebhookContext must be used within WebhookProvider');
  }
  return context;
}

// Optional hook that doesn't throw if context is missing (for optional usage)
export function useWebhookContextOptional() {
  return useContext(WebhookContext);
}

interface WebhookProviderProps {
  children: React.ReactNode;
  enabled?: boolean;
  showNotifications?: boolean;
}

export function WebhookProvider({ 
  children, 
  enabled = true,
  showNotifications = true 
}: WebhookProviderProps) {
  const pathname = usePathname();
  // Skip session fetching on shared project pages (they're public, no auth needed)
  const isSharedProjectPage = pathname?.includes('/shared/project/');
  
  // useSession will still be called (hooks must be unconditional), but we'll skip connection logic
  // Load events from localStorage on mount
  const loadEventsFromStorage = (): WebhookEvent[] => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('webhook_events');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter out events older than 24 hours
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return parsed.filter((e: WebhookEvent) => new Date(e.timestamp).getTime() > oneDayAgo);
      }
    } catch (error) {
      console.error('Error loading events from localStorage:', error);
    }
    return [];
  };

  // Load deleted event IDs from localStorage
  const loadDeletedEventIds = (): Set<string> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem('webhook_deleted_events');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter out old deletions (older than 24 hours)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const valid = parsed.filter((item: { id: string; timestamp: number }) => item.timestamp > oneDayAgo);
        return new Set(valid.map((item: { id: string }) => item.id));
      }
    } catch (error) {
      console.error('Error loading deleted events from localStorage:', error);
    }
    return new Set();
  };

  // Load cleared signatures from localStorage
  const loadClearedSignatures = (): Map<string, number> => {
    if (typeof window === 'undefined') return new Map();
    try {
      const stored = localStorage.getItem('webhook_cleared_signatures');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Filter out old cleared signatures (older than 24 hours)
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const valid = parsed.filter((item: { signature: string; timestamp: number }) => item.timestamp > oneDayAgo);
        return new Map(valid.map((item: { signature: string; timestamp: number }) => [item.signature, item.timestamp]));
      }
    } catch (error) {
      console.error('Error loading cleared signatures from localStorage:', error);
    }
    return new Map();
  };

  // Generate event signature for deduplication (must be defined before useState that uses it)
  const generateEventSignature = (data: any): string => {
    const parts: string[] = [
      data.integrationType || '',
      data.projectId || '',
      data.type || '',
      data.eventType || '', // Include eventType for more specificity
    ];

    // Add specific identifiers based on integration type
    if (data.data?.issueKey) {
      parts.push(`issue:${data.data.issueKey}`);
      if (data.data?.status) {
        parts.push(`status:${data.data.status}`);
      }
    } else if (data.data?.cardId) {
      parts.push(`card:${data.data.cardId}`);
      if (data.data?.movedTo) {
        parts.push(`list:${data.data.movedTo}`);
      }
    } else if (data.data?.cardName) {
      // Use card name as fallback, but normalize it
      const cardName = (data.data.cardName || '').trim().toLowerCase();
      parts.push(`cardname:${cardName}`);
      if (data.data?.movedTo) {
        parts.push(`list:${data.data.movedTo}`);
      }
    }

    // Round timestamp to nearest 5 minutes to prevent duplicates from rapid polling
    // This allows the same change to be deduplicated within a 5-minute window
    // but still allows legitimate updates if status changes again
    const timestamp = data.timestamp ? new Date(data.timestamp).getTime() : Date.now();
    const timestampWindow = Math.floor(timestamp / 300000); // 5-minute windows
    parts.push(`time:${timestampWindow}`);

    return parts.join('|');
  };

  const { data: session, status: sessionStatus } = useSession({ required: false });
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [lastEvent, setLastEvent] = useState<WebhookEvent | null>(null);
  const [events, setEvents] = useState<WebhookEvent[]>(() => {
    const loaded = loadEventsFromStorage();
    const deletedIds = loadDeletedEventIds();
    const clearedSigs = loadClearedSignatures();
    // Filter out events that are deleted by ID or have cleared signatures
    return loaded.filter(e => {
      if (deletedIds.has(e.id)) return false;
      const sig = generateEventSignature(e);
      const clearedTimestamp = clearedSigs.get(sig);
      if (clearedTimestamp) {
        const hoursSinceCleared = (Date.now() - clearedTimestamp) / (1000 * 60 * 60);
        if (hoursSinceCleared < 24) return false;
      }
      return true;
    });
  });
  const [hasRecentActivity, setHasRecentActivity] = useState(false);
  const eventsRef = useRef<WebhookEvent[]>([]); // Ref to track events for deduplication
  const clearedSignaturesRef = useRef<Map<string, number>>(loadClearedSignatures()); // Track cleared event signatures with timestamps
  const deletedEventIdsRef = useRef<Set<string>>(loadDeletedEventIds()); // Track deleted event IDs
  
  const { toast } = useToast();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const subscribersRef = useRef<Map<string, { types: IntegrationType[], callback: (event: WebhookEvent) => void }>>(new Map());
  const activityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionAttemptedRef = useRef(false);
  const sessionStatusRef = useRef(sessionStatus);
  const sessionUserIdRef = useRef(session?.user?.id);
  const shouldConnectRef = useRef(false);
  const connectionRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectedUserIdRef = useRef<string | null>(null);
  // Track when SSE connected to suppress toast flood from pending updates
  const recentlyConnectedRef = useRef(false);
  const recentlyConnectedTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  
  // Keep refs in sync with current values
  useEffect(() => {
    sessionStatusRef.current = sessionStatus;
    sessionUserIdRef.current = session?.user?.id;
  }, [sessionStatus, session?.user?.id]);

  // Get base path from window location for tenant support
  const getBasePath = () => {
    if (typeof window === 'undefined') return '';
    
    // Check for tenant in pathname (e.g., /gmail/, /tenant-name/)
    const pathname = window.location.pathname;
    const parts = pathname.split('/').filter(Boolean);
    
    // If first part looks like a tenant (not a known route)
    const knownRoutes = ['dashboard', 'project', 'project-overview', 'integrations', 'settings', 'admin', 'auth', 'api', 'gantt-view', 'communication-overview'];
    if (parts.length > 0 && !knownRoutes.includes(parts[0])) {
      return `/${parts[0]}`;
    }
    
    return process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
  };

  const basePath = getBasePath();

  // Generate unique event ID
  const generateEventId = () => `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Check if an event with the same signature already exists
  const isDuplicateEvent = (signature: string, existingEvents: WebhookEvent[]): boolean => {
    // First check if this signature was recently cleared (within last hour)
    const clearedTimestamp = clearedSignaturesRef.current.get(signature);
    if (clearedTimestamp) {
      const hoursSinceCleared = (Date.now() - clearedTimestamp) / (1000 * 60 * 60);
      if (hoursSinceCleared < 1) {
        console.log('📡 WebhookProvider: Event was recently cleared, skipping:', signature);
        return true; // Still within 1-hour window, skip it
      } else {
        // More than 1 hour has passed, remove from cleared list
        clearedSignaturesRef.current.delete(signature);
      }
    }

    // Then check if this signature already exists in current events
    return existingEvents.some(event => {
      const existingSignature = generateEventSignature(event);
      return existingSignature === signature;
    });
  };

  // Notify subscribers
  const notifySubscribers = useCallback((event: WebhookEvent) => {
    const subscriberCount = subscribersRef.current.size;
    console.log(`📡 WebhookProvider: Notifying ${subscriberCount} subscriber(s) for event:`, {
      type: event.type,
      integrationType: event.integrationType,
      projectId: event.projectId,
    });
    
    let notifiedCount = 0;
    subscribersRef.current.forEach((subscriber, id) => {
      const shouldNotify = subscriber.types.includes(event.integrationType as IntegrationType) || subscriber.types.length === 0;
      console.log(`📡 WebhookProvider: Subscriber ${id}: types=${subscriber.types.join(',')}, shouldNotify=${shouldNotify}`);
      
      if (shouldNotify) {
        try {
          subscriber.callback(event);
          notifiedCount++;
          console.log(`📡 WebhookProvider: ✅ Subscriber ${id} notified (${notifiedCount}/${subscriberCount})`);
        } catch (error) {
          console.error(`📡 WebhookProvider: ❌ Error in subscriber ${id} callback:`, error);
        }
      }
    });
    
    console.log(`📡 WebhookProvider: ✅ Notified ${notifiedCount} subscriber(s) out of ${subscriberCount} total`);
  }, []);

  // Show notification for webhook events
  const showEventNotification = useCallback((event: WebhookEvent) => {
    if (!showNotifications) return;

    const integrationName = event.integrationType.charAt(0) + event.integrationType.slice(1).toLowerCase();
    let title = `${integrationName} Update`;
    let description = '';

    // Build description based on event type
    switch (event.type) {
      case 'project_update':
        if (event.data?.issueKey) {
          description = `Issue ${event.data.issueKey} was updated`;
          if (event.data?.status) {
            description += ` to "${event.data.status}"`;
          }
        } else if (event.data?.cardName) {
          description = `Card "${event.data.cardName}" was updated`;
          if (event.data?.movedTo) {
            description += ` - moved to "${event.data.movedTo}"`;
          }
        } else {
          description = `Project data has been updated`;
        }
        break;
      case 'issue_update':
        description = event.data?.summary || 'An issue was updated';
        break;
      case 'analytics_update':
        description = 'Analytics data has been refreshed';
        break;
      default:
        description = 'New activity detected';
    }

    toast({
      title,
      description,
      duration: 5000,
    });
  }, [showNotifications, toast]);

  // Set recent activity indicator
  const setActivityIndicator = useCallback(() => {
    setHasRecentActivity(true);
    
    // Clear previous timeout
    if (activityTimeoutRef.current) {
      clearTimeout(activityTimeoutRef.current);
    }
    
    // Reset after 10 seconds
    activityTimeoutRef.current = setTimeout(() => {
      setHasRecentActivity(false);
    }, 10000);
  }, []);

  // Handle incoming event
  const handleEvent = useCallback((data: any) => {
    // Skip heartbeat and connection messages FIRST (before any other checks)
    // These messages don't have integrationType and would be incorrectly consumed by other checks
    if (data.type === 'heartbeat' || data.type === 'connected') {
      if (data.type === 'connected') {
        console.log('📡 WebhookProvider: SSE Connected successfully');
      }
      return;
    }

    const currentUserId = sessionUserIdRef.current;
    const connectedUserId = connectedUserIdRef.current;

    // 🚫 Ignore events from old / stale SSE connections
    if (!currentUserId || currentUserId !== connectedUserId) {
      console.log('📡 WebhookProvider: Ignoring event for stale user/session');
      return;
    }

    // Generate signature for deduplication
    const eventSignature = generateEventSignature(data);

    // Check for duplicates using the ref (which always has the latest events)
    if (isDuplicateEvent(eventSignature, eventsRef.current)) {
      console.log('📡 WebhookProvider: Duplicate event detected, skipping:', eventSignature);
      return; // Don't add duplicate
    }

    const event: WebhookEvent = {
      ...data,
      id: generateEventId(),
      read: false, // New events are unread
    };

    console.log('📡 WebhookProvider: Received new event:', event.type, event.integrationType, event.data);

    // Check if this event was previously deleted by ID
    if (deletedEventIdsRef.current.has(event.id)) {
      console.log('📡 WebhookProvider: Event was previously deleted (by ID), skipping:', event.id);
      return;
    }

    // Check if this event signature was previously cleared/deleted
    // Reuse the eventSignature from above (since event is created from data, signature is the same)
    const clearedTimestamp = clearedSignaturesRef.current.get(eventSignature);
    if (clearedTimestamp) {
      // Check if the cleared signature is still valid (within 24 hours)
      const hoursSinceCleared = (Date.now() - clearedTimestamp) / (1000 * 60 * 60);
      if (hoursSinceCleared < 24) {
        console.log('📡 WebhookProvider: Event signature was previously cleared, skipping:', eventSignature);
        // Also add this event ID to deleted IDs to prevent future checks
        deletedEventIdsRef.current.add(event.id);
        // Persist the updated deleted IDs
        try {
          const now = Date.now();
          const deletedArray = Array.from(deletedEventIdsRef.current).map(id => ({
            id,
            timestamp: now
          }));
          localStorage.setItem('webhook_deleted_events', JSON.stringify(deletedArray));
        } catch (error) {
          console.error('Error saving deleted events to localStorage:', error);
        }
        return;
      } else {
        // Clean up old cleared signature
        clearedSignaturesRef.current.delete(eventSignature);
      }
    }

    // Update events state and ref
    setEvents(prev => {
      // Filter out any events that are in the deleted list before adding new one
      const filtered = prev.filter(e => !deletedEventIdsRef.current.has(e.id));
      const updated = [...filtered.slice(-99), event]; // Keep last 100 events
      eventsRef.current = updated; // Update ref
      // Persist to localStorage
      try {
        localStorage.setItem('webhook_events', JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving events to localStorage:', error);
      }
      return updated;
    });

    // Update last event and trigger side effects
    setLastEvent(event);
    setActivityIndicator();
    
    // Only show toast notifications for live events (not pending updates on reconnect)
    // recentlyConnectedRef is true for 3 seconds after SSE connects to avoid toast flood
    if (!recentlyConnectedRef.current) {
      showEventNotification(event);
    } else {
      console.log('📡 WebhookProvider: Suppressing toast for pending update (recently connected)');
    }
    
    notifySubscribers(event);
  }, [setActivityIndicator, showEventNotification, notifySubscribers]);

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    // Use refs to get latest session status (avoids stale closures)
    const currentSessionStatus = sessionStatusRef.current;
    const currentUserId = sessionUserIdRef.current;
    
    if (!enabled) {
      console.log('📡 WebhookProvider: SSE disabled');
      return;
    }
    
    // Wait for session to be ready before connecting
    if (currentSessionStatus === 'loading') {
      console.log('📡 WebhookProvider: Session is loading, deferring connection...');
      return;
    }
    
    if (currentSessionStatus === 'unauthenticated' || !currentUserId) {
      console.log('📡 WebhookProvider: User not authenticated, skipping SSE connection');
      connectionAttemptedRef.current = false; // Reset so we can retry when authenticated
      return;
    }
    
    // Check if already connected or connecting
    if (eventSourceRef.current) {
      const readyState = eventSourceRef.current.readyState;
      if (readyState === EventSource.OPEN) {
        console.log('📡 WebhookProvider: Already connected (OPEN)');
        return;
      }
      if (readyState === EventSource.CONNECTING) {
        console.log('📡 WebhookProvider: Already connecting (CONNECTING)');
        return;
      }
      // If CLOSED, we can reconnect
      console.log('📡 WebhookProvider: Previous connection closed, reconnecting...');
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (typeof window === 'undefined') {
      console.log('📡 WebhookProvider: Window not available, skipping connection');
      return;
    }
    
    // Prevent multiple simultaneous connection attempts
    // But allow retry if previous attempt failed (CLOSED state)
    if (connectionAttemptedRef.current) {
      const currentEventSource = eventSourceRef.current;
      if (currentEventSource) {
        // Type assertion to help TypeScript understand the type
        const eventSource = currentEventSource as EventSource;
        const readyState = eventSource.readyState;
        if (readyState === EventSource.CONNECTING || readyState === EventSource.OPEN) {
          console.log('📡 WebhookProvider: Connection already attempted and active, skipping...');
          return;
        }
        // If CLOSED, reset flag to allow retry
        if (readyState === EventSource.CLOSED) {
          console.log('📡 WebhookProvider: Previous connection closed, resetting flag for retry...');
          connectionAttemptedRef.current = false;
        }
      }
    }

    connectionAttemptedRef.current = true; // Mark as attempted BEFORE creating EventSource
    setConnecting(true);
    
    // Determine the correct base path
    const currentBasePath = getBasePath();
    const url = `${currentBasePath}/api/webhooks/events`;
    
    console.log('📡 WebhookProvider: ========== ATTEMPTING SSE CONNECTION ==========');
    console.log('📡 WebhookProvider: URL:', url);
    console.log('📡 WebhookProvider: Enabled:', enabled);
    console.log('📡 WebhookProvider: Session Status:', currentSessionStatus);
    console.log('📡 WebhookProvider: User ID:', currentUserId);
    console.log('📡 WebhookProvider: Window available:', typeof window !== 'undefined');
    console.log('📡 WebhookProvider: Current pathname:', typeof window !== 'undefined' ? window.location.pathname : 'N/A');
    console.log('📡 WebhookProvider: Connection Attempted Flag:', connectionAttemptedRef.current);

    try {
      console.log('📡 WebhookProvider: Creating EventSource...');
      const eventSource = new EventSource(url, { withCredentials: true });
      eventSourceRef.current = eventSource;
      console.log('📡 WebhookProvider: ✅ EventSource created successfully');

      eventSource.onopen = () => {
        console.log('📡 WebhookProvider: ✅ SSE Connected successfully to:', url);
        console.log('📡 WebhookProvider: Connection established at:', new Date().toISOString());
      
        // 🔐 Bind SSE to current user
        connectedUserIdRef.current = sessionUserIdRef.current!;
      
        // 🧹 Clear in-memory events on fresh connection (localStorage events are preserved via refs)
        setEvents([]);
        eventsRef.current = [];
        setLastEvent(null);
      
        // 🔇 Suppress toast notifications for 3 seconds after connect
        // This prevents a flood of toasts from pending updates replayed on SSE connection
        // Events are still added to the list, just no toast popups
        recentlyConnectedRef.current = true;
        if (recentlyConnectedTimerRef.current) {
          clearTimeout(recentlyConnectedTimerRef.current);
        }
        recentlyConnectedTimerRef.current = setTimeout(() => {
          recentlyConnectedRef.current = false;
          console.log('📡 WebhookProvider: Toast notifications now active (pending updates window closed)');
        }, 3000);
      
        setConnected(true);
        setConnecting(false);
        reconnectAttempts.current = 0;
        connectionAttemptedRef.current = true;
        shouldConnectRef.current = false;
      
        if (connectionRetryTimeoutRef.current) {
          clearTimeout(connectionRetryTimeoutRef.current);
          connectionRetryTimeoutRef.current = null;
        }
      };
      
      

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Skip logging for heartbeats (they're too frequent and create noise)
          if (data.type === 'heartbeat') {
            // Only log heartbeats in debug mode or if connection seems unstable
            // For now, silently process heartbeats
            return;
          }
          
          // Log important events
          if (data.type === 'project_update' || data.type === 'issue_update') {
            console.log('📡 WebhookProvider: 📨 Received update event:', {
              type: data.type,
              integrationType: data.integrationType,
              eventType: data.eventType,
              projectId: data.projectId,
              issueKey: data.data?.issueKey,
            });
          } else {
            // Log other non-heartbeat messages
            const dataPreview = event.data.substring(0, 200);
            console.log('📡 WebhookProvider: Received SSE message:', dataPreview);
          }
          
          handleEvent(data);
        } catch (error) {
          console.error('📡 WebhookProvider: Error parsing event:', error);
        }
      };

      eventSource.onerror = (error) => {
        const readyState = eventSource.readyState;
        console.error('📡 WebhookProvider: ❌ SSE Connection error:', {
          readyState,
          readyStateText: readyState === 0 ? 'CONNECTING' : readyState === 1 ? 'OPEN' : readyState === 2 ? 'CLOSED' : 'UNKNOWN',
          error,
          sessionStatus,
          hasSession: !!session?.user?.id,
        });
        
        // Only disconnect if the connection is actually closed
        if (readyState === EventSource.CLOSED) {
          console.log('📡 WebhookProvider: Connection closed');
          setConnected(false);
          setConnecting(false);
          
          eventSource.close();
          eventSourceRef.current = null;
          connectionAttemptedRef.current = false; // Reset to allow retry

          // If session is not ready yet, wait for it before retrying
          const currentSessionStatus = sessionStatusRef.current;
          const currentUserId = sessionUserIdRef.current;
          if (currentSessionStatus !== 'authenticated' || !currentUserId) {
            console.log('📡 WebhookProvider: Session not ready, will retry when session is authenticated');
            return;
          }

          // If we should be connected, retry (the retry mechanism will handle this)
          if (shouldConnectRef.current) {
            console.log('📡 WebhookProvider: Connection closed but shouldConnect=true, retry mechanism will handle reconnection');
            // The attemptConnection function will retry
            return;
          }

          // Reconnect with exponential backoff (fallback if retry mechanism isn't active)
          reconnectAttempts.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          
          console.log(`📡 WebhookProvider: Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            // Check latest session status from refs
            if (enabled && !eventSourceRef.current && sessionStatusRef.current === 'authenticated' && sessionUserIdRef.current) {
              connectionAttemptedRef.current = false; // Reset before retry
              connect();
            }
          }, delay);
        } else if (readyState === EventSource.CONNECTING) {
          // Connection is still trying, don't disconnect yet
          console.log('📡 WebhookProvider: Connection still connecting, waiting...');
          setConnecting(true);
        }
      };
    } catch (error) {
      console.error('📡 WebhookProvider: Failed to create EventSource:', error);
      setConnecting(false);
      connectionAttemptedRef.current = false; // Reset on error to allow retry
    }
  }, [enabled, handleEvent]); // Removed sessionStatus and session?.user?.id since we use refs

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setConnected(false);
    setConnecting(false);
  }, []);

  // Aggressive connection retry mechanism - keeps trying until connected
  const attemptConnection = useCallback(() => {
    // Clear any existing retry timeout
    if (connectionRetryTimeoutRef.current) {
      clearTimeout(connectionRetryTimeoutRef.current);
      connectionRetryTimeoutRef.current = null;
    }

    if (!enabled) {
      console.log('📡 WebhookProvider: SSE disabled, not attempting connection');
      shouldConnectRef.current = false;
      return;
    }

    const currentStatus = sessionStatusRef.current;
    const currentUserId = sessionUserIdRef.current;

    // Wait for session to be ready
    if (currentStatus === 'loading') {
      console.log('📡 WebhookProvider: Session still loading, retrying in 500ms...');
      connectionRetryTimeoutRef.current = setTimeout(attemptConnection, 500);
      return;
    }

    if (currentStatus === 'unauthenticated' || !currentUserId) {
      console.log('📡 WebhookProvider: User not authenticated, stopping connection attempts');
      shouldConnectRef.current = false;
      disconnect();
      connectionAttemptedRef.current = false;
      return;
    }

    // Check if already connected
    if (eventSourceRef.current && eventSourceRef.current.readyState === EventSource.OPEN) {
      console.log('📡 WebhookProvider: ✅ Already connected!');
      shouldConnectRef.current = false;
      setConnected(true);
      return;
    }

    // If currently connecting, wait a bit
    if (eventSourceRef.current && eventSourceRef.current.readyState === EventSource.CONNECTING) {
      console.log('📡 WebhookProvider: Connection in progress, checking again in 1s...');
      connectionRetryTimeoutRef.current = setTimeout(attemptConnection, 1000);
      return;
    }

    // Reset flag if connection is closed or doesn't exist
    if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
      connectionAttemptedRef.current = false;
    }

    // Attempt connection
    console.log('📡 WebhookProvider: ========== ATTEMPTING CONNECTION ==========');
    console.log('📡 WebhookProvider: Session Status:', currentStatus);
    console.log('📡 WebhookProvider: User ID:', currentUserId);
    console.log('📡 WebhookProvider: Connection Attempted:', connectionAttemptedRef.current);
    
    connect();

    // If not connected after 2 seconds, retry
    connectionRetryTimeoutRef.current = setTimeout(() => {
      const stillConnected = eventSourceRef.current && eventSourceRef.current.readyState === EventSource.OPEN;
      if (!stillConnected && shouldConnectRef.current) {
        console.log('📡 WebhookProvider: Connection not established after 2s, retrying...');
        connectionAttemptedRef.current = false; // Reset to allow retry
        attemptConnection();
      }
    }, 2000);
  }, [enabled, connect, disconnect]);

  // Reconnect
  const reconnect = useCallback(() => {
    disconnect();
    reconnectAttempts.current = 0;
    connectionAttemptedRef.current = false; // Reset so we can retry
    shouldConnectRef.current = true; // Enable retry mechanism
    
    // Use the retry mechanism to reconnect
    if (sessionStatusRef.current === 'authenticated' && sessionUserIdRef.current) {
      attemptConnection();
    }
  }, [disconnect, attemptConnection]);

  // Clear events
  const clearEvents = useCallback(() => {
    // Before clearing, mark all current event signatures as cleared
    const now = Date.now();
    eventsRef.current.forEach(event => {
      const signature = generateEventSignature(event);
      clearedSignaturesRef.current.set(signature, now);
      // Also mark event IDs as deleted
      deletedEventIdsRef.current.add(event.id);
    });

    // Clean up old cleared signatures (older than 1 hour) to prevent memory leak
    clearedSignaturesRef.current.forEach((timestamp, signature) => {
      const hoursSinceCleared = (now - timestamp) / (1000 * 60 * 60);
      if (hoursSinceCleared >= 1) {
        clearedSignaturesRef.current.delete(signature);
      }
    });

    // Persist deleted event IDs to localStorage
    try {
      const deletedArray = Array.from(deletedEventIdsRef.current).map(id => ({
        id,
        timestamp: now
      }));
      localStorage.setItem('webhook_deleted_events', JSON.stringify(deletedArray));
      localStorage.removeItem('webhook_events');
    } catch (error) {
      console.error('Error saving deleted events to localStorage:', error);
    }

    setEvents([]);
    eventsRef.current = []; // Also clear the ref
    setLastEvent(null);
  }, []);

  // Mark all events as read
  const markAllAsRead = useCallback(() => {
    setEvents(prev => {
      // Filter out deleted events first
      const filtered = prev.filter(e => !deletedEventIdsRef.current.has(e.id));
      const updated = filtered.map(event => ({ ...event, read: true }));
      eventsRef.current = updated; // Update ref
      // Persist to localStorage
      try {
        localStorage.setItem('webhook_events', JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving events to localStorage:', error);
      }
      return updated;
    });
  }, []);

  // Mark specific event as read
  const markAsRead = useCallback((eventId: string) => {
    setEvents(prev => {
      // Filter out deleted events first
      const filtered = prev.filter(e => !deletedEventIdsRef.current.has(e.id));
      const updated = filtered.map(event => 
        event.id === eventId ? { ...event, read: true } : event
      );
      eventsRef.current = updated; // Update ref
      // Persist to localStorage
      try {
        localStorage.setItem('webhook_events', JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving events to localStorage:', error);
      }
      return updated;
    });
  }, []);

  // Delete specific event
  const deleteEvent = useCallback((eventId: string) => {
    const event = eventsRef.current.find(e => e.id === eventId);
    if (event) {
      // Mark event signature as cleared
      const signature = generateEventSignature(event);
      clearedSignaturesRef.current.set(signature, Date.now());
      // Mark event ID as deleted
      deletedEventIdsRef.current.add(eventId);
      
      // Persist deleted event IDs and cleared signatures to localStorage
      try {
        const now = Date.now();
        const deletedArray = Array.from(deletedEventIdsRef.current).map(id => ({
          id,
          timestamp: now
        }));
        localStorage.setItem('webhook_deleted_events', JSON.stringify(deletedArray));
        
        // Also persist cleared signatures
        const clearedArray = Array.from(clearedSignaturesRef.current.entries()).map(([sig, timestamp]) => ({
          signature: sig,
          timestamp
        }));
        localStorage.setItem('webhook_cleared_signatures', JSON.stringify(clearedArray));
      } catch (error) {
        console.error('Error saving deleted events to localStorage:', error);
      }
    }

    setEvents(prev => {
      const updated = prev.filter(event => event.id !== eventId);
      eventsRef.current = updated; // Update ref
      // Persist to localStorage
      try {
        localStorage.setItem('webhook_events', JSON.stringify(updated));
      } catch (error) {
        console.error('Error saving events to localStorage:', error);
      }
      return updated;
    });
  }, []);

  // Calculate unread count
  const unreadCount = events.filter(e => !e.read).length;

  // Subscribe to events
  const subscribe = useCallback((
    integrationTypes: IntegrationType[],
    callback: (event: WebhookEvent) => void
  ) => {
    const id = generateEventId();
    subscribersRef.current.set(id, { types: integrationTypes, callback });
    
    return () => {
      subscribersRef.current.delete(id);
    };
  }, []);

  // Track previous user ID to detect user changes
  const previousUserIdRef = useRef<string | undefined>(session?.user?.id);

  // Main effect: Start connection attempts when session is ready
  useEffect(() => {
    // Skip all connection logic on shared project pages (they're public, no auth/webhooks needed)
    if (isSharedProjectPage) {
      console.log('📡 WebhookProvider: Skipping connection on shared project page');
      return;
    }
    
    // Clear events when user changes (new user logged in)
    const currentUserId = session?.user?.id;
    if (previousUserIdRef.current && previousUserIdRef.current !== currentUserId) {
      console.log('📡 WebhookProvider: User changed, clearing old events');
      console.log(`   Previous user: ${previousUserIdRef.current}`);
      console.log(`   Current user: ${currentUserId}`);
      setEvents([]);
      eventsRef.current = [];
      setLastEvent(null);
      clearedSignaturesRef.current.clear();
    }
    previousUserIdRef.current = currentUserId;

    if (!enabled) {
      shouldConnectRef.current = false;
      disconnect();
      return;
    }

    if (sessionStatus === 'loading') {
      console.log('📡 WebhookProvider: Session loading, will start connection attempts when ready...');
      shouldConnectRef.current = true;
      // Start attempting after a short delay
      connectionRetryTimeoutRef.current = setTimeout(attemptConnection, 100);
      return;
    }

    if (sessionStatus === 'unauthenticated') {
      console.log('📡 WebhookProvider: User not authenticated, stopping connection attempts');
      shouldConnectRef.current = false;
      disconnect();
      connectionAttemptedRef.current = false;
      // 🔐 CLEAR SSE USER BINDING (IMPORTANT)
  connectedUserIdRef.current = null;
      // Clear events when user logs out
      setEvents([]);
      eventsRef.current = [];
      setLastEvent(null);
      clearedSignaturesRef.current.clear();
      return;
    }

    if (sessionStatus === 'authenticated' && session?.user?.id) {
      console.log('📡 WebhookProvider: ========== SESSION AUTHENTICATED, STARTING CONNECTION ==========');
      console.log('📡 WebhookProvider: User ID:', session.user.id);
      shouldConnectRef.current = true;
      attemptConnection();
    }

    // Cleanup: stop retries and disconnect
    return () => {
      shouldConnectRef.current = false;
      if (connectionRetryTimeoutRef.current) {
        clearTimeout(connectionRetryTimeoutRef.current);
        connectionRetryTimeoutRef.current = null;
      }
      
      // Only disconnect if session is actually unauthenticated or disabled
      const currentStatus = sessionStatusRef.current;
      const currentUserId = sessionUserIdRef.current;
      
      if (!enabled || currentStatus === 'unauthenticated' || !currentUserId) {
        console.log('📡 WebhookProvider: Cleanup - disconnecting (session changed or disabled)');
        disconnect();
        connectionAttemptedRef.current = false;
      }
    };
  }, [enabled, sessionStatus, session?.user?.id, attemptConnection, isSharedProjectPage, pathname]);

  // Handle visibility change and periodic reconnection check
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Check if connection is still alive
        if (enabled && sessionStatusRef.current === 'authenticated' && sessionUserIdRef.current) {
          if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
            console.log('📡 WebhookProvider: Tab visible, connection lost, restarting connection attempts...');
            reconnectAttempts.current = 0;
            shouldConnectRef.current = true;
            attemptConnection();
          } else if (eventSourceRef.current.readyState === EventSource.OPEN) {
            console.log('📡 WebhookProvider: Tab visible, connection is active');
            setConnected(true);
          }
        }
      }
    };

    // Periodic connection health check (every 30 seconds)
    const healthCheckInterval = setInterval(() => {
      if (enabled && document.visibilityState === 'visible' && sessionStatusRef.current === 'authenticated' && sessionUserIdRef.current) {
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          console.log('📡 WebhookProvider: Health check - connection lost, restarting connection attempts...');
          reconnectAttempts.current = 0;
          shouldConnectRef.current = true;
          attemptConnection();
        } else if (eventSourceRef.current.readyState === EventSource.OPEN) {
          // Connection is good, reset reconnect attempts
          reconnectAttempts.current = 0;
        }
      }
    }, 30000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(healthCheckInterval);
    };
  }, [enabled, attemptConnection]);

  // Cleanup activity timeout and recently connected timer
  useEffect(() => {
    return () => {
      if (activityTimeoutRef.current) {
        clearTimeout(activityTimeoutRef.current);
      }
      if (recentlyConnectedTimerRef.current) {
        clearTimeout(recentlyConnectedTimerRef.current);
      }
    };
  }, []);

  const value: WebhookContextValue = {
    connected,
    connecting,
    lastEvent,
    events,
    unreadCount,
    reconnect,
    clearEvents,
    markAllAsRead,
    markAsRead,
    deleteEvent,
    subscribe,
    hasRecentActivity,
  };

  return (
    <WebhookContext.Provider value={value}>
      {children}
    </WebhookContext.Provider>
  );
}

