/**
 * React hook for receiving real-time webhook events via SSE
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { WebhookBroadcastMessage } from '@/types/webhooks'

export interface UseWebhookEventsOptions {
  enabled?: boolean
  onProjectUpdate?: (message: WebhookBroadcastMessage) => void
  onIssueUpdate?: (message: WebhookBroadcastMessage) => void
  onAnalyticsUpdate?: (message: WebhookBroadcastMessage) => void
  onError?: (error: Error) => void
  onConnect?: () => void
  onDisconnect?: () => void
}

export interface UseWebhookEventsReturn {
  connected: boolean
  lastEvent: WebhookBroadcastMessage | null
  events: WebhookBroadcastMessage[]
  reconnect: () => void
  clearEvents: () => void
}

export function useWebhookEvents(options: UseWebhookEventsOptions = {}): UseWebhookEventsReturn {
  const {
    enabled = true,
    onProjectUpdate,
    onIssueUpdate,
    onAnalyticsUpdate,
    onError,
    onConnect,
    onDisconnect,
  } = options

  const [connected, setConnected] = useState(false)
  const [lastEvent, setLastEvent] = useState<WebhookBroadcastMessage | null>(null)
  const [events, setEvents] = useState<WebhookBroadcastMessage[]>([])
  
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)

  const basePath = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_TENANT_BASEPATH || '') 
    : ''

  const clearEvents = useCallback(() => {
    setEvents([])
    setLastEvent(null)
  }, [])

  const connect = useCallback(() => {
    // Don't connect if disabled or already connecting
    if (!enabled || eventSourceRef.current) {
      return
    }

    console.log('📡 useWebhookEvents: Connecting to SSE...')

    const url = `${basePath}/api/webhooks/events`
    const eventSource = new EventSource(url, { withCredentials: true })
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('📡 useWebhookEvents: Connected')
      setConnected(true)
      reconnectAttempts.current = 0
      onConnect?.()
    }

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Skip heartbeat messages
        if (data.type === 'heartbeat') {
          return
        }

        // Skip connection confirmation
        if (data.type === 'connected') {
          console.log('📡 useWebhookEvents: Connection confirmed')
          return
        }

        console.log('📡 useWebhookEvents: Received event:', data.type, data.eventType)

        const message = data as WebhookBroadcastMessage
        setLastEvent(message)
        setEvents(prev => [...prev.slice(-99), message]) // Keep last 100 events

        // Call appropriate callback
        switch (message.type) {
          case 'project_update':
            onProjectUpdate?.(message)
            break
          case 'issue_update':
            onIssueUpdate?.(message)
            break
          case 'analytics_update':
            onAnalyticsUpdate?.(message)
            break
        }
      } catch (error) {
        console.error('📡 useWebhookEvents: Error parsing event:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('📡 useWebhookEvents: Connection error:', error)
      setConnected(false)
      onDisconnect?.()
      
      // Clean up
      eventSource.close()
      eventSourceRef.current = null

      // Attempt reconnect with exponential backoff
      reconnectAttempts.current++
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000) // Max 30 seconds
      
      console.log(`📡 useWebhookEvents: Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`)
      
      reconnectTimeoutRef.current = setTimeout(() => {
        if (enabled) {
          connect()
        }
      }, delay)
    }
  }, [enabled, basePath, onConnect, onDisconnect, onProjectUpdate, onIssueUpdate, onAnalyticsUpdate])

  const disconnect = useCallback(() => {
    console.log('📡 useWebhookEvents: Disconnecting...')
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    setConnected(false)
    onDisconnect?.()
  }, [onDisconnect])

  const reconnect = useCallback(() => {
    disconnect()
    reconnectAttempts.current = 0
    connect()
  }, [disconnect, connect])

  // Connect/disconnect based on enabled state
  useEffect(() => {
    if (enabled) {
      connect()
    } else {
      disconnect()
    }

    return () => {
      disconnect()
    }
  }, [enabled, connect, disconnect])

  // Handle visibility change (reconnect when tab becomes visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && !eventSourceRef.current) {
        console.log('📡 useWebhookEvents: Tab visible, reconnecting...')
        reconnectAttempts.current = 0
        connect()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, connect])

  return {
    connected,
    lastEvent,
    events,
    reconnect,
    clearEvents,
  }
}

