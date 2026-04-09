"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import React from "react";
import PageHeader from "@/components/page-header";
import { notFound } from "next/navigation";
import { 
  getJiraProjectDetailsAction
} from "../../../../lib/integrations/jira-integration";
import { 
  getTrelloProjectDetailsAction
} from "../../../../lib/integrations/trello-integration";
import { getTestRailProjectDetailsAction } from "@/lib/integrations/testrail-integration";
import { 
  JiraDashboardIssue,
  TrelloCard
} from "@/types/integrations";
import { 
  DetailedJiraProject,
  DetailedTrelloProject,
  DetailedTestRailProject,
  TestRailTestCase
} from "@/types/integrations";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Download, Printer, Share2, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAutoRefresh, useWebhookStatus } from "@/hooks/useAutoRefresh";
import { WebhookStatusIndicator, LiveUpdateBadge } from "@/components/webhooks/WebhookStatusIndicator";
import { useJiraPolling } from "@/hooks/useJiraPolling";
import { useTrelloPolling } from "@/hooks/useTrelloPolling";

// Import chart components
import IssuesByStatusPieChart from "@/components/charts/IssuesByStatusPieChart";
import IssuesByTypeBarChart from "@/components/charts/IssuesByTypeBarChart";
import IssuesByAssigneeChart from "@/components/charts/IssuesByAssigneeChart";
import IssuesByTimelineChart from "@/components/charts/IssuesByTimelineChart";
import BurndownChart from "@/components/charts/BurndownChart";
import GanttChart from "@/components/charts/GanttChart";
import ChartFilters, { FilterOptions } from "@/components/charts/ChartFilters";
import ChartDrilldown from "@/components/charts/ChartDrilldown";

// Import utilities
import { 
  exportIssuesAsCSV,
  printElement
} from "@/lib/chart-export";
import { 
  filterIssues, 
  processIssuesByStatus, 
  processIssuesByType, 
  processIssuesByAssignee,
  processIssuesForTimeline,
  processIssuesForBurndown,
  getAvailableFilterOptions,
  exportChartAsImage,
  exportChartsAsPDF
} from "@/lib/chart-utils";

// Type definitions
type ProjectType = DetailedJiraProject | DetailedTrelloProject | DetailedTestRailProject;

interface ProjectDetailPageProps {
  params: Promise<{ projectId: string }>;
}

