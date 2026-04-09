"use client";

import { useState, useTransition, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from 'next/navigation';
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { JiraIcon, TrelloIcon } from "@/components/icons";
import { Link as LinkIcon, Settings, Loader2, LogOut, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useAuth } from "@/hooks/use-auth";

// JiraApiTokenForm no longer needed - using OAuth flow

interface Integration {
  name: string;
  description: string;
  icon: JSX.Element;
  connected: boolean;
  category: string;
}

const initialIntegrationsData: Integration[] = [
  {
    name: "Jira",
    description: "Connect your Jira instance to sync project tasks, sprints, and issues.",
    icon: (
      <div className="w-12 h-12 rounded-xl jira-gradient flex items-center justify-center shadow-lg">
        <JiraIcon className="h-6 w-6 text-white" />
      </div>
    ),
    connected: false, 
    category: "Project Management"
  },
  {
    name: "Trello",
    description: "Link your Trello boards to track progress and visualize workflows.",
    icon: (
      <div className="w-12 h-12 rounded-xl trello-gradient flex items-center justify-center shadow-lg">
        <TrelloIcon className="h-6 w-6 text-white" />
      </div>
    ),
    connected: false,
    category: "Task Management"
  },
  {
    name: "TestRail",
    description: "Connect your TestRail instance to manage test cases and track testing progress.",
    icon: (
      <div className="w-12 h-12 rounded-xl testrail-gradient flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="white" className="h-6 w-6"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      </div>
    ),
    connected: false,
    category: "Test Management"
  },
  {
    name: "Slack",
    description: "Receive notifications and updates directly in your Slack channels.",
    icon: (
      <div className="w-12 h-12 rounded-xl slack-gradient flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="white" className="h-6 w-6"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>
      </div>
    ),
    connected: false,
    category: "Communication"
  },
  {
    name: "GitHub",
    description: "Integrate with GitHub to link commits, pull requests, and issues to tasks.",
    icon: (
      <div className="w-12 h-12 rounded-xl github-gradient flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 16 16" fill="white" className="h-6 w-6"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>
      </div>
    ),
    connected: false,
    category: "Version Control"
  },
  {
    name: "Teams",
    description: "Connect Microsoft Teams to send test cases to your channels.",
    icon: (
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6264A7] to-[#7B7FCE] flex items-center justify-center shadow-lg">
        <svg viewBox="0 0 24 24" fill="white" className="h-6 w-6"><path d="M20.625 2.25H3.375A1.125 1.125 0 002.25 3.375v17.25c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125V3.375c0-.621-.504-1.125-1.125-1.125zM14.625 16.5h-1.5v-3h-2.25v3h-1.5v-6.75h1.5v2.25h2.25v-2.25h1.5v6.75z"/></svg>
      </div>
    ),
    connected: false,
    category: "Communication"
  },
];

interface IntegrationLoadingState {
  [key: string]: boolean;
}

function IntegrationsContent() {
  const [integrations, setIntegrations] = useState<Integration[]>(initialIntegrationsData);
  const [loadingStates, setLoadingStates] = useState<IntegrationLoadingState>({});
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Get current user from session
  const { user } = useAuth();
  
  // Use the new database-driven integrations hook
  const { 
    integrations: dbIntegrations, 
    loading: integrationsLoading, 
    error: integrationsError,
    connectJira,
    connectTrello,
    connectTestRail,
    disconnectJira,
    disconnectTrello,
    disconnectTestRail,
    disconnectSlack,
    fetchIntegrations,
    syncIntegrations 
  } = useIntegrations();

  useEffect(() => {
    console.log('IntegrationsPage: Checking connection status for integrations');
    console.log('IntegrationsPage: DB integrations:', dbIntegrations);

    // Update local state based on database integrations
    setIntegrations(prev => {
      const updated = prev.map(int => {
        if (int.name === "Jira") {
          const isConnected = dbIntegrations?.jira?.connected || false;
          console.log(`IntegrationsPage: Setting Jira connected status to: ${isConnected}`, {
            dbIntegrations: dbIntegrations?.jira,
            hasJira: !!dbIntegrations?.jira,
            connected: dbIntegrations?.jira?.connected,
          });
          return { ...int, connected: isConnected };
        }
        if (int.name === "Trello") {
          const isConnected = dbIntegrations?.trello?.connected || false;
          console.log(`IntegrationsPage: Setting Trello connected status to: ${isConnected}`, {
            dbIntegrations: dbIntegrations?.trello,
            hasTrello: !!dbIntegrations?.trello,
            connected: dbIntegrations?.trello?.connected,
          });
          return { ...int, connected: isConnected };
        }
        if (int.name === "TestRail") {
          const isConnected = dbIntegrations?.testrail?.connected || false;
          console.log(`IntegrationsPage: Setting TestRail connected status to: ${isConnected}`);
          return { ...int, connected: isConnected };
        }
        if (int.name === "Slack") {
          const isConnected = dbIntegrations?.slack?.connected || false;
          console.log(`IntegrationsPage: Setting Slack connected status to: ${isConnected}`, {
            dbIntegrations: dbIntegrations?.slack,
            hasSlack: !!dbIntegrations?.slack,
            connected: dbIntegrations?.slack?.connected,
          });
          return { ...int, connected: isConnected };
        }
        return int;
      });
      
      // Always update to ensure UI reflects current state
      return updated;
    });
  }, [dbIntegrations]);

  // Check for OAuth success parameters and refresh data
  useEffect(() => {
    const trelloConnected = searchParams.get('trello_connected');
    const jiraConnected = searchParams.get('jira_connected');
    const slackConnected = searchParams.get('slack_connected');
    const slackParam = searchParams.get('slack');
    
    console.log('🔗 INTEGRATIONS PAGE: Checking OAuth return parameters:', {
      trelloConnected,
      jiraConnected,
      slackConnected,
      slackParam,
      allSearchParams: Object.fromEntries(searchParams.entries())
    });
    
    if (trelloConnected === 'true' || jiraConnected === 'true' || slackConnected === 'true' || slackParam === 'connected') {
      console.log('🔗 INTEGRATIONS PAGE: OAuth flow completed, refreshing data');
      // Refresh integrations data after OAuth flow
      if (fetchIntegrations) {
        fetchIntegrations();
      }
      
      // Show success message
      if (trelloConnected === 'true') {
        console.log('🔗 INTEGRATIONS PAGE: Showing Trello success toast');
        toast({
          title: "Trello Connected",
          description: "Trello has been successfully connected. Your boards should now appear in the project overview.",
        });
      }
      if (jiraConnected === 'true') {
        console.log('🔗 INTEGRATIONS PAGE: Showing Jira success toast');
        toast({
          title: "Jira Connected",
          description: "Jira has been successfully connected. Your projects should now appear in the project overview.",
        });
      }
      if (slackConnected === 'true' || slackParam === 'connected') {
        console.log('🔗 INTEGRATIONS PAGE: Showing Slack success toast');
        toast({
          title: "Slack Connected",
          description: "Slack has been successfully connected. Your channels should now appear in the project overview.",
        });
      }
      
      // Clean up URL parameters
      console.log('🔗 INTEGRATIONS PAGE: Cleaning up URL parameters');
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('trello_connected');
      currentUrl.searchParams.delete('jira_connected');
      currentUrl.searchParams.delete('slack_connected');
      currentUrl.searchParams.delete('slack');
      console.log('🔗 INTEGRATIONS PAGE: Cleaned URL:', currentUrl.pathname + currentUrl.search);
      router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
    }
  }, [searchParams, fetchIntegrations, toast, router]);

  // Jira error handling (unchanged)
  const jiraErrorParam = searchParams.get('jira_error');
  if (jiraErrorParam) {
    toast({
      title: "Jira Connection Error",
      description: `OAuth flow failed: ${jiraErrorParam}. Please use API Token method.`,
      variant: "destructive",
    });
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('jira_error');
    currentUrl.searchParams.delete('jira_connected');
    router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
  }

  // Slack error handling
  const slackErrorParam = searchParams.get('slack_error');
  if (slackErrorParam) {
    toast({
      title: "Error with Slack",
      description: `OAuth flow failed: ${slackErrorParam}. Please try again.`,
      variant: "destructive",
    });
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('slack_error');
    currentUrl.searchParams.delete('slack');
    currentUrl.searchParams.delete('slack_connected');
    router.replace(currentUrl.pathname + currentUrl.search, { scroll: false });
  }

  const handleConnect = async (integrationName: string) => {
    console.log('🔗 INTEGRATIONS PAGE: Starting connection process for:', integrationName);
    setLoadingStates(prev => ({ ...prev, [integrationName]: true }));
    
    try {
      // Check if user is authenticated
      if (!user?.id) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to connect integrations.',
          variant: 'destructive',
        });
        setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
        return;
      }
      
      const userId = user.id;
      
      // Get tenant and basePath from URL path or environment
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const tenantId = pathParts[0] || process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default';
      const basePath = pathParts[0] ? `/${pathParts[0]}` : (process.env.NEXT_PUBLIC_TENANT_BASEPATH || '');
      
      const integrationLower = integrationName.toLowerCase();
      
      // Use Nango for Jira, Trello, and Slack
      if (integrationLower === 'jira' || integrationLower === 'trello' || integrationLower === 'slack') {
        console.log('🔗 INTEGRATIONS PAGE: Using Nango for', integrationName);
        console.log('🔗 INTEGRATIONS PAGE: User ID:', userId, 'Tenant ID:', tenantId);
        
        const { connectIntegrationViaNango } = await import('@/lib/integrations/nango-connect-helper');
        
        try {
          // For Jira, add extra logging
          if (integrationLower === 'jira') {
            console.log('🔍 INTEGRATIONS PAGE: Starting Jira OAuth connection...');
            console.log('🔍 INTEGRATIONS PAGE: Tenant ID:', tenantId);
            console.log('🔍 INTEGRATIONS PAGE: User ID:', userId);
          }
          
          await connectIntegrationViaNango(
            integrationLower as 'jira' | 'trello' | 'slack',
            tenantId,
            userId
          );
        } catch (nangoError: any) {
          // Check if user closed the popup without completing OAuth
          if (nangoError?.message === 'POPUP_CLOSED') {
            console.log('🔗 INTEGRATIONS PAGE: User cancelled OAuth for', integrationName);
            toast({
              title: "Connection Cancelled",
              description: `${integrationName} connection was cancelled. Click Connect to try again.`,
            });
            setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
            return;
          }
          
          // Check if popup was blocked
          if (nangoError?.message === 'POPUP_BLOCKED' || nangoError?.message?.includes('blocked')) {
            console.error('🔗 INTEGRATIONS PAGE: Popup was blocked for', integrationName);
            toast({
              title: "Popup Blocked",
              description: `Please allow popups for this site and try again. Check your browser's popup blocker settings.`,
              variant: "destructive",
            });
            setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
            return;
          }
          
          // For Jira specifically, log more details
          if (integrationLower === 'jira') {
            console.error('❌ INTEGRATIONS PAGE: Jira OAuth error:', nangoError);
            console.error('❌ INTEGRATIONS PAGE: Error message:', nangoError?.message);
            console.error('❌ INTEGRATIONS PAGE: Error stack:', nangoError?.stack);
          }
          
          // Re-throw other errors
          throw nangoError;
        }
        
        // Wait a moment for Nango to complete the connection and store credentials
        console.log('⏳ INTEGRATIONS PAGE: Waiting for Nango to complete connection...');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time
        
        // Sync Nango connection to database so existing features work
        console.log('🔄 INTEGRATIONS PAGE: Syncing Nango connection to database...');
        try {
          const syncResponse = await fetch(`${basePath}/api/nango/sync-to-db`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: integrationLower }),
          });
          if (syncResponse.ok) {
            console.log('✅ INTEGRATIONS PAGE: Nango connection synced to database');
          } else {
            console.warn('⚠️ INTEGRATIONS PAGE: Failed to sync Nango connection to database');
          }
        } catch (syncError) {
          console.error('❌ INTEGRATIONS PAGE: Error syncing to database:', syncError);
        }
        
        // Force refresh integrations status to check Nango and fetch projects
        console.log('🔄 INTEGRATIONS PAGE: Refreshing integrations after Nango connection');
        
        // Check connection status directly via API (don't rely on React state in closure)
        let retries = 3;
        let connected = false;
        
        while (retries > 0 && !connected) {
          // Make a direct API call to check status (React state in closure is stale)
          try {
            const statusResponse = await fetch(`${basePath}/api/integrations/status?forceRefresh=1&tenantId=${tenantId}`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json();
              const isConnectedInApi = statusData?.integrations?.[integrationLower]?.connected === true;
              if (isConnectedInApi) {
                connected = true;
                console.log(`✅ INTEGRATIONS PAGE: ${integrationName} shows as connected via API`);
              } else {
                console.log(`⏳ INTEGRATIONS PAGE: ${integrationName} not yet showing as connected in API response`);
              }
            }
          } catch (statusError) {
            console.error(`❌ INTEGRATIONS PAGE: Error checking status:`, statusError);
          }
          
          if (!connected && retries > 1) {
            console.log(`⏳ INTEGRATIONS PAGE: Connection not detected yet, retrying... (${retries - 1} retries left)`);
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
          retries--;
        }
        
        // Final refresh to update UI state
        await fetchIntegrations(true);
        
        if (!connected) {
          console.warn(`⚠️ INTEGRATIONS PAGE: Connection for ${integrationName} not detected after retries, but continuing...`);
        }
        
        toast({
          title: `${integrationName} Connected`,
          description: `${integrationName} has been successfully connected via Nango. Projects will be fetched automatically.`,
        });
        
        setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
        return;
      }
      
      // TestRail still uses old flow (not yet migrated to Nango)
      if (integrationLower === 'testrail') {
        const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
        window.location.href = `${basePath}/integrations/testrail-oauth-simulated`;
        return;
      }
      
      toast({
        title: `Error with ${integrationName}`,
        description: "Integration not supported yet.",
        variant: "destructive",
      });
    } catch (error) {
      console.error(`Error connecting ${integrationName}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: `Error with ${integrationName}`,
        description: errorMessage.includes('not configured') 
          ? 'Integration not configured in Nango. Please configure in Nango dashboard and restart Nango server.'
          : errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
    }
  };

  const handleDisconnect = async (integrationName: string) => {
    setLoadingStates(prev => ({ ...prev, [integrationName]: true }));
    
    try {
      if (!user?.id) {
        toast({
          title: 'Authentication Required',
          description: 'Please log in to disconnect integrations.',
          variant: 'destructive',
        });
        setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
        return;
      }
      
      const userId = user.id;
      const integrationLower = integrationName.toLowerCase();
      
      // Get tenant ID from URL path
      const pathParts = window.location.pathname.split('/').filter(Boolean);
      const tenantId = pathParts[0] || process.env.NEXT_PUBLIC_TENANT_BASEPATH?.replace('/', '') || 'default';
      
      let success = false;
      
      // For Nango-connected integrations, use Nango disconnect API
      if (integrationLower === 'jira' || integrationLower === 'trello' || integrationLower === 'slack') {
        console.log(`🔌 INTEGRATIONS PAGE: Disconnecting ${integrationName} via Nango`);
        
        try {
          const basePath = pathParts[0] ? `/${pathParts[0]}` : (process.env.NEXT_PUBLIC_TENANT_BASEPATH || '');
          const response = await fetch(`${basePath}/api/nango/disconnect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider: integrationLower,
              tenantId,
              userId,
            }),
          });
          
          const data = await response.json();
          success = data.success === true;
          
          if (success) {
            console.log(`✅ INTEGRATIONS PAGE: Successfully disconnected ${integrationName} from Nango`);
          }
        } catch (nangoError) {
          console.error(`❌ INTEGRATIONS PAGE: Nango disconnect failed for ${integrationName}:`, nangoError);
          // Fall back to old disconnect methods
        }
      }
      
      // Also call old disconnect methods (for database cleanup)
      if (integrationLower === 'jira') {
        try {
          await disconnectJira();
        } catch {}
      } else if (integrationLower === 'trello') {
        try {
          await disconnectTrello();
        } catch {}
      } else if (integrationLower === 'testrail') {
        try {
          const result = await disconnectTestRail();
          success = result.success || false;
        } catch {}
      } else if (integrationLower === 'slack') {
        try {
          await disconnectSlack();
        } catch {}
      }
      
      if (success || integrationLower === 'jira' || integrationLower === 'trello' || integrationLower === 'slack') {
        setIntegrations(prev => prev.map(int =>
          int.name === integrationName ? { ...int, connected: false } : int
        ));
        toast({
          title: `${integrationName} Disconnected`,
          description: `${integrationName} has been successfully disconnected.`,
        });
      } else {
        toast({
          title: `Error with ${integrationName}`,
          description: "Failed to disconnect. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(`Error disconnecting ${integrationName}:`, error);
      toast({
        title: `Error with ${integrationName}`,
        description: "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
    }
  };

  const handleSettings = (integrationName: string) => {
    // Navigate to integration settings page
    router.push(`/integrations/${integrationName.toLowerCase()}`);
  };

  const refreshConnectionStatus = async () => {
    try {
      await fetchIntegrations();
      toast({
        title: "Status Refreshed",
        description: "Integration status has been updated.",
      });
    } catch (error) {
      console.error('Error refreshing integration status:', error);
      toast({
        title: "Refresh Error",
        description: "Failed to refresh integration status.",
        variant: "destructive",
      });
    }
  };

  const handleSync = async (integrationName: string) => {
    setLoadingStates(prev => ({ ...prev, [integrationName]: true }));
    
    try {
      const integrationType = integrationName.toLowerCase() as 'jira' | 'trello' | 'testrail';
      const result = await syncIntegrations(integrationType);

      if (result.success) {
        toast({
          title: `${integrationName} Synced`,
          description: result.message,
        });
      } else {
        toast({
          title: "Sync Error",
          description: result.results[integrationType]?.error || `Failed to sync ${integrationName}.`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error(`Error syncing ${integrationName}:`, error);
      toast({
        title: "Sync Error",
        description: `Failed to sync ${integrationName}.`,
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, [integrationName]: false }));
    }
  };

  const clearProjects = async () => {
    setLoadingStates(prev => ({ ...prev, 'Clear': true }));
    
    try {
      const response = await fetch('/api/integrations/clear-projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Projects Cleared",
          description: `Marked ${result.updatedCount} projects as inactive. You can now re-sync your integrations.`,
        });
        await fetchIntegrations();
      } else {
        toast({
          title: "Clear Error",
          description: result.error || "Failed to clear projects.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error clearing projects:', error);
      toast({
        title: "Clear Error",
        description: "Failed to clear projects.",
        variant: "destructive",
      });
    } finally {
      setLoadingStates(prev => ({ ...prev, 'Clear': false }));
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tool Integrations"
        icon={<LinkIcon className="h-5 w-5 text-white" />}
        gradient="from-indigo-500 to-blue-500"
        description="Connect your favorite project management and development tools to gain unified insights."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refreshConnectionStatus}
            disabled={isPending}
            className="rounded-full"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
            Refresh Status
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/5 via-purple-500/5 to-accent/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg">
              <LinkIcon className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl">Connect Your Tools</CardTitle>
              <CardDescription>
                Streamline your workflow by integrating the tools your team already uses
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* {integrations.map((integration) => (
              <Card key={integration.name} className="flex flex-col shadow-md hover:shadow-xl transition-shadow duration-300">
                <CardHeader className="flex flex-row items-start gap-4 space-y-0">
                  {integration.icon}
                  <div className="flex-1">
                    <CardTitle className="text-lg">{integration.name}</CardTitle>
                    <CardDescription className="text-xs text-muted-foreground">{integration.category}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <p className="text-sm text-muted-foreground">{integration.description}</p>
                </CardContent>
                <CardFooter>
                  {loadingStates[integration.name] || (isPending && loadingStates[integration.name] !== false) ? (
                    <Button variant="outline" className="w-full" disabled>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </Button>
                  ) : integration.connected ? (
                    <div className="flex w-full items-center justify-between gap-2">
                       <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDisconnect(integration.name)}
                        disabled={loadingStates[integration.name] || isPending}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                       <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleSettings(integration.name)}
                        disabled={loadingStates[integration.name] || isPending}
                      >
                        <Settings className="h-4 w-4" />
                        <span className="sr-only">Settings for {integration.name}</span>
                      </Button>
                      {integration.name === "Trello" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(integration.name)}
                          disabled={loadingStates[integration.name] || isPending}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync
                        </Button>
                      )}
                      {integration.name === "TestRail" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(integration.name)}
                          disabled={loadingStates[integration.name] || isPending}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync
                        </Button>
                      )}
                    </div>
                  ) : (
                    integration.name === "Jira" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => handleConnect('Jira')}
                        disabled={loadingStates['Jira']}
                      >
                        {loadingStates['Jira'] ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <LinkIcon className="mr-2 h-4 w-4" />
                        )}
                        Connect with Jira
                      </Button>
                    ) : integration.name === "Trello" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => handleConnect('Trello')}
                        disabled={loadingStates['Trello']}
                      >
                        {loadingStates['Trello'] ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <LinkIcon className="mr-2 h-4 w-4" />
                        )}
                        Connect
                      </Button>
                    ) : integration.name === "TestRail" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        asChild
                      >
                        <a href={`${process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''}/integrations/testrail-oauth-simulated`}>
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Connect
                        </a>
                      </Button>
                    ) : integration.name === "Teams" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        asChild
                      >
                        <a href="/api/auth/teams/start">
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Connect with Teams
                        </a>
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => handleConnect(integration.name)}
                        disabled={loadingStates[integration.name] || isPending}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Connect
                      </Button>
                    )
                  )}
                </CardFooter>
              </Card>
            ))} */}
            {integrations.map((integration, index) => {
  const isDisabled = integration.name === "GitHub" || integration.name === "Teams";

  return (
    <Card
      key={integration.name}
      className={`group relative flex flex-col overflow-hidden card-hover glow-card ${
        isDisabled ? "opacity-50 pointer-events-none" : ""
      }`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Connected indicator bar */}
      {integration.connected && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-green-500" />
      )}
      
      <CardHeader className="flex flex-row items-start gap-4 space-y-0 pb-3">
        <div className="transition-transform duration-300 group-hover:scale-110">
          {integration.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{integration.name}</CardTitle>
            {integration.connected && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Connected
              </span>
            )}
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            {integration.category}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <p className="text-sm text-muted-foreground">{integration.description}</p>
      </CardContent>
      <CardFooter className="border-t border-border/30 bg-muted/20 pt-4">
                  {loadingStates[integration.name] || (isPending && loadingStates[integration.name] !== false) ? (
                    <Button variant="outline" className="w-full" disabled>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </Button>
                  ) : integration.connected ? (
                    <div className="flex w-full items-center justify-between gap-2">
                       <Button
                        variant="outline"
                        size="sm"
                        className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDisconnect(integration.name)}
                        disabled={loadingStates[integration.name] || isPending}
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        Disconnect
                      </Button>
                       <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleSettings(integration.name)}
                        disabled={loadingStates[integration.name] || isPending}
                      >
                        <Settings className="h-4 w-4" />
                        <span className="sr-only">Settings for {integration.name}</span>
                      </Button>
                      {integration.name === "Trello" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(integration.name)}
                          disabled={loadingStates[integration.name] || isPending}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync
                        </Button>
                      )}
                      {integration.name === "TestRail" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSync(integration.name)}
                          disabled={loadingStates[integration.name] || isPending}
                        >
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Sync
                        </Button>
                      )}
                    </div>
                  ) : (
                    integration.name === "Jira" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => handleConnect('Jira')}
                        disabled={loadingStates['Jira']}
                      >
                        {loadingStates['Jira'] ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <LinkIcon className="mr-2 h-4 w-4" />
                        )}
                        Connect with Jira
                      </Button>
                    ) : integration.name === "Trello" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => handleConnect('Trello')}
                        disabled={loadingStates['Trello']}
                      >
                        {loadingStates['Trello'] ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <LinkIcon className="mr-2 h-4 w-4" />
                        )}
                        Connect
                      </Button>
                    ) : integration.name === "TestRail" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        asChild
                      >
                        <a href={`${process.env.NEXT_PUBLIC_TENANT_BASEPATH || ''}/integrations/testrail-oauth-simulated`}>
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Connect
                        </a>
                      </Button>
                    ) : integration.name === "Teams" ? (
                      <Button
                        variant="default"
                        className="w-full"
                        asChild
                      >
                        <a href="/api/auth/teams/start">
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Connect with Teams
                        </a>
                      </Button>
                    ) : (
                      <Button
                        variant="default"
                        className="w-full"
                        onClick={() => handleConnect(integration.name)}
                        disabled={loadingStates[integration.name] || isPending}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Connect
                      </Button>
                    )
                  )}
                </CardFooter>
    </Card>
  );
})}

          </div>
        </CardContent>
      </Card>

      {/* Permission Information Section */}
      <Card className="overflow-hidden border-primary/20">
        <CardHeader className="border-b border-border/50 bg-gradient-to-r from-blue-500/5 via-cyan-500/5 to-emerald-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg">
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Required Permissions</CardTitle>
              <CardDescription>
                Grant these permissions when connecting your tools for full functionality
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-800/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg jira-gradient flex items-center justify-center">
                  <JiraIcon className="h-4 w-4 text-white" />
                </div>
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">Jira</h4>
              </div>
              <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>Read/Write Jira Work</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>Manage Jira Project</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-1">•</span>
                  <span>Read Jira User</span>
                </li>
              </ul>
            </div>
            
            <div className="p-4 rounded-xl bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-800/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg trello-gradient flex items-center justify-center">
                  <TrelloIcon className="h-4 w-4 text-white" />
                </div>
                <h4 className="font-semibold text-sky-800 dark:text-sky-200">Trello</h4>
              </div>
              <ul className="text-sm text-sky-700 dark:text-sky-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-sky-500 mt-1">•</span>
                  <span>Read Boards & Cards</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-sky-500 mt-1">•</span>
                  <span>Write Cards</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-sky-500 mt-1">•</span>
                  <span>Read Organization</span>
                </li>
              </ul>
            </div>
            
            <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg testrail-gradient flex items-center justify-center">
                  <svg viewBox="0 0 24 24" fill="white" className="h-4 w-4">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <h4 className="font-semibold text-emerald-800 dark:text-emerald-200">TestRail</h4>
              </div>
              <ul className="text-sm text-emerald-700 dark:text-emerald-300 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">•</span>
                  <span>Read Projects & Cases</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">•</span>
                  <span>Write Test Cases</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 mt-1">•</span>
                  <span>Read Suites & Sections</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto p-6">
        <PageHeader
          title="Integrations"
          description="Connect your favorite tools and services to enhance your workflow."
        />
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded animate-pulse" />
                  <div>
                    <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-2" />
                    <div className="h-3 w-32 bg-gray-200 rounded animate-pulse" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-3 w-full bg-gray-200 rounded animate-pulse mb-2" />
                <div className="h-3 w-3/4 bg-gray-200 rounded animate-pulse" />
              </CardContent>
              <CardFooter>
                <div className="h-9 w-full bg-gray-200 rounded animate-pulse" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    }>
      <IntegrationsContent />
    </Suspense>
  );
}
