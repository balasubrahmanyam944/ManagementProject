import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'

export interface IntegrationStatus {
  jira: {
    connected: boolean
    integration: any
    projects: any[]
  }
  trello: {
    connected: boolean
    integration: any
    projects: any[]
  }
  testrail: {
    connected: boolean
    integration: any
    projects: any[]
  }
  slack?: {
    connected: boolean
    integration: any
    projects: any[]
  }
  total: number
  connected: number
}

export interface SlackMentions {
  mentioned: boolean
  username?: string
  userId?: string
  mentionCount?: number
}

export interface Project {
  id: string
  externalId: string
  name: string
  key?: string
  description?: string
  avatarUrl?: string
  isActive: boolean
  createdAt: string
  lastSyncAt?: string
  integrationType?: string
  projectTypeKey?: string
  analytics?: {
    totalIssues: number
    openIssues: number
    inProgressIssues: number
    doneIssues: number
    statusCounts?: Record<string, number>
    typeCounts?: Record<string, number>
    dataSource?: 'live' | 'cached'
    lastUpdated?: string
  }
  // Slack-specific fields
  mentions?: SlackMentions
}

export interface IntegrationSummary {
  totalIntegrations: number
  connectedIntegrations: number
  jiraProjects: number
  trelloProjects: number
  testrailProjects: number
}

