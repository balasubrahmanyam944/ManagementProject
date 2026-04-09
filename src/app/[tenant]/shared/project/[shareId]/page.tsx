"use client";

import { useState, useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, CheckCircle, Download, Printer, Share2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
  printElement 
} from "@/lib/chart-export";

interface SharedProjectData {
  id: string;
  shareId: string;
  projectId: string;
  projectType: 'jira' | 'trello' | 'testrail';
  name: string;
  key?: string;
  externalId: string;
  description?: string;
  analytics: {
    totalIssues: number;
    openIssues: number;
    inProgressIssues: number;
    doneIssues: number;
    statusCounts: Record<string, number>;
    typeCounts: Record<string, number>;
    dataSource: string;
    lastUpdated: string;
  };
  issues: any[];

  sharedAt: string;
  sharedBy: string;
  expiresAt?: string;
}

export default function TenantSharedProjectPage() {
  const params = useParams();
  const pathname = usePathname();
  const shareId = params.shareId as string;
  const tenant = params.tenant as string;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<SharedProjectData | null>(null);
  const [filteredIssues, setFilteredIssues] = useState<any[]>([]);
  const [chartFilters, setChartFilters] = useState<FilterOptions>({});
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<any[]>([]);

  // For tenant routes, we're already on the correct path, so no redirect needed
  // The redirect logic is only needed for the root /shared/project/[shareId] route
  // This tenant route already has the tenant in the path, so skip redirect check

  // Fetch shared project data
  useEffect(() => {
    if (!shareId) return;
    
    const fetchSharedData = async () => {
      try {
        setLoading(true);
        setError(null); // Clear any previous errors
        // Extract basePath from pathname - everything before /shared/project/...
        const basePath = pathname.substring(0, pathname.indexOf('/shared/project')) || process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
        const apiUrl = `${basePath}/api/shared/project?shareId=${shareId}`;
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(apiUrl, {
          signal: controller.signal,
          cache: 'no-store', // Ensure fresh data
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `Failed to load shared project (${response.status})`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.data) {
          throw new Error(data.error || 'Invalid response from server');
        }
        
        setProjectData(data.data);
        setFilteredIssues(data.data.issues || []);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setError('Request timed out. Please try again.');
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load shared project data');
        }
        console.error('Error fetching shared project:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSharedData();
  }, [shareId, pathname]);

  // Process chart data
  const statusChartData = processIssuesByStatus(filteredIssues as any[]);
  const typeChartData = processIssuesByType(filteredIssues as any[]);
  const assigneeChartData = processIssuesByAssignee(filteredIssues as any[]);
  const timelineChartData = processIssuesForTimeline(filteredIssues as any[]);
  const burndownResult = processIssuesForBurndown(filteredIssues as any[]);
  const burndownChartData = burndownResult.data;

  // Calculate analytics from converted issues to match chart data
  const calculatedAnalytics = {
    totalIssues: filteredIssues.length,
    openIssues: filteredIssues.filter(i => ['Open', 'To Do', 'Backlog', 'Untested'].includes(i.status?.name || i.status || '')).length,
    inProgressIssues: filteredIssues.filter(i => ['In Progress', 'In Review', 'Testing'].includes(i.status?.name || i.status || '')).length,
    doneIssues: filteredIssues.filter(i => ['Done', 'Closed', 'Resolved', 'Passed'].includes(i.status?.name || i.status || '')).length,
    statusCounts: statusChartData.reduce((acc, item) => ({ ...acc, [item.name]: item.value }), {}),
    typeCounts: typeChartData.reduce((acc, item) => ({ ...acc, [item.name]: item.value }), {}),
    dataSource: projectData?.analytics.dataSource || 'snapshot',
    lastUpdated: projectData?.analytics.lastUpdated || new Date().toISOString(),
  };

  // Use calculated analytics instead of raw analytics from database
  const analytics = calculatedAnalytics;

  // Handle chart filtering
  const handleFilterChange = (newFilters: FilterOptions) => {
    // This would typically update the filtered issues
    // For now, we'll just log the filter change
    console.log('Filter changed:', newFilters);
  };

  // Helper functions to get issue properties
  const getIssueStatus = (issue: any) => issue.status?.name || 'Unknown';
  const getIssueType = (issue: any) => issue.issuetype?.name || 'Unknown';
  const getIssueAssignee = (issue: any) => issue.assignee?.displayName || 'Unassigned';
  const getIssuePriority = (issue: any) => issue.priority?.name || 'Medium';

  // Handle chart drilldown
  const handleChartDrilldown = (chartType: string, filterValue: string) => {
    setSelectedChart(chartType);
    
    // Filter issues based on the chart type and clicked value
    let filtered: any[] = [];
    switch (chartType) {
      case 'status':
        filtered = filteredIssues.filter(issue => getIssueStatus(issue) === filterValue);
        break;
      case 'type':
        filtered = filteredIssues.filter(issue => getIssueType(issue) === filterValue);
        break;
      case 'assignee':
        filtered = filteredIssues.filter(issue => getIssueAssignee(issue) === filterValue);
        break;
      default:
        filtered = filteredIssues;
    }
    
    setDrilldownData(filtered);
  };

  // Handle export
  const handleExport = async (format: 'image' | 'pdf' | 'csv') => {
    try {
      const chartId = selectedChart || 'status';
      const fileName = `${projectData?.name || 'Project'}-${chartId}`;
      
      switch (format) {
        case 'image':
          await exportChartAsImage(chartId, fileName);
          break;
        case 'pdf':
          await exportChartAsPDF(chartId, fileName, projectData?.name);
          break;
        case 'csv':
          await exportIssuesAsCSV(filteredIssues, projectData?.name || 'Project');
          break;
      }
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Handle print
  const handlePrint = () => {
    setTimeout(() => {
      const element = document.getElementById('drilldown-content');
      if (element) {
        // Pass the issues data to printElement so it can convert to table format
        printElement('drilldown-content', selectedChart ? `${selectedChart} Details` : 'Issues Details', drilldownData).catch(err => {
          console.error('Print error:', err);
        });
      }
    }, 100);
  };

  // Loading state
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-96" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !projectData) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Shared Project</AlertTitle>
          <AlertDescription>{error || 'Project data not found'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Expired state
  if (projectData.expiresAt && new Date(projectData.expiresAt) < new Date()) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Shared Link Expired</AlertTitle>
          <AlertDescription>
            This shared project link has expired. Please request a new link from the project owner.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6" id="project-dashboard">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <CardTitle className="text-3xl font-bold">{projectData.name}</CardTitle>
                <Badge variant="outline" className="text-xs">
                  {projectData.projectType.toUpperCase()}
                </Badge>
                {projectData.key && (
                  <Badge variant="secondary" className="text-xs">
                    {projectData.key}
                  </Badge>
                )}
              </div>
              {projectData.description && (
                <CardDescription className="text-base">
                  {projectData.description}
                </CardDescription>
              )}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Shared by: {projectData.sharedBy}</span>
                <span>•</span>
                <span>Shared on: {new Date(projectData.sharedAt).toLocaleDateString()}</span>
                <span>•</span>
                <Badge variant="outline" className="text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Snapshot
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Analytics Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Issues</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalIssues}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{analytics.openIssues}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{analytics.inProgressIssues}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Done</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{analytics.doneIssues}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card>
        <CardHeader>
          <CardTitle>Project Analytics</CardTitle>
          <CardDescription>
            Visual representation of project data at the time it was shared
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="status" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="type">Type</TabsTrigger>
              <TabsTrigger value="assignee">Assignee</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="burndown">Burndown</TabsTrigger>
              <TabsTrigger value="gantt">Gantt View</TabsTrigger>
            </TabsList>

            <TabsContent value="status" className="mt-6">
              <IssuesByStatusPieChart 
                data={statusChartData}
                onSliceClick={(statusName) => handleChartDrilldown('status', statusName)}
              />
            </TabsContent>

            <TabsContent value="type" className="mt-6">
              <IssuesByTypeBarChart 
                data={typeChartData}
                onBarClick={(typeName) => handleChartDrilldown('type', typeName)}
              />
            </TabsContent>

            <TabsContent value="assignee" className="mt-6">
              <IssuesByAssigneeChart 
                data={assigneeChartData}
                onBarClick={(assigneeName) => handleChartDrilldown('assignee', assigneeName)}
              />
            </TabsContent>

            <TabsContent value="timeline" className="mt-6">
              <IssuesByTimelineChart data={timelineChartData} />
            </TabsContent>

            <TabsContent value="burndown" className="mt-6">
              <BurndownChart data={burndownChartData} />
            </TabsContent>

            <TabsContent value="gantt" className="mt-6">
              <GanttChart 
                issues={filteredIssues}
                title={`${projectData.name} - Gantt View`}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Drilldown Dialog */}
      <ChartDrilldown
        isOpen={!!selectedChart && drilldownData.length > 0}
        onClose={() => {
          setSelectedChart(null);
          setDrilldownData([]);
        }}
        title={`${selectedChart ? selectedChart.charAt(0).toUpperCase() + selectedChart.slice(1) : ''} Details`}
        description="Detailed view of issues in this category"
        issues={drilldownData}
        onExport={() => handleExport('csv')}
        onPrint={handlePrint}
      />
    </div>
  );
}

