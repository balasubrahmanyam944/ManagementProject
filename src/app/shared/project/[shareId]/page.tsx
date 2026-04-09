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
  name: string;
  key?: string;
  externalId?: string;
  description?: string;
  projectType: 'jira' | 'trello';
  analytics: {
    totalIssues: number;
    openIssues: number;
    inProgressIssues: number;
    doneIssues: number;
    statusCounts: Record<string, number>;
    typeCounts: Record<string, number>;
  };
  issues: any[];
  sharedAt: string;
  sharedBy: string;
  expiresAt?: string;
}

export default function SharedProjectPage() {
  const params = useParams();
  const shareId = params.shareId as string;
  const pathname = usePathname();
  
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  
  // This route handles /shared/project/[shareId] without tenant prefix
  // Redirect to tenant route if tenant base path is configured
  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
    
    // Only redirect if:
    // 1. basePath is configured
    // 2. shareId exists
    // 3. We're NOT already on the tenant path (prevent redirect loops)
    // 4. We haven't already set redirecting (prevent multiple redirects)
    if (basePath && shareId && !pathname.startsWith(basePath) && !redirecting) {
      console.log(`🔄 Redirecting from ${pathname} to ${basePath}/shared/project/${shareId}`);
      setRedirecting(true);
      // Use replace instead of href to prevent flickering and back button issues
      window.location.replace(`${basePath}/shared/project/${shareId}`);
      return;
    }
  }, [shareId, pathname, redirecting]);
  
  // Show minimal loading state if redirecting
  if (redirecting) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Skeleton className="h-8 w-64 mx-auto mb-4" />
            <p className="text-muted-foreground">Redirecting...</p>
          </div>
        </div>
      </div>
    );
  }
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<SharedProjectData | null>(null);
  const [filteredIssues, setFilteredIssues] = useState<any[]>([]);
  const [chartFilters, setChartFilters] = useState<FilterOptions>({});
  const [selectedChart, setSelectedChart] = useState<string | null>(null);
  const [drilldownData, setDrilldownData] = useState<any[]>([]);

  // Fetch shared project data
  useEffect(() => {
    if (!shareId || redirecting) return;
    
    const fetchSharedData = async () => {
      try {
        setLoading(true);
        setError(null); // Clear any previous errors
        // Use basePath for API calls
        const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
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
  }, [shareId, redirecting]);

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
    openIssues: statusChartData.filter(s => !s.name.toLowerCase().includes('done') && !s.name.toLowerCase().includes('complete') && !s.name.toLowerCase().includes('close') && !s.name.toLowerCase().includes('passed')).reduce((sum, s) => sum + s.value, 0),
    inProgressIssues: statusChartData.filter(s => s.name.toLowerCase().includes('progress') || s.name.toLowerCase().includes('doing') || s.name.toLowerCase().includes('review') || s.name.toLowerCase().includes('blocked')).reduce((sum, s) => sum + s.value, 0),
    doneIssues: statusChartData.filter(s => s.name.toLowerCase().includes('done') || s.name.toLowerCase().includes('complete') || s.name.toLowerCase().includes('close') || s.name.toLowerCase().includes('passed')).reduce((sum, s) => sum + s.value, 0),
    statusCounts: Object.fromEntries(statusChartData.map(s => [s.name, s.value])),
    typeCounts: Object.fromEntries(typeChartData.map(t => [t.name, t.value])),
    dataSource: 'live' as const,
    lastUpdated: new Date().toISOString()
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
    printElement('project-dashboard');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Shared Project</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!projectData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project Not Found</AlertTitle>
          <AlertDescription>The shared project data could not be found or has expired.</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Check if shared data has expired
  const isExpired = projectData.expiresAt && new Date(projectData.expiresAt) < new Date();

  return (
    <div className="container mx-auto px-4 py-8" id="project-dashboard">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Shared: {projectData.name}</h1>
            <p className="text-muted-foreground">
              Project data shared on {new Date(projectData.sharedAt).toLocaleDateString()} by {projectData.sharedBy}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleExport('csv')} variant="outline" size="sm">
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={handlePrint} variant="outline" size="sm">
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        {isExpired && (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Shared Link Expired</AlertTitle>
            <AlertDescription>
              This shared link has expired. The data shown is from when it was originally shared.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Column 1: Project Info & Key Stats */}
          <Card className="lg:col-span-1 shadow-lg">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>
                {projectData.projectType === 'jira' ? `Key: ${projectData.key}` : `Board ID: ${projectData.externalId}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Type: {projectData.projectType === 'jira' ? 'Jira Project' : 'Trello Board'}
              </p>
              {projectData.description && (
                <p className="mt-2 text-sm">{projectData.description}</p>
              )}
              
              <h3 className="font-semibold mt-4 mb-2 text-md">Quick Stats</h3>
              <ul className="list-disc list-inside text-sm">
                <li>Total Issues: {analytics.totalIssues}</li>
                <li>Open Issues: {analytics.openIssues}</li>
                <li>In Progress: {analytics.inProgressIssues}</li>
                <li>Done: {analytics.doneIssues}</li>
              </ul>

              <div className="mt-4">
                <h4 className="font-semibold text-sm mb-2">Status Breakdown</h4>
                {Object.entries(analytics.statusCounts).map(([status, count]) => (
                  <div key={status} className="flex justify-between text-sm">
                    <span>{status}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <h4 className="font-semibold text-sm mb-2">Type Breakdown</h4>
                {Object.entries(analytics.typeCounts).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span>{type}</span>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Column 2: Charts */}
          <Card className="lg:col-span-2 shadow-lg">
            <CardHeader>
              <CardTitle>Analytics Dashboard</CardTitle>
              <CardDescription>
                {filteredIssues.length} issues • Last updated: {analytics.lastUpdated}
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
                    title="Project Tasks Timeline"
                  />
                </TabsContent>
              </Tabs>

              {/* Chart Filters */}
              <div className="mt-6">
                <ChartFilters 
                  availableFilters={{
                    statuses: Array.from(new Set(filteredIssues.map(i => getIssueStatus(i)))),
                    types: Array.from(new Set(filteredIssues.map(i => getIssueType(i)))),
                    assignees: Array.from(new Set(filteredIssues.map(i => getIssueAssignee(i)).filter(Boolean))),
                    priorities: Array.from(new Set(filteredIssues.map(i => getIssuePriority(i)))),
                  }}
                  onFilterChange={handleFilterChange}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Drilldown Modal */}
        {selectedChart && drilldownData.length > 0 && (
          <ChartDrilldown
            isOpen={!!selectedChart}
            onClose={() => {
              setSelectedChart(null);
              setDrilldownData([]);
            }}
            title={`${selectedChart} Details`}
            issues={drilldownData}
            onExport={() => exportIssuesAsCSV(drilldownData, `${projectData.name}-${selectedChart}`)}
            onPrint={async () => {
              setTimeout(() => {
                const element = document.getElementById('drilldown-content');
                if (element) {
                  // Pass the issues data to printElement so it can convert to table format
                  printElement('drilldown-content', `${selectedChart} Details`, drilldownData).catch(err => {
                    console.error('Print error:', err);
                  });
                }
              }, 100);
            }}
          />
        )}
      </div>
    </div>
  );
} 