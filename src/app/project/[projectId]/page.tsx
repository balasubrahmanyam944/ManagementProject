"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import React from "react";
import PageHeader from "@/components/page-header";
import { notFound } from "next/navigation";
import { 
  getJiraProjectDetailsAction
} from "../../../lib/integrations/jira-integration";
import { 
  getTrelloProjectDetailsAction
} from "../../../lib/integrations/trello-integration";
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
  filterIssues, 
  processIssuesByStatus, 
  processIssuesByType, 
  processIssuesByAssignee,
  processIssuesForTimeline,
  processIssuesForBurndown,
  getAvailableFilterOptions,
  getIssuesByStatus,
  getIssuesByType,
  getIssuesByAssignee,
  convertTrelloCardsToIssues
} from "@/lib/chart-data-utils";
import { 
  exportChartAsImage, 
  exportChartAsPDF, 
  exportIssuesAsCSV,
  exportGanttAsCSV,
  printElement 
} from "@/lib/chart-export";

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

// Union type for project
type ProjectType = DetailedJiraProject | DetailedTrelloProject | DetailedTestRailProject;

// Type guard to check if project is Jira
function isJiraProject(project: ProjectType): project is DetailedJiraProject {
  return 'key' in project;
}

// Type guard to check if project is Trello
function isTrelloProject(project: ProjectType): project is DetailedTrelloProject {
  return 'shortLink' in project;
}