export function useIntegrations() {
  const { data: session } = useSession()
  const [integrations, setIntegrations] = useState<IntegrationStatus | null>(null)
  const [projects, setProjects] = useState<{ jira: Project[], trello: Project[], testrail: Project[], slack?: Project[] }>({ jira: [], trello: [], testrail: [] })
  const [summary, setSummary] = useState<IntegrationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFetchedRef = useRef(false)
  const lastFetchTime = useRef<number>(0)
  const cacheValidityMs = 5 * 60 * 1000 // 5 minutes cache validity

  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''

  const fetchIntegrations = useCallback(async (forceFresh = false) => {
    console.log('🔍 USE INTEGRATIONS: fetchIntegrations called with session?.user?.id:', session?.user?.id, 'forceFresh:', forceFresh);
    if (!session?.user?.id) {
      console.log('🔍 USE INTEGRATIONS: No user session, skipping fetch');
      setLoading(false)
      return
    }

    // Check cache validity - skip fetch if cache is still valid and not forcing fresh
    const now = Date.now()
    const cacheIsValid = (now - lastFetchTime.current) < cacheValidityMs && lastFetchTime.current > 0
    
    if (!forceFresh && cacheIsValid && hasFetchedRef.current && integrations) {
      console.log('useIntegrations: Using cached data, skipping fetch (cache age:', Math.round((now - lastFetchTime.current) / 1000), 'seconds)')
      setLoading(false)
      return
    }
    
    console.log('useIntegrations: Fetching fresh data (forceFresh:', forceFresh, 'cacheIsValid:', cacheIsValid, 'hasFetched:', hasFetchedRef.current, ')')

    try {
      setLoading(true)
      setError(null)

      // Always use fast=1 for cached database data, only force fresh when explicitly requested
      // If forceFresh is true, also add forceRefresh=1 to bypass stale check and get fresh analytics
      // Get tenant ID from URL path for Nango checks
      const pathParts = typeof window !== 'undefined' ? window.location.pathname.split('/').filter(Boolean) : [];
      const tenantId = pathParts[0] || 'default';
      const url = forceFresh 
        ? `${basePath}/api/integrations/status?forceRefresh=1&tenantId=${encodeURIComponent(tenantId)}` 
        : `${basePath}/api/integrations/status?fast=1&tenantId=${encodeURIComponent(tenantId)}`
      console.log('🔍 USE INTEGRATIONS: Fetching from', url)
      console.log('🔍 USE INTEGRATIONS: Base path:', basePath);
      
      const response = await fetch(url)
      console.log('🔍 USE INTEGRATIONS: Response status:', response.status, response.ok);
      
      if (!response.ok) {
        throw new Error('Failed to fetch integrations')
      }

      const data = await response.json()
      console.log('🔍 USE INTEGRATIONS: Data fetched successfully', data);
      
      setIntegrations({
        jira: data.integrations.jira,
        trello: data.integrations.trello,
        testrail: data.integrations.testrail,
        slack: data.integrations.slack,
        total: data.summary.totalIntegrations,
        connected: data.summary.totalIntegrations,
      })
      
      setProjects({
        jira: data.projects.jira.map((p: any) => ({ ...p, analytics: p.analytics })),
        trello: data.projects.trello.map((p: any) => ({ ...p, analytics: p.analytics })),
        testrail: data.projects.testrail.map((p: any) => ({ ...p, analytics: p.analytics })),
        slack: (data.projects.slack || []).map((p: any) => ({ ...p, analytics: p.analytics })),
      })
      setSummary(data.summary)
      
      // Update cache timestamp
      lastFetchTime.current = now
      hasFetchedRef.current = true
      
      console.log('useIntegrations: Data fetched successfully', {
        jiraProjects: data.projects.jira.length,
        trelloProjects: data.projects.trello.length,
        testrailProjects: data.projects.testrail.length,
        cacheTimestamp: new Date(now).toISOString()
      })
      
    } catch (err) {
      console.error('Error fetching integrations:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch integrations')
    } finally {
      setLoading(false)
    }
  }, [session?.user?.id, cacheValidityMs, integrations, basePath])

  // Function to invalidate cache and force fresh data
  const invalidateCache = useCallback(() => {
    console.log('useIntegrations: Cache invalidated')
    lastFetchTime.current = 0
    hasFetchedRef.current = false
  }, [])

  const connectJira = async (integrationData: {
    accessToken: string
    refreshToken?: string
    expiresAt?: string
    serverUrl: string
    consumerKey?: string
    metadata?: any
  }) => {
    try {
      const response = await fetch('/api/integrations/jira/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(integrationData),
      })

      if (!response.ok) {
        throw new Error('Failed to connect Jira')
      }

      // Invalidate cache and refresh integrations data (force fresh to get new projects)
      invalidateCache()
      await fetchIntegrations(true)
      
      return await response.json()
    } catch (err) {
      console.error('Error connecting Jira:', err)
      throw err
    }
  }

  const connectTrello = async (integrationData: {
    accessToken: string
    refreshToken?: string
    expiresAt?: string
    serverUrl?: string
    consumerKey: string
    metadata?: any
  }) => {
    try {
      const response = await fetch('/api/integrations/trello/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(integrationData),
      })

      if (!response.ok) {
        throw new Error('Failed to connect Trello')
      }

      // Invalidate cache and refresh integrations data (force fresh to get new projects)
      invalidateCache()
      await fetchIntegrations(true)
      
      return await response.json()
    } catch (err) {
      console.error('Error connecting Trello:', err)
      throw err
    }
  }

  const connectTestRail = async (integrationData: {
    accessToken: string
    refreshToken?: string
    expiresAt?: string
    serverUrl: string
    consumerKey: string
    metadata?: any
  }) => {
    try {
      const response = await fetch('/api/integrations/testrail/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(integrationData),
      })

      if (!response.ok) {
        throw new Error('Failed to connect TestRail')
      }

      // Refresh integrations data
      await fetchIntegrations(true)
      
      return await response.json()
    } catch (err) {
      console.error('Error connecting TestRail:', err)
      throw err
    }
  }

  // Helper to get tenant ID from URL
  const getTenantId = () => {
    if (typeof window === 'undefined') return 'default';
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    return pathParts[0] || 'default';
  }

  const disconnectJira = async () => {
    console.log('🔌 USE INTEGRATIONS: Starting Jira disconnect process');
    console.log('🔌 USE INTEGRATIONS: Base path:', basePath);
    try {
      const tenantId = getTenantId();
      const disconnectUrl = `${basePath}/api/integrations/jira/connect?tenantId=${encodeURIComponent(tenantId)}`;
      console.log('🔌 USE INTEGRATIONS: Disconnect URL:', disconnectUrl);
      const response = await fetch(disconnectUrl, {
        method: 'DELETE',
      })
      console.log('🔌 USE INTEGRATIONS: Disconnect response status:', response.status, response.ok);

      const result = await response.json();
      console.log('🔌 USE INTEGRATIONS: Disconnect result:', result);

      if (!response.ok) {
        console.error('🔌 USE INTEGRATIONS: Disconnect failed with status:', response.status);
        throw new Error('Failed to disconnect Jira')
      }

      console.log('🔌 USE INTEGRATIONS: Jira disconnect successful, invalidating cache and refreshing');
      // Invalidate cache and force fresh data after disconnect
      invalidateCache();
      await fetchIntegrations(true);
      
      return result;
    } catch (err) {
      console.error('🔌 USE INTEGRATIONS: Error disconnecting Jira:', err)
      throw err
    }
  }

  const disconnectTrello = async () => {
    console.log('🔌 USE INTEGRATIONS: Starting Trello disconnect process');
    try {
      const tenantId = getTenantId();
      const disconnectUrl = `${basePath}/api/integrations/trello/connect?tenantId=${encodeURIComponent(tenantId)}`;
      console.log('🔌 USE INTEGRATIONS: Disconnect URL:', disconnectUrl);
      const response = await fetch(disconnectUrl, {
        method: 'DELETE',
      })

      const result = await response.json();
      console.log('🔌 USE INTEGRATIONS: Trello disconnect result:', result);

      if (!response.ok) {
        throw new Error('Failed to disconnect Trello')
      }

      // Invalidate cache and force fresh data after disconnect
      invalidateCache();
      await fetchIntegrations(true);
      
      return result;
    } catch (err) {
      console.error('Error disconnecting Trello:', err)
      throw err
    }
  }

  const disconnectTestRail = async () => {
    console.log('🔌 USE INTEGRATIONS: Starting TestRail disconnect process');
    try {
      const tenantId = getTenantId();
      const disconnectUrl = `${basePath}/api/integrations/testrail/connect?tenantId=${encodeURIComponent(tenantId)}`;
      console.log('🔌 USE INTEGRATIONS: Disconnect URL:', disconnectUrl);
      const response = await fetch(disconnectUrl, {
        method: 'DELETE',
      })

      const result = await response.json();
      console.log('🔌 USE INTEGRATIONS: TestRail disconnect result:', result);

      if (!response.ok) {
        throw new Error('Failed to disconnect TestRail')
      }

      // Invalidate cache and force fresh data after disconnect
      invalidateCache();
      await fetchIntegrations(true);
      
      return result;
    } catch (err) {
      console.error('Error disconnecting TestRail:', err)
      throw err
    }
  }

  const disconnectSlack = async () => {
    console.log('🔌 USE INTEGRATIONS: Starting Slack disconnect process');
    try {
      const tenantId = getTenantId();
      const disconnectUrl = `${basePath}/api/integrations/slack/connect?tenantId=${encodeURIComponent(tenantId)}`;
      console.log('🔌 USE INTEGRATIONS: Disconnect URL:', disconnectUrl);
      const response = await fetch(disconnectUrl, {
        method: 'DELETE',
      })

      const result = await response.json();
      console.log('🔌 USE INTEGRATIONS: Slack disconnect result:', result);

      if (!response.ok) {
        throw new Error('Failed to disconnect Slack')
      }

      // Invalidate cache and force fresh data after disconnect
      invalidateCache();
      await fetchIntegrations(true);
      
      return result;
    } catch (err) {
      console.error('Error disconnecting Slack:', err)
      throw err
    }
  }

  const syncIntegrations = async (integrationType?: 'jira' | 'trello' | 'testrail' | 'slack') => {
    console.log('🔄 USE INTEGRATIONS: Starting sync process for:', integrationType || 'all integrations');
    console.log('🔄 USE INTEGRATIONS: Base path:', basePath);
    try {
      const syncUrl = `${basePath}/api/integrations/sync`;
      console.log('🔄 USE INTEGRATIONS: Sync URL:', syncUrl);
      const response = await fetch(syncUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ integrationType }),
      })
      console.log('🔄 USE INTEGRATIONS: Sync response status:', response.status, response.ok);

      if (!response.ok) {
        console.error('🔄 USE INTEGRATIONS: Sync failed with status:', response.status);
        throw new Error('Failed to sync integrations')
      }

      const result = await response.json()
      console.log('🔄 USE INTEGRATIONS: Sync result:', result);
      
      console.log('🔄 USE INTEGRATIONS: Sync successful, invalidating cache and refreshing integrations data');
      // Invalidate cache and refresh integrations data after sync (force fresh data)
      invalidateCache()
      await fetchIntegrations(true)
      
      return result
    } catch (err) {
      console.error('🔄 USE INTEGRATIONS: Error syncing integrations:', err)
      throw err
    }
  }

  const fetchJiraBoards = async (projectKey: string) => {
    try {
      const response = await fetch(`/api/integrations/jira/boards?projectKey=${projectKey}`)
      if (!response.ok) {
        throw new Error('Failed to fetch Jira boards')
      }
      return await response.json()
    } catch (err) {
      console.error('Error fetching Jira boards:', err)
      throw err
    }
  }

  const fetchTrelloLists = async (boardId: string) => {
    try {
      const response = await fetch(`/api/integrations/trello/lists?boardId=${boardId}`)
      if (!response.ok) {
        throw new Error('Failed to fetch Trello lists')
      }
      return await response.json()
    } catch (err) {
      console.error('Error fetching Trello lists:', err)
      throw err
    }
  }

  useEffect(() => {
    console.log('useIntegrations useEffect called with session?.user?.id:', session?.user?.id);
    if (session?.user?.id && !hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchIntegrations()
    } else if (!session?.user?.id) {
      hasFetchedRef.current = false;
    }
  }, [session?.user?.id, fetchIntegrations])

  return {
    integrations,
    projects,
    summary,
    loading,
    error,
    fetchIntegrations,
    invalidateCache,
    connectJira,
    connectTrello,
    connectTestRail,
    disconnectJira,
    disconnectTrello,
    disconnectTestRail,
    disconnectSlack,
    syncIntegrations,
    fetchJiraBoards,
    fetchTrelloLists,
  }
} 