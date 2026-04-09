"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle, X, Settings2, Calendar, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations, type Project } from "@/hooks/useIntegrations";
import { 
  getJiraProjectDetailsAction
} from "@/lib/integrations/jira-integration";
import { 
  getTrelloProjectDetailsAction
} from "@/lib/integrations/trello-integration";
import { 
  getTestRailProjectDetailsAction
} from "@/lib/integrations/testrail-integration";
import { JiraDashboardIssue, TestRailTestCase } from "@/types/integrations";
import { convertTrelloCardsToIssues } from "@/lib/chart-data-utils";
import MultiProjectGanttChart from "@/components/charts/MultiProjectGanttChart";
import CalendarGanttChart from "@/components/charts/CalendarGanttChart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProjectWithIssues {
  project: Project;
  issues: JiraDashboardIssue[];
}

export default function GanttViewPage() {
  const { integrations, projects, loading: projectsLoading } = useIntegrations();
  
  // Debug: Log integration status
  useEffect(() => {
    console.log('Gantt View - Integrations:', integrations);
    console.log('Gantt View - Projects:', projects);
  }, [integrations, projects]);
  
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [projectsWithIssues, setProjectsWithIssues] = useState<ProjectWithIssues[]>([]);
  const [loadingIssues, setLoadingIssues] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  // Combine all projects from different integrations
  const allProjects = useMemo(() => {
    const combined: Project[] = [];
    
    if (projects.jira && projects.jira.length > 0) {
      combined.push(...projects.jira.map(p => ({ ...p, integrationType: 'JIRA' })));
    }
    if (projects.trello && projects.trello.length > 0) {
      combined.push(...projects.trello.map(p => ({ ...p, integrationType: 'TRELLO' })));
    }
    if (projects.testrail && projects.testrail.length > 0) {
      combined.push(...projects.testrail.map(p => ({ ...p, integrationType: 'TESTRAIL' })));
    }
    
    return combined;
  }, [projects]);

  // Get project identifier (key for Jira, externalId for others)
  const getProjectIdentifier = (project: Project): string => {
    if (project.integrationType === 'JIRA' && project.key) {
      return project.key;
    }
    return project.externalId;
  };

  // Detect project type based on ID format
  const detectProjectType = (projectId: string): 'jira' | 'trello' | 'testrail' => {
    if (projectId.length === 24 && /^[a-zA-Z0-9]+$/.test(projectId)) {
      return 'trello';
    }
    if (/^\d+$/.test(projectId)) {
      return 'testrail';
    }
    if (projectId.length <= 10 && /^[A-Z][A-Z0-9-]*$/.test(projectId)) {
      return 'jira';
    }
    return 'jira';
  };

  // Fetch issues for selected projects
  useEffect(() => {
    const fetchProjectIssues = async () => {
      if (selectedProjectIds.length === 0) {
        setProjectsWithIssues([]);
        return;
      }

      setLoadingIssues(true);
      setError(null);

      try {
        const results: ProjectWithIssues[] = [];

        for (const projectId of selectedProjectIds) {
          const project = allProjects.find(p => getProjectIdentifier(p) === projectId);
          if (!project) continue;

          const detectedType = detectProjectType(projectId);
          let issues: JiraDashboardIssue[] = [];

          try {
            if (detectedType === 'trello') {
              const response = await getTrelloProjectDetailsAction(projectId);
              if (response.success && response.cards) {
                issues = convertTrelloCardsToIssues(response.cards);
              }
            } else if (detectedType === 'testrail') {
              const response = await getTestRailProjectDetailsAction(projectId);
              if (response.success && response.testCases) {
                const cases: TestRailTestCase[] = response.testCases as TestRailTestCase[];
                const nowIso = new Date().toISOString();
                issues = cases.map((c, idx) => ({
                  id: String(c.id ?? idx),
                  key: `TC-${c.id ?? idx}`,
                  summary: c.title || `Test case ${c.id}`,
                  status: { 
                    id: String(c.status?.id ?? 1),
                    name: c.status?.name || 'Untested',
                    statusCategory: { id: 1, name: 'To Do' }
                  },
                  issuetype: { id: 'testcase', name: 'TestCase', iconUrl: '' },
                  assignee: undefined,
                  priority: { id: 'medium', name: 'Medium', iconUrl: '' },
                  created: nowIso,
                  updated: nowIso,
                  description: c.title || ''
                }));
              }
            } else if (detectedType === 'jira') {
              const response = await getJiraProjectDetailsAction(projectId);
              if (response.success && response.issues) {
                issues = response.issues;
              }
            }

            results.push({ project, issues });
          } catch (err) {
            console.error(`Failed to fetch issues for project ${projectId}:`, err);
          }
        }

        // Fetch cross-project dependencies if we have issues
        if (results.length > 0) {
          try {
            const allIssues = results.flatMap(pwi => pwi.issues);
            const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';
            const depsResponse = await fetch(
              `${basePath}/api/dependencies?projectIds=${selectedProjectIds.join(',')}&taskIds=${allIssues.map(i => i.id).join(',')}`
            );
            
            if (depsResponse.ok) {
              const depsData = await depsResponse.json();
              if (depsData.success && depsData.dependencies) {
                const depsByTask: Record<string, {
                  dependsOn: any[];
                  blockedBy: any[];
                }> = {};
                
                depsData.dependencies.forEach((dep: any) => {
                  const sourceKey = `${dep.sourceProjectId}:${dep.sourceTaskId}`;
                  if (!depsByTask[sourceKey]) {
                    depsByTask[sourceKey] = { dependsOn: [], blockedBy: [] };
                  }
                  
                  const targetProject = allProjects.find(p => 
                    p.id === dep.targetProjectId || p.externalId === dep.targetProjectId
                  );
                  
                  if (dep.dependencyType === 'depends_on') {
                    depsByTask[sourceKey].dependsOn.push({
                      taskId: dep.targetTaskId,
                      taskKey: dep.targetTaskKey,
                      taskSummary: dep.targetTaskSummary,
                      projectId: dep.targetProjectId,
                      projectName: targetProject?.name || 'Unknown',
                    });
                  } else if (dep.dependencyType === 'blocked_by') {
                    depsByTask[sourceKey].blockedBy.push({
                      taskId: dep.targetTaskId,
                      taskKey: dep.targetTaskKey,
                      taskSummary: dep.targetTaskSummary,
                      projectId: dep.targetProjectId,
                      projectName: targetProject?.name || 'Unknown',
                    });
                  }
                });
                
                // Attach dependencies to issues
                results.forEach(pwi => {
                  pwi.issues = pwi.issues.map(issue => {
                    const projectId = pwi.project.id || pwi.project.externalId;
                    const key = `${projectId}:${issue.id}`;
                    const deps = depsByTask[key];
                    return {
                      ...issue,
                      dependencies: deps || { dependsOn: [], blockedBy: [] }
                    };
                  });
                });
              }
            }
          } catch (depErr) {
            console.error('Error fetching dependencies:', depErr);
            // Don't fail the whole operation if dependencies fail
          }
        }

        setProjectsWithIssues(results);
      } catch (err) {
        console.error('Error fetching project issues:', err);
        setError('Failed to fetch project issues. Please try again.');
        toast({
          title: "Error",
          description: "Failed to fetch project issues",
          variant: "destructive"
        });
      } finally {
        setLoadingIssues(false);
      }
    };

    fetchProjectIssues();
  }, [selectedProjectIds, allProjects, toast]);

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds(prev => {
      if (prev.includes(projectId)) {
        return prev.filter(id => id !== projectId);
      } else {
        return [...prev, projectId];
      }
    });
  };

  const removeProject = (projectId: string) => {
    setSelectedProjectIds(prev => prev.filter(id => id !== projectId));
  };

  const selectedProjects = useMemo(() => {
    return allProjects.filter(p => selectedProjectIds.includes(getProjectIdentifier(p)));
  }, [allProjects, selectedProjectIds]);

  const allIssuesWithProject = useMemo(() => {
    return projectsWithIssues.flatMap(pwi => 
      pwi.issues.map(issue => ({
        ...issue,
        projectName: pwi.project.name,
        projectKey: pwi.project.key || pwi.project.externalId,
        integrationType: pwi.project.integrationType
      }))
    );
  }, [projectsWithIssues]);

  if (projectsLoading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Gantt View" description="Loading projects..." />
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 overflow-hidden">
      <PageHeader
        title="Multi-Project Gantt View"
        description="View and compare timelines across multiple projects"
      />

      {/* Project Selection Section */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Select Projects</CardTitle>
          <CardDescription>
            Choose multiple projects to view their combined timeline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <Settings2 className="mr-2 h-4 w-4" />
                  {selectedProjectIds.length === 0
                    ? "Select projects..."
                    : `${selectedProjectIds.length} project(s) selected`}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Select Projects</DialogTitle>
                  <DialogDescription>
                    Choose the projects you want to include in the combined Gantt chart.
                  </DialogDescription>
                </DialogHeader>
                
                <ScrollArea className="max-h-[400px] pr-4">
                  <div className="space-y-4">
                    {integrations && integrations.jira?.connected && projects.jira && projects.jira.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">JIRA</Badge>
                          Jira Projects
                        </h4>
                        <div className="space-y-2 ml-2">
                          {projects.jira.map((project) => {
                            const projectId = project.key || project.externalId;
                            const isSelected = selectedProjectIds.includes(projectId);
                            return (
                              <div key={project.id} className="flex items-center space-x-3">
                                <Checkbox
                                  id={`project-${projectId}`}
                                  checked={isSelected}
                                  onCheckedChange={() => toggleProject(projectId)}
                                />
                                <label
                                  htmlFor={`project-${projectId}`}
                                  className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
                                >
                                  <span>{project.name}</span>
                                  {project.key && (
                                    <span className="text-muted-foreground text-xs">({project.key})</span>
                                  )}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {integrations && integrations.trello?.connected && projects.trello && projects.trello.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">TRELLO</Badge>
                          Trello Boards
                        </h4>
                        <div className="space-y-2 ml-2">
                          {projects.trello.map((project) => {
                            const projectId = project.externalId;
                            const isSelected = selectedProjectIds.includes(projectId);
                            return (
                              <div key={project.id} className="flex items-center space-x-3">
                                <Checkbox
                                  id={`project-${projectId}`}
                                  checked={isSelected}
                                  onCheckedChange={() => toggleProject(projectId)}
                                />
                                <label
                                  htmlFor={`project-${projectId}`}
                                  className="text-sm font-medium leading-none cursor-pointer"
                                >
                                  {project.name}
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {integrations && integrations.testrail?.connected && projects.testrail && projects.testrail.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">TESTRAIL</Badge>
                          TestRail Projects
                        </h4>
                        <div className="space-y-2 ml-2">
                          {projects.testrail.map((project) => {
                            const projectId = project.externalId;
                            const isSelected = selectedProjectIds.includes(projectId);
                            return (
                              <div key={project.id} className="flex items-center space-x-3">
                                <Checkbox
                                  id={`project-${projectId}`}
                                  checked={isSelected}
                                  onCheckedChange={() => toggleProject(projectId)}
                                />
                                <label
                                  htmlFor={`project-${projectId}`}
                                  className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2"
                                >
                                  <span>{project.name}</span>
                                  <span className="text-muted-foreground text-xs">(ID: {project.externalId})</span>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(!integrations || (!integrations.jira?.connected && !integrations.trello?.connected && !integrations.testrail?.connected)) ||
                     ((!projects.jira || projects.jira.length === 0) && 
                      (!projects.trello || projects.trello.length === 0) &&
                      (!projects.testrail || projects.testrail.length === 0)) && (
                      <div className="text-center py-8">
                        <div className="mb-4">
                          <Settings2 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        </div>
                        <h4 className="text-lg font-semibold mb-2">No Tools Connected</h4>
                        <p className="text-sm text-muted-foreground mb-4">
                          Connect your project management tools to view projects here.
                        </p>
                        <Link href="/integrations">
                          <Button size="sm" variant="outline">
                            Connect Tools
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setSelectedProjectIds([])}>
                    Clear All
                  </Button>
                  <Button onClick={() => setDialogOpen(false)}>
                    Done
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {selectedProjects.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedProjects.map((project) => {
                  const projectId = getProjectIdentifier(project);
                  return (
                    <Badge
                      key={projectId}
                      variant="secondary"
                      className="flex items-center gap-1 py-1 px-2"
                    >
                      <span className="text-xs font-medium">
                        {project.integrationType === 'JIRA' ? '🔷' : project.integrationType === 'TRELLO' ? '📋' : '🧪'} {project.name}
                      </span>
                      <button
                        onClick={() => removeProject(projectId)}
                        className="ml-1 hover:bg-muted rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gantt Chart Section */}
      <Card className="shadow-lg overflow-hidden">
        <CardHeader>
          <CardTitle>Combined Timeline</CardTitle>
          <CardDescription>
            {selectedProjectIds.length === 0
              ? "Select projects above to view their combined Gantt chart"
              : `Showing ${allIssuesWithProject.length} issues from ${selectedProjectIds.length} project(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loadingIssues ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Loading project issues...</p>
            </div>
          ) : selectedProjectIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-6 mb-4">
                <Settings2 className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Projects Selected</h3>
              <p className="text-muted-foreground max-w-md">
                Use the &quot;Select Projects&quot; button above to choose one or more projects. 
                Their issues will be displayed in a combined Gantt chart.
              </p>
            </div>
          ) : allIssuesWithProject.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="rounded-full bg-muted p-6 mb-4">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Issues Found</h3>
              <p className="text-muted-foreground max-w-md">
                The selected projects don&apos;t have any issues to display. 
                Try selecting different projects.
              </p>
            </div>
          ) : (
            <Tabs defaultValue="calendar" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="calendar" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Calendar View
                </TabsTrigger>
                <TabsTrigger value="gantt" className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Gantt View
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="calendar" className="mt-0">
                <CalendarGanttChart 
                  issues={allIssuesWithProject}
                  title="Calendar View"
                />
              </TabsContent>
              
              <TabsContent value="gantt" className="mt-0">
                <div className="overflow-hidden">
                  <MultiProjectGanttChart 
                    issues={allIssuesWithProject}
                    title="Multi-Project Timeline"
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