// Detect project type based on ID format
function detectProjectType(projectId: string): 'jira' | 'trello' | 'testrail' {
  // Trello board IDs are typically 24 characters alphanumeric
  if (projectId.length === 24 && /^[a-zA-Z0-9]+$/.test(projectId)) {
    return 'trello';
  }
  // TestRail project IDs are numeric
  if (/^\d+$/.test(projectId)) {
    return 'testrail';
  }
  // Jira project keys are typically shorter and contain uppercase letters
  if (projectId.length <= 10 && /^[A-Z][A-Z0-9-]*$/.test(projectId)) {
    return 'jira';
  }
  // Default to jira for backward compatibility
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
    
    try {
      setLoading(true);
      setError(null); // Clear previous errors
      // Project type is already detected from projectId format, but verify it matches
      const detectedType = detectProjectType(projectIdOrKey);
      if (detectedType !== projectType) {
        console.log(`🔄 PROJECT DETAILS: Project type changed from ${projectType} to ${detectedType}`);
        setProjectType(detectedType);
      }
      console.log('[ProjectDetailPage] Detected type:', detectedType, 'for projectId:', projectIdOrKey);
      
      if (detectedType === 'trello') {
        console.log(`[ProjectDetailPage] Fetching Trello board details for: ${projectIdOrKey}`);
        const response = await getTrelloProjectDetailsAction(projectIdOrKey);
        console.log('[ProjectDetailPage] Trello API response:', response);
        if (response && response.success && response.project) {
          setProject(response.project);
          
          // Convert Trello cards to Jira-like issues for chart compatibility
          const convertedIssues = response.cards ? convertTrelloCardsToIssues(response.cards) : [];
          setIssues(convertedIssues);
          setFilteredIssues(convertedIssues);
          setMessage(response.message || null);
          setError(response.error || null);
        } else {
          setError(response.error || "Failed to load Trello board details");
        }
      } else if (detectedType === 'testrail') {
        console.log(`[ProjectDetailPage] Fetching TestRail project details for: ${projectIdOrKey}`);
        const response = await getTestRailProjectDetailsAction(projectIdOrKey);
        console.log('[ProjectDetailPage] TestRail API response:', response);
        if (response && response.success && response.project) {
          setProject(response.project as any);
          // Map TestRail test cases into a Jira-like shape for charts (minimal fields)
          const cases: TestRailTestCase[] = (response.testCases || []) as any;
          const nowIso = new Date().toISOString();
          const convertedIssues = cases.map((c, idx) => ({
            id: String(c.id ?? idx),
            key: `TC-${c.id ?? idx}`,
            summary: c.title || `Test case ${c.id}`,
            status: { 
              id: String(c.status?.id ?? 1),
              name: c.status?.name || 'Untested',
              statusCategory: { 
                id: 1, 
                name: 'To Do' 
              }
            },
            issuetype: { 
              id: 'testcase',
              name: 'TestCase',
              iconUrl: ''
            },
            assignee: undefined,
            priority: {
              id: 'medium',
              name: 'Medium',
              iconUrl: ''
            },
            created: nowIso,
            updated: nowIso,
            description: c.title || ''
          }));
          setIssues(convertedIssues);
          setFilteredIssues(convertedIssues);
          setMessage(response.message || null);
          setError(response.error || null);
        } else {
          setError(response.error || "Failed to load TestRail project details");
        }
      } else {
        console.log(`[ProjectDetailPage] Fetching Jira project details for: ${projectIdOrKey}`);
        const response = await getJiraProjectDetailsAction(projectIdOrKey);
        console.log('[ProjectDetailPage] Jira API response:', response);
        if (response && response.success && response.project) {
          setProject(response.project);
          const fetchedIssues = response.issues || [];
          setIssues(fetchedIssues);
          setFilteredIssues(fetchedIssues);
          setMessage(response.message || null);
          setError(response.error || null);
          
          // Show success message if issues were loaded
          if (fetchedIssues.length > 0) {
            toast({
              title: "Success",
              description: `Loaded ${fetchedIssues.length} issues from Jira project ${projectIdOrKey}`,
            });
          } else {
            // Show warning if no issues found
            toast({
              title: "No Issues Found",
              description: `Project ${projectIdOrKey} exists but contains no issues`,
              variant: "destructive"
            });
          }
        } else {
          const errorMsg = response.error || "Failed to load Jira project details";
          setError(errorMsg);
          toast({
            title: "Failed to Load Project",
            description: errorMsg,
            variant: "destructive"
          });
        }
      }
    } catch (err: any) {
      // Preserve original error message for better debugging
      const errorMsg = err?.message || err?.error || "An unexpected error occurred while loading project data";
      const isNetworkError = errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('ECONNREFUSED') || errorMsg.includes('timeout') || errorMsg.includes('ECONNRESET');
      const isAuthError = errorMsg.includes('authentication') || errorMsg.includes('unauthorized') || errorMsg.includes('expired') || errorMsg.includes('token');
      const isRateLimit = errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('too many requests');
      const isServerError = errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503') || errorMsg.includes('504');
      
      // Retry on transient errors (network, rate limit, server errors) but not auth errors
      const isTransientError = (isNetworkError || isRateLimit || isServerError) && !isAuthError;
      
      if (isTransientError && retryCount < maxRetries) {
        const delayMs = (retryCount + 1) * 1000; // Exponential backoff: 1s, 2s
        console.log(`🔄 [ProjectDetailPage] Retrying after ${delayMs}ms (attempt ${retryCount + 1}/${maxRetries})...`);
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
      
      setError(displayError);
      console.error('[ProjectDetailPage] Error fetching project data:', {
        error: err,
        message: errorMsg,
        projectId: projectIdOrKey,
        projectType: projectType,
        retryCount,
        stack: err?.stack
      });
      
      toast({
        title: "Error Loading Project",
        description: displayError,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch project data on mount
  // Memoize fetchData to ensure it's stable
  const fetchDataMemo = useCallback(async () => {
    await fetchData();
  }, [projectIdOrKey]); // fetchData uses projectIdOrKey from closure

  useEffect(() => {
    fetchData();
  }, [projectIdOrKey]);

  // Auto-refresh callback for webhook events
  const handleWebhookRefresh = useCallback(async () => {
    console.log('📡 Project Details: ========== AUTO-REFRESH TRIGGERED ==========');
    console.log('📡 Project Details: Project ID:', projectIdOrKey);
    console.log('📡 Project Details: Project Type:', projectType);
    console.log('📡 Project Details: Calling fetchData...');
    try {
      await fetchData(); // Call fetchData directly - it uses projectIdOrKey from closure
      setLastRefreshTime(new Date());
      console.log('📡 Project Details: ✅ Auto-refresh completed successfully');
    } catch (error) {
      console.error('📡 Project Details: ❌ Auto-refresh failed:', error);
    }
    console.log('📡 Project Details: ===========================================');
  }, [projectIdOrKey]); // Remove projectType dependency - fetchData will detect it

  // Memoize integration types - detect from projectId first to avoid re-subscription
  // This prevents re-subscription when projectType state is set later
  const integrationTypes = useMemo<Array<'JIRA' | 'TRELLO' | 'TESTRAIL'>>(() => {
    // Try to detect from projectId first (before projectType is set)
    const detectedType = detectProjectType(projectIdOrKey);
    return detectedType === 'jira' ? ['JIRA'] : 
           detectedType === 'trello' ? ['TRELLO'] : ['TESTRAIL'];
  }, [projectIdOrKey]); // Only depend on projectIdOrKey, not projectType state
  
  const { refreshing: webhookRefreshing, hasActivity } = useAutoRefresh({
    integrationTypes,
    onRefresh: handleWebhookRefresh,
    projectId: projectIdOrKey, // Only refresh for this specific project
    debounceMs: 2000,
    enabled: true,
  });

  // Handle filter changes
  const handleFilterChange = (newFilters: FilterOptions) => {
    setFilters(newFilters);
    const filtered = filterIssues(issues, newFilters);
    setFilteredIssues(filtered);
  };
  
  // Handle drill-down
  const handleStatusClick = (statusName: string) => {
    const statusIssues = getIssuesByStatus(filteredIssues, statusName);
    setDrilldownTitle(`Issues with Status: ${statusName}`);
    setDrilldownIssues(statusIssues);
    setDrilldownOpen(true);
  };
  
  const handleTypeClick = (typeName: string) => {
    const typeIssues = getIssuesByType(filteredIssues, typeName);
    setDrilldownTitle(`Issues of Type: ${typeName}`);
    setDrilldownIssues(typeIssues);
    setDrilldownOpen(true);
  };
  
  const handleAssigneeClick = (assigneeName: string) => {
    const assigneeIssues = getIssuesByAssignee(filteredIssues, assigneeName);
    setDrilldownTitle(`Issues Assigned to: ${assigneeName}`);
    setDrilldownIssues(assigneeIssues);
    setDrilldownOpen(true);
  };
  
  // Export functions
  const handleExportChart = (chartRef: React.RefObject<HTMLDivElement>, fileName: string) => {
    if (chartRef.current && chartRef.current.id) {
      exportChartAsImage(chartRef.current.id, fileName);
    }
  };
  
  const handleExportPDF = (chartRef: React.RefObject<HTMLDivElement>, fileName: string, title: string) => {
    if (chartRef.current && chartRef.current.id) {
      exportChartAsPDF(chartRef.current.id, fileName, title);
    }
  };
  
  const handleExportCSV = () => {
    const projectKey = project && isJiraProject(project) ? project.key : project && isTrelloProject(project) ? project.shortLink : 'project';
    exportIssuesAsCSV(filteredIssues, `${projectKey}-issues`);
  };
  
  const handlePrintChart = (chartRef: React.RefObject<HTMLDivElement>, title: string) => {
    if (chartRef.current && chartRef.current.id) {
      // If it's a Gantt chart, pass the issues data to convert to table
      if (chartRef.current.id === 'gantt-chart') {
        printElement(chartRef.current.id, title, filteredIssues);
      } else {
        printElement(chartRef.current.id, title);
      }
    }
  };
  
  const handleExportGanttAsCSV = () => {
    exportGanttAsCSV(filteredIssues, `${projectKey}-gantt-chart`);
  };
  
  // Share handler
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
          projectId: projectKey,
          projectType,
        }),
      });
      const data = await res.json();
      if (res.ok && data.shareUrl) {
        setShareUrl(data.shareUrl);
      } else {
        setShareUrl(null);
        toast({ title: "Share failed", description: data.error || "Could not create share link", variant: "destructive" });
      }
    } catch (e) {
      setShareUrl(null);
      toast({ title: "Share failed", description: "Could not create share link", variant: "destructive" });
    } finally {
      setShareLoading(false);
    }
  };

  // If loading or error, show appropriate message
  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Loading Project ${projectIdOrKey}`} description="Fetching project details..." />
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }
  
  if (error && !project) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Error for Project ${projectIdOrKey}`} description="Failed to load project details." />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex flex-col gap-3">
              <span>{error}</span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchData}
                  disabled={loading}
                  className="bg-white hover:bg-gray-50"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Retrying...' : 'Try Again'}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  if (!project) {
    notFound();
    return null;
  }
  
  // Generate chart data
  const statusChartData = processIssuesByStatus(filteredIssues);
  const typeChartData = processIssuesByType(filteredIssues);
  const assigneeChartData = processIssuesByAssignee(filteredIssues);
  const timelineChartData = processIssuesForTimeline(filteredIssues);
  const burndownData = processIssuesForBurndown(filteredIssues);
  const availableFilters = getAvailableFilterOptions(issues);

  // Get project-specific values using type guards
  const projectKey = isJiraProject(project) ? project.key : 
                    isTrelloProject(project) ? project.shortLink : 
                    projectIdOrKey;
  const projectDescription = isJiraProject(project) ? project.description : 
                           isTrelloProject(project) ? project.desc : 
                           undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.name || `Project ${projectIdOrKey}`}
        description={
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span>{projectDescription || `Detailed view of project ${projectKey}.`}</span>
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
        actions={
          <div className="flex items-center gap-2">
            {/* Webhook Status Indicator */}
            <WebhookStatusIndicator showLabel size="md" />
            
            <Button 
              onClick={fetchData} 
              variant="outline" 
              size="sm" 
              disabled={loading || webhookRefreshing}
              title="Refresh project data"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${(loading || webhookRefreshing) ? 'animate-spin' : ''}`} />
              {webhookRefreshing ? "Auto-updating..." : loading ? "Loading..." : "Refresh"}
            </Button>
            <Button onClick={handleShare} variant="outline" size="sm" disabled={shareLoading}>
              <Share2 className="mr-2 h-4 w-4" />
              {shareLoading ? "Sharing..." : "Share"}
            </Button>
          </div>
        }
      />

      {message && !error && (
        <Alert variant="default" className="bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertTitle>Status</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
      
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Issue Fetching Error</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex flex-col gap-3">
              <span>{error}</span>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchData}
                  disabled={loading}
                  className="bg-white hover:bg-gray-50"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Retrying...' : 'Try Again'}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Column 1: Project Info & Key Stats */}
        <Card className="lg:col-span-1 shadow-lg">
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
            <CardDescription>Key: {projectKey} (ID: {project.id})</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Type: {isJiraProject(project) ? project.projectTypeKey || 'N/A' : 
                    isTrelloProject(project) ? 'Trello Board' : 'N/A'}
            </p>
            {isJiraProject(project) && project.lead && <p className="text-sm text-muted-foreground">Lead: {project.lead.displayName}</p>}
            {isTrelloProject(project) && project.members.length > 0 && <p className="text-sm text-muted-foreground">Members: {project.members.length}</p>}
            {projectDescription && <p className="mt-2 text-sm">{projectDescription}</p>}
            <h3 className="font-semibold mt-4 mb-2 text-md">Quick Stats</h3>
              <ul className="list-disc list-inside text-sm">
              <li>Total Issues: {filteredIssues.length}</li>
              {statusChartData.map((status) => (
                <li key={status.name}>
                  {status.name}: {status.value}
                </li>
              ))}
              </ul>
            <div className="mt-6">
              <h3 className="font-semibold mb-2 text-md">Export Options</h3>
              <div className="flex flex-col gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportCSV}
                  className="justify-start"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export All Issues as CSV
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => window.print()}
                  className="justify-start"
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Dashboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Column 2 & 3: Charts Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Filters */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Dashboard Filters</CardTitle>
              <CardDescription>Filter the charts below by various criteria</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartFilters 
                availableFilters={availableFilters}
                onFilterChange={handleFilterChange}
              />
              <div className="text-xs text-muted-foreground mt-2">
                Showing {filteredIssues.length} of {issues.length} issues
              </div>
            </CardContent>
          </Card>
          
          {/* Charts Tabs */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Project Analytics</CardTitle>
              <CardDescription>Interactive charts showing project metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="distribution">
                <TabsList className="mb-4">
                  <TabsTrigger value="distribution">Distribution</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="burndown">Burndown</TabsTrigger>
                  <TabsTrigger value="gantt">Gantt View</TabsTrigger>
                </TabsList>
                
                {/* Distribution Charts */}
                <TabsContent value="distribution" className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Status Distribution Chart */}
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle className="text-base">Status Distribution</CardTitle>
                            <CardDescription>Issues by current status</CardDescription>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleExportChart(statusChartRef, `${projectKey}-status-chart`)}
                              title="Export as Image"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handlePrintChart(statusChartRef, "Status Distribution")}
                              title="Print Chart"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div id="status-chart" ref={statusChartRef}>
                          <IssuesByStatusPieChart 
                            data={statusChartData} 
                            onSliceClick={handleStatusClick}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Issue Type Chart */}
                    <Card>
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle className="text-base">Issue Types</CardTitle>
                            <CardDescription>Distribution by issue type</CardDescription>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleExportChart(typeChartRef, `${projectKey}-type-chart`)}
                              title="Export as Image"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handlePrintChart(typeChartRef, "Issue Types")}
                              title="Print Chart"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div id="type-chart" ref={typeChartRef}>
                          <IssuesByTypeBarChart 
                            data={typeChartData} 
                            onBarClick={handleTypeClick}
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Assignee Chart */}
                    <Card className="md:col-span-2">
                      <CardHeader className="pb-2">
                        <div className="flex justify-between items-center">
                          <div>
                            <CardTitle className="text-base">Assignee Workload</CardTitle>
                            <CardDescription>Issues assigned per team member</CardDescription>
                          </div>
                          <div className="flex gap-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleExportChart(assigneeChartRef, `${projectKey}-assignee-chart`)}
                              title="Export as Image"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handlePrintChart(assigneeChartRef, "Assignee Workload")}
                              title="Print Chart"
                            >
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div id="assignee-chart" ref={assigneeChartRef}>
                          <IssuesByAssigneeChart 
                            data={assigneeChartData} 
                            onBarClick={handleAssigneeClick}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
                
                {/* Timeline Chart */}
                <TabsContent value="timeline">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-base">Issues Timeline</CardTitle>
                          <CardDescription>Created vs. Resolved issues over time</CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleExportChart(timelineChartRef, `${projectKey}-timeline-chart`)}
                            title="Export as Image"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handlePrintChart(timelineChartRef, "Issues Timeline")}
                            title="Print Chart"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div id="timeline-chart" ref={timelineChartRef}>
                        <IssuesByTimelineChart data={timelineChartData} />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
                
                {/* Burndown Chart */}
                <TabsContent value="burndown">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-base">Sprint Burndown</CardTitle>
                          <CardDescription>Remaining work over time</CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleExportChart(burndownChartRef, `${projectKey}-burndown-chart`)}
                            title="Export as Image"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handlePrintChart(burndownChartRef, "Sprint Burndown")}
                            title="Print Chart"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div id="burndown-chart" ref={burndownChartRef}>
                        <BurndownChart 
                          data={burndownData.data} 
                          startDate={burndownData.startDate}
                          endDate={burndownData.endDate}
                          totalScope={burndownData.totalScope}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Gantt View Tab */}
                <TabsContent value="gantt" className="space-y-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-center">
                        <div>
                          <CardTitle className="text-base">Gantt Chart</CardTitle>
                          <CardDescription>Project timeline and task dependencies</CardDescription>
                        </div>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={handleExportGanttAsCSV}
                            title="Export as CSV"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => {
                              const element = document.getElementById('gantt-chart') as HTMLDivElement;
                              if (element) {
                                handlePrintChart({ current: element }, "Project Gantt Chart");
                              }
                            }}
                            title="Print Chart"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div id="gantt-chart">
                        <GanttChart 
                          issues={filteredIssues}
                          title="Project Tasks Timeline"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Drilldown Modal */}
      <ChartDrilldown
        isOpen={drilldownOpen}
        onClose={() => setDrilldownOpen(false)}
        title={drilldownTitle}
        issues={drilldownIssues}
        projectType={projectType}
        boardId={projectType === 'trello' ? projectIdOrKey : undefined}
        onExport={() => exportIssuesAsCSV(drilldownIssues, `${projectKey}-${drilldownTitle.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`)}
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

      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Project Snapshot</DialogTitle>
            <DialogDescription>
              Anyone with this link can view a snapshot of this project as it was when shared.
            </DialogDescription>
          </DialogHeader>
          {shareUrl ? (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={shareUrl}
                readOnly
                className="w-full px-3 py-2 border border-border rounded-md bg-card text-foreground text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
                onFocus={e => e.target.select()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  toast({ title: "Link copied!", description: "You can now share it with anyone." });
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copy Link
              </Button>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Generating share link...</div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setShareDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
