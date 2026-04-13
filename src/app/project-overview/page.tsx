"use client";

import { useEffect, useState, useCallback } from "react";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, AlertTriangle, Info, CheckCircle, Settings, RefreshCw, BarChart3, FolderKanban, Sparkles, TrendingUp, Clock, Zap, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations, type Project } from "@/hooks/useIntegrations";
import { useAutoRefresh, useWebhookStatus } from "@/hooks/useAutoRefresh";
import { WebhookStatusIndicator, LiveUpdateBadge } from "@/components/webhooks/WebhookStatusIndicator";
import { useJiraPolling } from "@/hooks/useJiraPolling";
import { useTrelloPolling } from "@/hooks/useTrelloPolling";

export default function ProjectOverviewPage() {
  const { integrations, projects, loading, error, fetchIntegrations, syncIntegrations, invalidateCache } = useIntegrations();
  const [refreshing, setRefreshing] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [refreshingAnalytics, setRefreshingAnalytics] = useState(false);
  const [fixingProject, setFixingProject] = useState<string | null>(null);
  const { toast } = useToast();
  const router = useRouter();
  
  // Webhook status for live indicator
  const { connected: webhookConnected, hasRecentActivity } = useWebhookStatus();
  
  // Disable background polling to avoid frequent automatic refreshes.
  useJiraPolling(false);
  useTrelloPolling(false);
  
  // Callback for auto-refresh
  const handleWebhookRefresh = useCallback(async () => {
    console.log('📡 Project Overview: Auto-refreshing from webhook event');
    invalidateCache();
    
    try {
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const pathParts = pathname.split('/');
      const basePath = pathParts.length > 1 && pathParts[1] && !pathParts[1].includes('.') ? `/${pathParts[1]}` : '';
      
      const response = await fetch(`${basePath}/api/integrations/refresh-analytics`, {
        method: 'POST',
      });
      
      if (response.ok) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error('📡 Project Overview: Error refreshing analytics:', error);
    }
    
    await fetchIntegrations(true);
    setLastRefreshTime(new Date());
  }, [invalidateCache, fetchIntegrations]);
  
  // Disable webhook-driven auto-refresh; keep manual refresh only.
  const { refreshing: webhookRefreshing, hasActivity } = useAutoRefresh({
    integrationTypes: ['JIRA', 'TRELLO', 'TESTRAIL'],
    onRefresh: handleWebhookRefresh,
    debounceMs: 2000,
    enabled: false,
  });

  const totalProjectCount = 
    (projects.jira?.length || 0) + 
    (projects.trello?.length || 0) + 
    (projects.testrail?.length || 0);

  const handleGanttViewClick = () => {
    router.push('/gantt-view');
  };

  useEffect(() => {
    if (initialLoad && !loading) {
      fetchIntegrations(false);
      setInitialLoad(false);
    }
  }, [loading, initialLoad, fetchIntegrations]);

  const getProjectGradient = (type: string) => {
    switch (type) {
      case 'JIRA':
        return 'from-blue-500 to-blue-600';
      case 'TRELLO':
        return 'from-orange-500 to-amber-500';
      case 'TESTRAIL':
        return 'from-emerald-500 to-green-500';
      default:
        return 'from-violet-500 to-purple-500';
    }
  };

  const getProjectIcon = (type: string) => {
    switch (type) {
      case 'JIRA':
        return (
          <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
            <path d="M11.571 11.513H0a5.218 5.218 0 0 0 5.232 5.215h2.13v2.057A5.215 5.215 0 0 0 12.575 24V12.518a1.005 1.005 0 0 0-1.005-1.005zm5.723-5.756H5.736a5.215 5.215 0 0 0 5.215 5.214h2.129v2.058a5.218 5.218 0 0 0 5.215 5.214V6.758a1.001 1.001 0 0 0-1.001-1.001zM23.013 0H11.455a5.215 5.215 0 0 0 5.215 5.215h2.129v2.057A5.215 5.215 0 0 0 24 12.483V1.005A1.005 1.005 0 0 0 23.013 0z"/>
          </svg>
        );
      case 'TRELLO':
        return (
          <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
            <path d="M21 0H3C1.343 0 0 1.343 0 3v18c0 1.656 1.343 3 3 3h18c1.656 0 3-1.344 3-3V3c0-1.657-1.344-3-3-3zM10.44 18.18c0 .795-.645 1.44-1.44 1.44H4.56c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44H9c.795 0 1.44.645 1.44 1.44v13.62zm10.44-6c0 .795-.645 1.44-1.44 1.44h-4.44c-.795 0-1.44-.645-1.44-1.44V4.56c0-.795.645-1.44 1.44-1.44h4.44c.795 0 1.44.645 1.44 1.44v7.62z"/>
          </svg>
        );
      case 'TESTRAIL':
        return (
          <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
          </svg>
        );
      default:
        return <FolderKanban className="h-5 w-5 text-white" />;
    }
  };

  const getProjectDescription = (project: Project) => {
    if (project.integrationType === 'JIRA') {
      return `Key: ${project.key}`;
    } else if (project.integrationType === 'TRELLO') {
      return `Board`;
    } else if (project.integrationType === 'TESTRAIL') {
      return `Project`;
    }
    return `ID: ${project.externalId}`;
  };

  const getProjectLink = (project: Project) => {
    if (project.integrationType === 'JIRA') {
      return `/project/${project.key}`;
    } else if (project.integrationType === 'TRELLO') {
      return `/project/${project.externalId}`;
    } else if (project.integrationType === 'TESTRAIL') {
      return `/project/${project.externalId}`;
    }
    return `/project/${project.externalId}`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      invalidateCache();
      
      try {
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const pathParts = pathname.split('/');
        const basePath = pathParts.length > 1 && pathParts[1] && !pathParts[1].includes('.') ? `/${pathParts[1]}` : '';
        
        const response = await fetch(`${basePath}/api/integrations/refresh-analytics`, {
          method: 'POST',
        });
        
        if (response.ok) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error('🔄 Project Overview: Error refreshing analytics:', error);
      }
      
      const syncResult = await syncIntegrations();
      setLastRefreshTime(new Date());
      
      if (syncResult.success) {
        toast({
          title: "Data synced successfully",
          description: syncResult.message,
        });
      } else {
        await fetchIntegrations(true);
        toast({
          title: "Data refreshed",
          description: "Project data has been updated successfully.",
        });
      }
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Failed to refresh project data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleFixProject = async (projectKey: string) => {
    if (fixingProject) return;
    
    try {
      setFixingProject(projectKey);
      
      const response = await fetch('/api/fix-project-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectKey }),
      });
      
      const result = await response.json();
      
      if (result.success) {
        invalidateCache();
        await fetchIntegrations(true);
        setLastRefreshTime(new Date());
        
        toast({
          title: "Project Fixed!",
          description: `${result.message}`,
        });
      } else {
        toast({
          title: "Fix Failed",
          description: result.error || "Failed to fix project analytics",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Fix Failed",
        description: "Failed to fix project analytics. Please try again.",
        variant: "destructive"
      });
    } finally {
      setFixingProject(null);
    }
  };

  const renderProjects = (projectsList: Project[], source: string, integrationType: string, errorMsg?: string) => {
    if (!projectsList || projectsList.length === 0) {
      return (
        <Card className="border-dashed border-2 bg-muted/30">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getProjectGradient(integrationType)} flex items-center justify-center mb-4 opacity-50`}>
              {getProjectIcon(integrationType)}
            </div>
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">No Projects Found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {errorMsg || "Ensure the integration is connected and you have access to projects."}
            </p>
          </CardContent>
        </Card>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 stagger-children">
        {projectsList.map((project, index) => (
          <Card 
            key={project.id} 
            className="group relative overflow-hidden card-hover glow-card"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* Top gradient bar */}
            <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${getProjectGradient(project.integrationType || 'JIRA')}`} />
            
            {/* Hover gradient overlay */}
            <div className={`absolute inset-0 bg-gradient-to-br ${getProjectGradient(project.integrationType || 'JIRA')} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300 pointer-events-none`} />
            
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${getProjectGradient(project.integrationType || 'JIRA')} flex items-center justify-center shadow-lg`}>
                    {getProjectIcon(project.integrationType || 'JIRA')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg font-semibold truncate group-hover:text-primary transition-colors">
                      {project.name}
                    </CardTitle>
                    <CardDescription className="text-sm">
                      {getProjectDescription(project)}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {project.integrationType}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0 space-y-4">
              {project.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {project.description}
                </p>
              )}
              
              {/* Data freshness indicator */}
              {project.analytics?.dataSource && (
                <div className="flex items-center gap-2 text-xs">
                  <div className={`w-2 h-2 rounded-full ${
                    project.analytics.dataSource === 'live' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                  }`} />
                  <span className="text-muted-foreground">
                    {project.analytics.dataSource === 'live' ? 'Live data' : 'Cached'}
                    {project.analytics.lastUpdated && (
                      <span className="ml-1">• {new Date(project.analytics.lastUpdated).toLocaleTimeString()}</span>
                    )}
                  </span>
                </div>
              )}

              {/* Analytics */}
              {project.analytics && project.integrationType !== 'SLACK' && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Quick Stats
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/50 rounded-lg p-2.5">
                      <p className="text-2xl font-bold">{project.analytics.totalIssues || 0}</p>
                      <p className="text-xs text-muted-foreground">Total Issues</p>
                    </div>
                    {typeof project.analytics.statusCounts === 'object' && project.analytics.statusCounts && (
                      <div className="bg-muted/50 rounded-lg p-2.5">
                        <p className="text-2xl font-bold">
                          {Object.keys(project.analytics.statusCounts).length}
                        </p>
                        <p className="text-xs text-muted-foreground">Status Types</p>
                      </div>
                    )}
                  </div>

                  {/* Status breakdown */}
                  {typeof project.analytics.statusCounts === 'object' && project.analytics.statusCounts && (
                    <div className="flex flex-wrap gap-1.5">
                      {(Object.entries(project.analytics.statusCounts) as [string, number][]).slice(0, 4).map(([status, count]) => (
                        <Badge key={status} variant="secondary" className="text-xs font-normal">
                          {status}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              {/* Active status */}
              <div className="flex items-center gap-2 text-sm pt-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">Active</span>
                {project.lastSyncAt && (
                  <span className="text-xs text-muted-foreground/70 ml-auto">
                    Synced {new Date(project.lastSyncAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </CardContent>
            
            <CardFooter className="pt-4 border-t border-border/30 relative z-10">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full group/btn bg-gradient-to-r from-primary/5 to-purple-500/5 hover:from-primary/10 hover:to-purple-500/10 border-primary/20 hover:border-primary/40 transition-all duration-300 relative z-10" 
                asChild
              >
                <Link href={getProjectLink(project)} className="flex items-center justify-center">
                  <span className="font-medium">View Details</span>
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    );
  };

  const renderIntegrationSection = (
    title: string,
    type: 'jira' | 'trello' | 'testrail',
    integrationType: string,
    projectsList: Project[],
    isConnected: boolean
  ) => {
    if (!isConnected) return null;

    return (
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${getProjectGradient(integrationType)} flex items-center justify-center shadow-md`}>
              {getProjectIcon(integrationType)}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">
                {projectsList.length} {projectsList.length === 1 ? 'project' : 'projects'}
              </p>
            </div>
          </div>
          {projectsList.length === 0 && (
            <Button 
              onClick={handleRefresh} 
              size="sm" 
              variant="outline"
              disabled={refreshing}
            >
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          )}
        </div>
        {projectsList.length > 0 ? (
          renderProjects(projectsList, 'database', integrationType)
        ) : (
          <Alert className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">No Projects Found</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              Your {title.replace(' Projects', '').replace(' Boards', '')} integration is connected, but no projects were found. 
              This might be due to permissions or the projects being archived.
            </AlertDescription>
          </Alert>
        )}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Project Overview"
        icon={<FolderKanban className="h-5 w-5 text-white" />}
        gradient="from-violet-500 to-purple-500"
        description={
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span>View and analyze your projects from connected platforms.</span>
              {webhookConnected && <LiveUpdateBadge />}
            </div>
            {lastRefreshTime && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Last refreshed: {lastRefreshTime.toLocaleTimeString()}
                {hasActivity && <span className="text-primary animate-pulse"> • Updating...</span>}
              </span>
            )}
          </div>
        }
        actions={
          <div className="flex items-center gap-3">
            <WebhookStatusIndicator showLabel size="md" />
            
            <Button 
              onClick={handleRefresh} 
              disabled={refreshing || loading || refreshingAnalytics || webhookRefreshing}
              variant="outline"
              size="sm"
              className="rounded-full"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${(refreshing || webhookRefreshing) ? 'animate-spin' : ''}`} />
              {webhookRefreshing ? 'Auto-updating...' : refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
            
            {totalProjectCount > 0 && (
              <Button 
                onClick={handleGanttViewClick} 
                disabled={refreshing || loading || webhookRefreshing}
                size="sm"
                className="rounded-full bg-gradient-to-r from-primary to-purple-500 hover:opacity-90"
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Gantt View
              </Button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground animate-pulse">Loading projects...</p>
        </div>
      ) : error ? (
        <Alert variant="destructive" className="animate-scale-in">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Projects</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-10">
          {(!integrations?.jira.connected && !integrations?.trello.connected && !integrations?.testrail.connected) || 
           (projects.jira.length === 0 && projects.trello.length === 0 && projects.testrail.length === 0) ? (
            // No tools connected
            <Card className="border-dashed border-2 animate-scale-in">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <div className="relative mb-6">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-purple-500/20 flex items-center justify-center">
                    <Settings className="h-12 w-12 text-primary/50" />
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg">
                    <Zap className="h-5 w-5 text-white" />
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-3">No Tools Connected</h2>
                <p className="text-muted-foreground mb-8 max-w-md">
                  Connect your project management tools like Jira or Trello to view and analyze your projects in one place.
                </p>
                <Link href="/integrations">
                  <Button size="lg" className="rounded-full bg-gradient-to-r from-primary to-purple-500 hover:opacity-90">
                    <Settings className="mr-2 h-5 w-5" />
                    Connect Tools
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {renderIntegrationSection('Jira Projects', 'jira', 'JIRA', projects.jira, integrations?.jira.connected)}
              {renderIntegrationSection('Trello Boards', 'trello', 'TRELLO', projects.trello, integrations?.trello.connected)}
              {renderIntegrationSection('TestRail Projects', 'testrail', 'TESTRAIL', projects.testrail, integrations?.testrail.connected)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