// Helper function to detect project type based on projectId format
function detectProjectType(projectId: string): 'jira' | 'trello' | 'testrail' {
  // Jira project keys are typically 2-10 characters, uppercase letters and numbers
  if (/^[A-Z][A-Z0-9]{1,9}$/.test(projectId)) {
    return 'jira';
  }
  
  // TestRail project IDs are typically numeric
  if (/^\d+$/.test(projectId)) {
    return 'testrail';
  }
  
  // Trello board IDs are typically 24-character alphanumeric strings
  if (/^[a-zA-Z0-9]{24}$/.test(projectId)) {
    return 'trello';
  }
  
  // Default to Jira for unknown formats
  return 'jira';
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  // Unwrap params Promise using React.use() for Next.js 15 compatibility
  const { projectId: projectIdOrKey } = React.use(params);
  
  // Detect project type immediately from projectId format
  const initialProjectType = useMemo(() => detectProjectType(projectIdOrKey), [projectIdOrKey]);
  
  const [project, setProject] = useState<ProjectType | null>(null);
  const [issues, setIssues] = useState<JiraDashboardIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [filters, setFilters] = useState<FilterOptions>({});
  const [filteredIssues, setFilteredIssues] = useState<JiraDashboardIssue[]>([]);
  const [drilldownOpen, setDrilldownOpen] = useState<boolean>(false);
  const [drilldownTitle, setDrilldownTitle] = useState<string>("");
  const [drilldownIssues, setDrilldownIssues] = useState<JiraDashboardIssue[]>([]);
  const [projectType, setProjectType] = useState<'jira' | 'trello' | 'testrail'>(initialProjectType);
  
  // Refs for chart containers (used for export)
  const statusChartRef = useRef<HTMLDivElement>(null);
  const typeChartRef = useRef<HTMLDivElement>(null);
  const assigneeChartRef = useRef<HTMLDivElement>(null);
  const timelineChartRef = useRef<HTMLDivElement>(null);
  const burndownChartRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  
  // Webhook status for live updates
  const { connected: webhookConnected, hasRecentActivity } = useWebhookStatus();
  
  // Start Jira polling for automatic change detection (detects changes from ANY user)
  // Only poll if it's a Jira project
  useJiraPolling(projectType === 'jira');
  
  // Start Trello polling for automatic change detection (detects changes from ANY user)
  // Only poll if it's a Trello project
  useTrelloPolling(projectType === 'trello');

  // Fetch project data function with retry logic
  const fetchData = async (retryCount = 0) => {
    const maxRetries = 2; // Retry up to 2 times for transient errors
    
    setLoading(true);
    setError(null);
    setMessage(null);
    
    try {
      // Project type is already detected from projectId format, but verify it matches
      const detectedType = detectProjectType(projectIdOrKey);
      if (detectedType !== projectType) {
        console.log(`🔄 PROJECT DETAILS: Project type changed from ${projectType} to ${detectedType}`);
        setProjectType(detectedType);
      }
      
      let projectData: ProjectType;
      let issuesData: JiraDashboardIssue[] = [];
      
      switch (detectedType) {
        case 'jira':
          console.log('🔍 PROJECT DETAILS: Fetching Jira project data for:', projectIdOrKey);
          const jiraResult = await getJiraProjectDetailsAction(projectIdOrKey);
          if (!jiraResult || !jiraResult.success) {
            throw new Error(jiraResult?.error || 'Failed to fetch Jira project details');
          }
          if (!jiraResult.data || !jiraResult.data.project) {
            throw new Error('Invalid response format from Jira API');
          }
          projectData = jiraResult.data.project;
          issuesData = jiraResult.data.issues || [];
          console.log('✅ PROJECT DETAILS: Jira project data fetched successfully:', {
            projectKey: projectData.key,
            projectName: projectData.name,
            issuesCount: issuesData.length
          });
          break;
          
        case 'trello':
          console.log('🔍 PROJECT DETAILS: Fetching Trello project data for:', projectIdOrKey);
          const trelloResult = await getTrelloProjectDetailsAction(projectIdOrKey);
          if (!trelloResult || !trelloResult.success) {
            throw new Error(trelloResult?.error || 'Failed to fetch Trello project details');
          }
          if (!trelloResult.data || !trelloResult.data.project) {
            throw new Error('Invalid response format from Trello API');
          }
          projectData = trelloResult.data.project;
          issuesData = trelloResult.data.issues || [];
          console.log('✅ PROJECT DETAILS: Trello project data fetched successfully:', {
            projectId: projectData.id,
            projectName: projectData.name,
            issuesCount: issuesData.length
          });
          break;
          
        case 'testrail':
          console.log('🔍 PROJECT DETAILS: Fetching TestRail project data for:', projectIdOrKey);
          const testrailResult = await getTestRailProjectDetailsAction(projectIdOrKey);
          if (!testrailResult || !testrailResult.success) {
            throw new Error(testrailResult?.error || 'Failed to fetch TestRail project details');
          }
          if (!testrailResult.data || !testrailResult.data.project) {
            throw new Error('Invalid response format from TestRail API');
          }
          projectData = testrailResult.data.project;
          issuesData = testrailResult.data.issues || [];
          console.log('✅ PROJECT DETAILS: TestRail project data fetched successfully:', {
            projectId: projectData.id,
            projectName: projectData.name,
            issuesCount: issuesData.length
          });
          break;
          
        default:
          throw new Error('Unsupported project type');
      }
      
      setProject(projectData);
      setIssues(issuesData);
      setFilteredIssues(issuesData);
      
      if (issuesData.length === 0) {
        setMessage('No issues found for this project. This could be due to permissions or the project being empty.');
      }
      
    } catch (err: any) {
      // Preserve original error message for better debugging
      const errorMsg = err?.message || err?.error || 'Failed to fetch project details';
      const isNetworkError = errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('timeout') || errorMsg.includes('ECONNRESET');
      const isAuthError = errorMsg.includes('authentication') || errorMsg.includes('unauthorized') || errorMsg.includes('expired') || errorMsg.includes('token');
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('too many requests');
      const isServerError = errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504');
      
      // Retry on transient errors (network, rate limit, server errors) but not auth errors
      const isTransientError = (isNetworkError || isRateLimit || isServerError) && !isAuthError;
      
      if (isTransientError && retryCount < maxRetries) {
        const delayMs = (retryCount + 1) * 1000; // Exponential backoff: 1s, 2s
        console.log(`🔄 PROJECT DETAILS: Retrying after ${delayMs}ms (attempt ${retryCount + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return fetchData(retryCount + 1);
      }
      
      // Provide more specific error messages
      let displayError = errorMsg;
      if (isNetworkError) {
        displayError = "Network error: Unable to connect to the service. Please check your internet connection and try again.";
      } else if (isAuthError) {
        displayError = "Authentication error: Your connection may have expired. Please reconnect from the Integrations page.";
      } else if (isRateLimit) {
        displayError = "Rate limit exceeded: Too many requests. Please wait a moment and try again.";
      } else if (isServerError) {
        displayError = "Server error: The service is temporarily unavailable. Please try again in a moment.";
      }
      
      console.error('❌ PROJECT DETAILS: Error fetching project data:', {
        error: err,
        message: errorMsg,
        projectId: projectIdOrKey,
        projectType: projectType,
        retryCount,
        stack: err?.stack
      });
      
      setError(displayError);
      
      // Show toast notification (toast is already imported at top)
      toast({
        title: "Error Loading Project",
        description: displayError,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchData();
  }, [projectIdOrKey]);

  // Auto-refresh callback for webhook events
  const handleWebhookRefresh = useCallback(async () => {
    console.log('📡 Project Details (Tenant): Auto-refreshing from webhook event');
    await fetchData();
    setLastRefreshTime(new Date());
  }, [projectIdOrKey]);

  // Memoize integration types to prevent unnecessary re-renders
  const integrationTypes = useMemo<Array<'JIRA' | 'TRELLO' | 'TESTRAIL'>>(() => {
    return projectType === 'jira' ? ['JIRA'] : 
           projectType === 'trello' ? ['TRELLO'] : ['TESTRAIL'];
  }, [projectType]);
  
  const { refreshing: webhookRefreshing, hasActivity } = useAutoRefresh({
    integrationTypes,
    onRefresh: handleWebhookRefresh,
    projectId: projectIdOrKey, // Only refresh for this specific project
    debounceMs: 2000,
    enabled: true,
  });

  // Update filtered issues when filters change
  useEffect(() => {
    if (issues.length > 0) {
      const filtered = filterIssues(issues, filters);
      setFilteredIssues(filtered);
    }
  }, [issues, filters]);

  // Handle filter changes
  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
  };

  // Handle chart drilldown
  const handleChartDrilldown = (title: string, issues: JiraDashboardIssue[]) => {
    setDrilldownTitle(title);
    setDrilldownIssues(issues);
    setDrilldownOpen(true);
  };

  // Handle refresh
  const handleRefresh = async () => {
    await fetchData();
    toast({
      title: "Data refreshed",
      description: "Project data has been updated successfully.",
    });
  };

  // Handle export functions
  const handleExportChart = async (chartRef: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!chartRef.current) return;
    
    try {
      await exportChartAsImage(chartRef.current, filename);
      toast({
        title: "Chart exported",
        description: `${filename} has been downloaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export chart. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportAllCharts = async () => {
    const chartRefs = [
      { ref: statusChartRef, name: 'Issues by Status' },
      { ref: typeChartRef, name: 'Issues by Type' },
      { ref: assigneeChartRef, name: 'Issues by Assignee' },
      { ref: timelineChartRef, name: 'Issues Timeline' },
      { ref: burndownChartRef, name: 'Burndown Chart' }
    ];

    try {
      await exportChartsAsPDF(chartRefs, `${project?.name || 'Project'}_Analytics.pdf`);
      toast({
        title: "All charts exported",
        description: "PDF report has been downloaded successfully.",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: "Failed to export charts. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Handle sharing
  const handleShare = async () => {
    setShareLoading(true);
    setShareDialogOpen(true);
    try {
      // Use basePath for API calls
      const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
      const res = await fetch(`${basePath}/api/shared/project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: projectIdOrKey,
          projectType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.shareUrl) {
        setShareUrl(data.shareUrl);
      } else {
        setShareUrl(null);
        toast({
          title: "Share failed",
          description: data.error || "Could not create share link",
          variant: "destructive",
        });
      }
    } catch (error) {
      setShareUrl(null);
      toast({
        title: "Share failed",
        description: "Failed to generate share URL. Please try again.",
        variant: "destructive",
      });
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (shareUrl) {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "URL copied",
        description: "Share URL has been copied to clipboard.",
      });
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <PageHeader 
          title="Loading Project Details..." 
          description="Fetching project information and analytics"
        />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container mx-auto p-6">
        <PageHeader 
          title="Project Not Found" 
          description="Unable to load project details"
        />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <div className="mt-4">
          <Button onClick={fetchData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Project not found
  if (!project) {
    notFound();
  }

  // Get available filter options
  const availableFilters = getAvailableFilterOptions(issues);

  // Process data for charts
  const statusData = processIssuesByStatus(filteredIssues);
  const typeData = processIssuesByType(filteredIssues);
  const assigneeData = processIssuesByAssignee(filteredIssues);
  const timelineData = processIssuesForTimeline(filteredIssues);
  const burndownData = processIssuesForBurndown(filteredIssues);

  return (
    <div className="container mx-auto p-6">
      <PageHeader 
        title={project.name || 'Project Details'} 
        description={
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span>{`Analytics and insights for ${project.name || 'this project'}`}</span>
              {webhookConnected && <LiveUpdateBadge />}
            </div>
            {lastRefreshTime && (
              <span className="text-xs text-muted-foreground">
                Last refreshed: {lastRefreshTime.toLocaleTimeString()}
                {hasActivity && ' • Updating...'}
              </span>
            )}
          </div>
        }
      >
        <div className="flex items-center gap-2">
          {/* Webhook Status Indicator */}
          <WebhookStatusIndicator showLabel size="md" />
          
          <Button 
            onClick={handleRefresh} 
            variant="outline" 
            size="sm"
            disabled={loading || webhookRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(loading || webhookRefreshing) ? 'animate-spin' : ''}`} />
            {webhookRefreshing ? "Auto-updating..." : "Refresh"}
          </Button>
          <Button onClick={handleShare} variant="outline" size="sm" disabled={shareLoading}>
            <Share2 className="h-4 w-4 mr-2" />
            Share
          </Button>
          <Button onClick={handleExportAllCharts} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export All
          </Button>
        </div>
      </PageHeader>

      {/* Project Information */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Project Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="capitalize">{projectType}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Total Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{filteredIssues.length}</div>
            <p className="text-sm text-muted-foreground">
              {issues.length !== filteredIssues.length && 
                `${issues.length} total (${filteredIssues.length} filtered)`
              }
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Project ID</CardTitle>
          </CardHeader>
          <CardContent>
            <code className="text-sm bg-muted px-2 py-1 rounded">
              {projectIdOrKey}
            </code>
          </CardContent>
        </Card>
      </div>

      {/* Message Alert */}
      {message && (
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Information</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Filter issues to focus on specific data
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartFilters
            filters={filters}
            availableFilters={availableFilters}
            onFilterChange={handleFilterChange}
          />
        </CardContent>
      </Card>

      {/* Charts */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="assignees">Assignees</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="burndown">Burndown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Issues by Status</CardTitle>
                <CardDescription>
                  Distribution of issues across different statuses
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={statusChartRef}>
                  <IssuesByStatusPieChart 
                    data={statusData} 
                    onDrilldown={handleChartDrilldown}
                  />
                </div>
                <div className="mt-4">
                  <Button 
                    onClick={() => handleExportChart(statusChartRef, 'Issues_by_Status.png')}
                    variant="outline" 
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Issues by Type</CardTitle>
                <CardDescription>
                  Distribution of issues across different types
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div ref={typeChartRef}>
                  <IssuesByTypeBarChart 
                    data={typeData} 
                    onDrilldown={handleChartDrilldown}
                  />
                </div>
                <div className="mt-4">
                  <Button 
                    onClick={() => handleExportChart(typeChartRef, 'Issues_by_Type.png')}
                    variant="outline" 
                    size="sm"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="status" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Issues by Status</CardTitle>
              <CardDescription>
                Detailed breakdown of issues by status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={statusChartRef}>
                <IssuesByStatusPieChart 
                  data={statusData} 
                  onDrilldown={handleChartDrilldown}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignees" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Issues by Assignee</CardTitle>
              <CardDescription>
                Workload distribution across team members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={assigneeChartRef}>
                <IssuesByAssigneeChart 
                  data={assigneeData} 
                  onDrilldown={handleChartDrilldown}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Issues Timeline</CardTitle>
              <CardDescription>
                Issue creation and resolution trends over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={timelineChartRef}>
                <IssuesByTimelineChart 
                  data={timelineData} 
                  onDrilldown={handleChartDrilldown}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="burndown" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Burndown Chart</CardTitle>
              <CardDescription>
                Progress tracking and sprint burndown
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div ref={burndownChartRef}>
                <BurndownChart 
                  data={burndownData} 
                  onDrilldown={handleChartDrilldown}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Chart Drilldown Dialog */}
      <ChartDrilldown
        isOpen={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        title={drilldownTitle}
        issues={drilldownIssues}
        projectType={projectType}
        boardId={projectType === 'trello' ? projectIdOrKey : undefined}
        onExport={() => {
          const projectKey = project && isJiraProject(project) ? project.key : project && isTrelloProject(project) ? project.shortLink : 'project';
          exportIssuesAsCSV(drilldownIssues, `${projectKey}-${drilldownTitle.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`);
        }}
        onPrint={() => {
          // Wait a bit for the dialog to be fully rendered
          setTimeout(() => {
            const element = document.getElementById('drilldown-content');
            if (element) {
              // Pass the issues data to printElement so it can convert to table format
              printElement('drilldown-content', drilldownTitle, drilldownIssues).catch(err => {
                console.error('Print error:', err);
              });
            }
          }, 100);
        }}
        onStatusChange={(issueId, newStatus, newStatusId) => {
          // Update the issue in local state for optimistic UI
          setIssues(prev => prev.map(issue => 
            issue.id === issueId 
              ? { ...issue, status: { ...issue.status, name: newStatus, id: newStatusId } }
              : issue
          ));
          setFilteredIssues(prev => prev.map(issue => 
            issue.id === issueId 
              ? { ...issue, status: { ...issue.status, name: newStatus, id: newStatusId } }
              : issue
          ));
        }}
      />

      {/* Share Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Project</DialogTitle>
            <DialogDescription>
              Share this project with others using the link below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={shareUrl || ''}
                readOnly
                className="flex-1 px-3 py-2 border border-border rounded-md bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
              />
              <Button onClick={handleCopyShareUrl} variant="outline">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setShareDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
