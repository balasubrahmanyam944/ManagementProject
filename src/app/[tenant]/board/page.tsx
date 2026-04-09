"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Loader2, 
  AlertTriangle, 
  Link2, 
  CheckCircle2, 
  Calendar,
  Plus,
  Bookmark,
  Filter,
  Settings,
  Merge,
  Trash2,
  GripVertical,
  Columns3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations, Project } from "@/hooks/useIntegrations";
import { JiraDashboardIssue } from "@/types/integrations";
import { getJiraProjectDetailsAction } from "@/lib/integrations/jira-integration";
import { getTrelloProjectDetailsAction } from "@/lib/integrations/trello-integration";
import { convertTrelloCardsToIssues } from "@/lib/chart-data-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

// DnD Kit imports
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Types
interface TaskWithProject extends JiraDashboardIssue {
  projectId: string;
  projectName: string;
  projectKey?: string;
  integrationType: 'JIRA' | 'TRELLO' | 'TESTRAIL';
  originalStatusName: string;
  listId?: string; // For Trello cards
  boardId?: string; // For Trello
  dependencies?: {
    dependsOn: Array<{
      taskId: string;
      taskKey?: string;
      taskSummary: string;
      projectId: string;
      projectName: string;
      status: 'active' | 'resolved';
    }>;
    blockedBy: Array<{
      taskId: string;
      taskKey?: string;
      taskSummary: string;
      projectId: string;
      projectName: string;
      status: 'active' | 'resolved';
    }>;
  };
}

interface ColumnMapping {
  _id: string;
  mergedColumnName: string;
  originalColumns: Array<{
    projectId: string;
    integrationType: string;
    originalColumnName: string;
  }>;
  displayOrder?: number;
  color?: string;
}

interface ProjectWithType extends Project {
  integrationType: 'JIRA' | 'TRELLO' | 'TESTRAIL';
}

interface StatusMapping {
  projectId: string;
  integrationType: string;
  statusName: string;
  listId?: string; // Trello list ID
  transitionId?: string; // Jira transition ID
}

// Tool-specific colors - modern gradient styles
function renderAdfToPlainText(description: any): string {
  if (!description) return '';
  if (typeof description === 'string') return description;
  if (typeof description === 'object' && description.content) {
    const extractText = (node: any): string => {
      if (node.type === 'text') return node.text || '';
      if (node.type === 'hardBreak') return '\n';
      if (Array.isArray(node.content)) {
        const inner = node.content.map(extractText).join('');
        if (node.type === 'paragraph' || node.type === 'heading') return inner + '\n';
        if (node.type === 'listItem') return '• ' + inner + '\n';
        if (node.type === 'bulletList' || node.type === 'orderedList') return inner;
        return inner;
      }
      return '';
    };
    return extractText(description).trim();
  }
  try {
    return JSON.stringify(description);
  } catch {
    return String(description);
  }
}

const TOOL_COLORS = {
  JIRA: {
    border: 'border-l-4 border-l-blue-500',
    bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    line: 'bg-gradient-to-r from-blue-500 to-blue-600',
    gradient: 'from-blue-500 to-blue-600',
  },
  TRELLO: {
    border: 'border-l-4 border-l-orange-500',
    bg: 'bg-gradient-to-br from-orange-50 to-amber-100/50 dark:from-orange-950/30 dark:to-amber-900/20',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300',
    line: 'bg-gradient-to-r from-orange-500 to-amber-500',
    gradient: 'from-orange-500 to-amber-500',
  },
  TESTRAIL: {
    border: 'border-l-4 border-l-emerald-500',
    bg: 'bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-950/30 dark:to-green-900/20',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    line: 'bg-gradient-to-r from-emerald-500 to-green-500',
    gradient: 'from-emerald-500 to-green-500',
  },
};

export default function MultiProjectKanbanBoardPage() {
  const { integrations, projects, loading: projectsLoading } = useIntegrations();
  const { toast } = useToast();
  
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<TaskWithProject[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [isColumnMappingOpen, setIsColumnMappingOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithProject | null>(null);
  const [isDependencyDialogOpen, setIsDependencyDialogOpen] = useState(false);
  const [isDependencyViewOpen, setIsDependencyViewOpen] = useState(false);
  const [issueEditMetadata, setIssueEditMetadata] = useState<{
    assignableUsers: Array<{ accountId: string; displayName: string; avatarUrls?: { '48x48': string } }>;
    priorities: Array<{ id: string; name: string; iconUrl?: string }>;
  } | null>(null);
  const [issueEditSaving, setIssueEditSaving] = useState(false);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [isCreateCardOpen, setIsCreateCardOpen] = useState(false);
  const [createCardColumn, setCreateCardColumn] = useState<string | null>(null);
  const [newCardData, setNewCardData] = useState({ summary: '', description: '', projectId: '' });
  const [isCreatingCard, setIsCreatingCard] = useState(false);
  const [activeTask, setActiveTask] = useState<TaskWithProject | null>(null);
  const [statusMappings, setStatusMappings] = useState<StatusMapping[]>([]);
  const [allAvailableStatuses, setAllAvailableStatuses] = useState<Array<{ projectId: string; integrationType: string; statusName: string }>>([]);
  const [newDependency, setNewDependency] = useState({ 
    taskId: '', 
    type: 'depends_on' as 'depends_on' | 'blocked_by' 
  });
  const [showDependenciesOnly, setShowDependenciesOnly] = useState(false);

  const basePath = process.env.NEXT_PUBLIC_TENANT_BASEPATH || '';

  // DnD Kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Get all available projects (only from connected integrations)
  const allProjects = useMemo((): ProjectWithType[] => {
    const all: ProjectWithType[] = [];
    if (integrations?.jira?.connected && projects.jira && projects.jira.length > 0) {
      all.push(...projects.jira.map(p => ({ ...p, integrationType: 'JIRA' as const })));
    }
    if (integrations?.trello?.connected && projects.trello && projects.trello.length > 0) {
      all.push(...projects.trello.map(p => ({ ...p, integrationType: 'TRELLO' as const })));
    }
    // TestRail removed from Kanban board
    return all;
  }, [projects, integrations]);

  // Fetch column mappings
  useEffect(() => {
    const fetchMappings = async () => {
      if (selectedProjectIds.length === 0) return;
      
      try {
        const response = await fetch(
          `${basePath}/api/column-mappings?projectIds=${selectedProjectIds.join(',')}`
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setColumnMappings(data.mappings || []);
          }
        }
      } catch (err) {
        console.error('Error fetching column mappings:', err);
      }
    };
    
    fetchMappings();
  }, [selectedProjectIds, basePath]);

  // Fetch issues for selected projects
  const fetchIssues = useCallback(async () => {
    if (selectedProjectIds.length === 0) {
      setIssues([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const allIssues: TaskWithProject[] = [];
      const newStatusMappings: StatusMapping[] = [];
      const newAvailableStatuses: Array<{ projectId: string; integrationType: string; statusName: string }> = [];
      
      for (const projectId of selectedProjectIds) {
        const project = allProjects.find(p => p.id === projectId || p.externalId === projectId);
        if (!project) continue;
        
        let issuesData: JiraDashboardIssue[] = [];
        
        if (project.integrationType === 'JIRA') {
          const response = await getJiraProjectDetailsAction(project.key || project.externalId);
          if (response.success && response.issues) {
            issuesData = response.issues;
          }
          // Collect all Jira statuses for this project
          if (response.success && response.statuses) {
            response.statuses.forEach((s: any) => {
              newAvailableStatuses.push({
                projectId: project.id || project.externalId,
                integrationType: 'JIRA',
                statusName: s.name,
              });
            });
          }
        } else if (project.integrationType === 'TRELLO') {
          const response = await getTrelloProjectDetailsAction(project.externalId);
          if (response.success && response.cards) {
            issuesData = convertTrelloCardsToIssues(response.cards);
            
            // Also store list mappings for Trello
            if (response.lists) {
              response.lists.forEach((list: any) => {
                newStatusMappings.push({
                  projectId: project.id || project.externalId,
                  integrationType: 'TRELLO',
                  statusName: list.name.toUpperCase(),
                  listId: list.id,
                });
                newAvailableStatuses.push({
                  projectId: project.id || project.externalId,
                  integrationType: 'TRELLO',
                  statusName: list.name,
                });
              });
            }
          }
        }
        
        // Add project metadata and preserve original status name
        const issuesWithProject = issuesData.map(issue => ({
          ...issue,
          projectId: project.id || project.externalId,
          projectName: project.name,
          projectKey: project.key,
          integrationType: project.integrationType,
          originalStatusName: issue.status.name,
          boardId: project.externalId, // For Trello
          listId: (issue as any).idList, // For Trello
        }));
        
        allIssues.push(...issuesWithProject);
      }
      
      setStatusMappings(newStatusMappings);
      setAllAvailableStatuses(newAvailableStatuses);
      
      // Fetch cross-project dependencies
      if (allIssues.length > 0) {
        try {
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
                    status: dep.status,
                  });
                } else {
                  depsByTask[sourceKey].blockedBy.push({
                    taskId: dep.targetTaskId,
                    taskKey: dep.targetTaskKey,
                    taskSummary: dep.targetTaskSummary,
                    projectId: dep.targetProjectId,
                    projectName: targetProject?.name || 'Unknown',
                    status: dep.status,
                  });
                }
              });
              
              allIssues.forEach(issue => {
                const key = `${issue.projectId}:${issue.id}`;
                issue.dependencies = depsByTask[key] || { dependsOn: [], blockedBy: [] };
              });
            }
          }
        } catch (depErr) {
          console.error('Error fetching dependencies:', depErr);
        }
      }
      
      setIssues(allIssues);
    } catch (err: any) {
      setError(err.message || 'Failed to load board');
      toast({
        title: "Error",
        description: "Failed to load kanban board",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedProjectIds, allProjects, basePath, toast]);

  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);

  // Fetch assignable users and priorities when opening modal for a Jira task
  useEffect(() => {
    if (!isDependencyViewOpen || !selectedTask || selectedTask.integrationType !== 'JIRA' || !selectedTask.projectKey) {
      setIssueEditMetadata(null);
      return;
    }
    const projectKey = selectedTask.projectKey;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${basePath}/api/integrations/jira/issue?projectKey=${encodeURIComponent(projectKey)}`
        );
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.success) setIssueEditMetadata({ assignableUsers: data.assignableUsers || [], priorities: data.priorities || [] });
        }
      } catch {
        if (!cancelled) setIssueEditMetadata({ assignableUsers: [], priorities: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [isDependencyViewOpen, selectedTask?.id, selectedTask?.projectKey, selectedTask?.integrationType, basePath]);

  const updateJiraIssueField = useCallback(async (
    field: 'assignee' | 'priority' | 'duedate',
    value: string | null
  ) => {
    if (!selectedTask || selectedTask.integrationType !== 'JIRA') return;
    setIssueEditSaving(true);
    try {
      const body: Record<string, unknown> = { issueKey: selectedTask.key };
      if (field === 'assignee') body.assigneeAccountId = value ?? '';
      if (field === 'priority') body.priorityId = value ?? '';
      if (field === 'duedate') body.duedate = value ?? '';
      const res = await fetch(`${basePath}/api/integrations/jira/issue`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Update failed');
      const assigneeUser = field === 'assignee' && value ? issueEditMetadata?.assignableUsers.find(u => u.accountId === value) : null;
      const priorityObj = field === 'priority' && value ? issueEditMetadata?.priorities.find(p => p.id === value) : null;
      const nextAssignee = field === 'assignee'
        ? (value ? { accountId: value, displayName: assigneeUser?.displayName ?? 'Unknown', avatarUrls: assigneeUser?.avatarUrls } : undefined)
        : undefined;
      const nextPriority = field === 'priority'
        ? (value && priorityObj ? { id: priorityObj.id, name: priorityObj.name, iconUrl: priorityObj.iconUrl ?? '' } : undefined)
        : undefined;
      setSelectedTask(prev => prev ? {
        ...prev,
        ...(field === 'assignee' && { assignee: nextAssignee }),
        ...(field === 'priority' && { priority: nextPriority }),
        ...(field === 'duedate' && { duedate: value ?? undefined }),
      } : null);
      setIssues(prev => prev.map(issue =>
        issue.projectId === selectedTask.projectId && issue.id === selectedTask.id
          ? {
              ...issue,
              ...(field === 'assignee' && { assignee: nextAssignee }),
              ...(field === 'priority' && { priority: nextPriority }),
              ...(field === 'duedate' && { duedate: value ?? undefined }),
            }
          : issue
      ));
      toast({ title: 'Updated', description: `${field} updated` });
    } catch (err: any) {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    } finally {
      setIssueEditSaving(false);
    }
  }, [selectedTask, basePath, issueEditMetadata, toast]);

  // Group issues by merged column names
  const groupedIssues = useMemo(() => {
    // Filter issues if dependency filter is enabled
    let filteredIssues = issues;
    if (showDependenciesOnly) {
      filteredIssues = issues.filter(issue => 
        (issue.dependencies?.dependsOn && issue.dependencies.dependsOn.length > 0) ||
        (issue.dependencies?.blockedBy && issue.dependencies.blockedBy.length > 0)
      );
    }
    
    const groups: Record<string, TaskWithProject[]> = {};
    const statusToMerged: Record<string, string> = {};
    
    // Build mapping from original status to merged column name
    columnMappings.forEach(mapping => {
      mapping.originalColumns.forEach(origCol => {
        const key = `${origCol.projectId}:${origCol.originalColumnName.toUpperCase()}`;
        statusToMerged[key] = mapping.mergedColumnName;
      });
    });
    
    // Group issues using merged column names
    filteredIssues.forEach((issue) => {
      const originalStatus = issue.originalStatusName.toUpperCase();
      const mapKey = `${issue.projectId}:${originalStatus}`;
      const mergedColumnName = statusToMerged[mapKey] || originalStatus;
      
      if (!groups[mergedColumnName]) {
        groups[mergedColumnName] = [];
      }
      groups[mergedColumnName].push(issue);
    });
    
    // Sort columns by display order
    const sortedGroups: Record<string, TaskWithProject[]> = {};
    const sortedMappings = [...columnMappings].sort((a, b) => 
      (a.displayOrder || 999) - (b.displayOrder || 999)
    );
    
    // Add all mapped columns (from Jira/Trello), including empty ones
    sortedMappings.forEach(mapping => {
      sortedGroups[mapping.mergedColumnName] = groups[mapping.mergedColumnName] || [];
    });
    
    // Add unmapped columns in standard order
    const standardOrder = ['TO DO', 'IN PROGRESS', 'IN REVIEW', 'TESTING', 'CLOSED', 'FIXED', 'DONE'];
    standardOrder.forEach(status => {
      if (groups[status] && !sortedGroups[status]) {
        sortedGroups[status] = groups[status];
      }
    });
    
    // Add remaining columns from issues
    Object.keys(groups).forEach(status => {
      if (!sortedGroups[status]) {
        sortedGroups[status] = groups[status];
      }
    });
    
    // Add all available statuses from Jira/Trello that have no issues yet
    allAvailableStatuses.forEach(({ statusName, projectId }) => {
      const upperName = statusName.toUpperCase();
      const mapKey = `${projectId}:${upperName}`;
      const mergedName = statusToMerged[mapKey] || upperName;
      if (!sortedGroups[mergedName]) {
        sortedGroups[mergedName] = [];
      }
    });
    
    return sortedGroups;
  }, [issues, columnMappings, showDependenciesOnly, allAvailableStatuses]);

  // Get all unique status names from all issues
  const allStatusNames = useMemo(() => {
    const statusMap: Record<string, {
      projectId: string;
      projectName: string;
      integrationType: string;
      statusName: string;
    }> = {};
    
    issues.forEach(issue => {
      const key = `${issue.projectId}:${issue.originalStatusName}`;
      if (!statusMap[key]) {
        statusMap[key] = {
          projectId: issue.projectId,
          projectName: issue.projectName,
          integrationType: issue.integrationType,
          statusName: issue.originalStatusName,
        };
      }
    });
    
    return Object.values(statusMap);
  }, [issues]);

  const handleProjectToggle = (projectId: string) => {
    setSelectedProjectIds(prev => 
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = issues.find(i => `${i.projectId}:${i.id}` === active.id);
    setActiveTask(task || null);
  };

  // Handle drag end - move card
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);
    
    if (!over) return;
    
    const taskId = active.id as string;
    const task = issues.find(i => `${i.projectId}:${i.id}` === taskId);
    if (!task) return;
    
    // Determine target column - could be a column or another task
    let targetColumn: string;
    
    // Check if dropped on a column directly
    if (over.data.current?.type === 'column') {
      targetColumn = over.data.current.status || (over.id as string);
    } else {
      // Dropped on a task - find which column it belongs to
      const overTask = issues.find(i => `${i.projectId}:${i.id}` === over.id);
      if (overTask) {
        targetColumn = overTask.originalStatusName.toUpperCase();
      } else {
        targetColumn = over.id as string;
      }
    }
    
    // Check if moving to a different column
    const currentColumn = task.originalStatusName.toUpperCase();
    if (currentColumn === targetColumn) return;
    
    // Move the card
    try {
      toast({
        title: "Moving Card...",
        description: `Moving ${task.key} to ${targetColumn}`,
      });
      
      if (task.integrationType === 'JIRA') {
        await moveJiraCard(task, targetColumn);
      } else if (task.integrationType === 'TRELLO') {
        await moveTrelloCard(task, targetColumn);
      }
      
      toast({
        title: "Card Moved",
        description: `${task.key} moved to ${targetColumn}`,
      });
      
      // Refresh the board
      fetchIssues();
    } catch (err: any) {
      toast({
        title: "Error Moving Card",
        description: err.message || "Failed to move card",
        variant: "destructive",
      });
    }
  };

  // Move Jira card via transitions
  const moveJiraCard = async (task: TaskWithProject, targetStatus: string) => {
    // First get available transitions
    const transitionsRes = await fetch(
      `${basePath}/api/integrations/jira/transitions?issueKey=${task.key}`
    );
    
    if (!transitionsRes.ok) {
      throw new Error('Failed to fetch transitions');
    }
    
    const transitionsData = await transitionsRes.json();
    
    // Find matching transition
    const transition = transitionsData.transitions?.find((t: any) => 
      t.to.name.toUpperCase() === targetStatus ||
      t.name.toUpperCase() === targetStatus
    );
    
    if (!transition) {
      throw new Error(`No transition available to ${targetStatus}. Available: ${transitionsData.transitions?.map((t: any) => t.to.name).join(', ')}`);
    }
    
    // Execute transition
    const moveRes = await fetch(`${basePath}/api/integrations/jira/transitions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        issueKey: task.key,
        transitionId: transition.id,
      }),
    });
    
    if (!moveRes.ok) {
      const error = await moveRes.json();
      throw new Error(error.error || 'Failed to transition issue');
    }
  };

  // Move Trello card via list change
  const moveTrelloCard = async (task: TaskWithProject, targetStatus: string) => {
    // Find the target list
    const targetMapping = statusMappings.find(m => 
      m.projectId === task.projectId && 
      m.statusName === targetStatus &&
      m.integrationType === 'TRELLO'
    );
    
    if (!targetMapping?.listId) {
      // Try to fetch lists for this board
      const listsRes = await fetch(
        `${basePath}/api/integrations/trello/cards/move?boardId=${task.boardId}`
      );
      
      if (listsRes.ok) {
        const listsData = await listsRes.json();
        const targetList = listsData.lists?.find((l: any) => 
          l.name.toUpperCase() === targetStatus
        );
        
        if (targetList) {
          const moveRes = await fetch(`${basePath}/api/integrations/trello/cards/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cardId: task.id,
              listId: targetList.id,
            }),
          });
          
          if (!moveRes.ok) {
            throw new Error('Failed to move Trello card');
          }
          return;
        }
      }
      
      throw new Error(`No list found for status: ${targetStatus}`);
    }
    
    // Move to the list
    const moveRes = await fetch(`${basePath}/api/integrations/trello/cards/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: task.id,
        listId: targetMapping.listId,
      }),
    });
    
    if (!moveRes.ok) {
      throw new Error('Failed to move Trello card');
    }
  };

  // Create new card
  const handleCreateCard = async () => {
    if (!newCardData.summary || !newCardData.projectId || !createCardColumn) return;
    
    setIsCreatingCard(true);
    
    try {
      const project = allProjects.find(p => p.id === newCardData.projectId);
      if (!project) throw new Error('Project not found');
      
      let listId: string | undefined;
      
      // For Trello, find the list ID
      if (project.integrationType === 'TRELLO') {
        const listsRes = await fetch(
          `${basePath}/api/integrations/trello/cards/move?boardId=${project.externalId}`
        );
        
        if (listsRes.ok) {
          const listsData = await listsRes.json();
          const targetList = listsData.lists?.find((l: any) => 
            l.name.toUpperCase() === createCardColumn
          );
          listId = targetList?.id;
        }
        
        if (!listId) {
          throw new Error(`No list found for column: ${createCardColumn}`);
        }
      }
      
      const response = await fetch(`${basePath}/api/board/create-card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationType: project.integrationType,
          projectId: project.id,
          projectKey: project.key,
          listId,
          summary: newCardData.summary,
          description: newCardData.description,
          targetStatus: createCardColumn, // For Jira: transition to this status after creation
        }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create card');
      }
      
      const createdCard = await response.json();
      
      // Store values before clearing state
      const cardColumn = createCardColumn || 'TO DO';
      const cardSummary = newCardData.summary;
      const cardProjectId = project.id || project.externalId;
      
      // Close dialog first
      setIsCreateCardOpen(false);
      setNewCardData({ summary: '', description: '', projectId: '' });
      setCreateCardColumn(null);
      
      toast({
        title: "Card Created",
        description: `New ${project.integrationType} card created successfully`,
      });
      
      // Optimistic update: add the card to local state immediately
      if (createdCard.card) {
        const newIssue: TaskWithProject = {
          id: createdCard.card.id,
          key: createdCard.card.key || createdCard.card.id,
          summary: cardSummary,
          status: { name: cardColumn, category: { name: 'To Do' } },
          assignee: null,
          issuetype: { name: 'Story', iconUrl: '' },
          priority: { name: 'Medium' },
          projectId: cardProjectId,
          projectName: project.name,
          projectKey: project.key,
          integrationType: project.integrationType,
          originalStatusName: cardColumn,
        };
        
        console.log('🎯 OPTIMISTIC UPDATE: Adding card to board:', newIssue.key, 'in column:', cardColumn);
        setIssues(prev => {
          console.log('🎯 OPTIMISTIC UPDATE: Previous issues count:', prev.length);
          const updated = [...prev, newIssue];
          console.log('🎯 OPTIMISTIC UPDATE: New issues count:', updated.length);
          return updated;
        });
      }
      
      // Refresh the board after a brief delay (Jira API has indexing delay)
      setTimeout(() => {
        console.log('🔄 Refreshing board from Jira...');
        fetchIssues();
      }, 2000);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create card",
        variant: "destructive",
      });
    } finally {
      setIsCreatingCard(false);
    }
  };

  const handleAddDependency = async () => {
    if (!selectedTask || !newDependency.taskId) return;
    
    try {
      const dependencyTask = issues.find(i => i.id === newDependency.taskId || i.key === newDependency.taskId);
      
      if (!dependencyTask) {
        toast({
          title: "Error",
          description: "Task not found",
          variant: "destructive",
        });
        return;
      }
      
      const response = await fetch(`${basePath}/api/dependencies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProjectId: selectedTask.projectId,
          sourceIntegrationType: selectedTask.integrationType,
          sourceTaskId: selectedTask.id,
          sourceTaskKey: selectedTask.key,
          targetProjectId: dependencyTask.projectId,
          targetIntegrationType: dependencyTask.integrationType,
          targetTaskId: dependencyTask.id,
          targetTaskKey: dependencyTask.key,
          targetTaskSummary: dependencyTask.summary,
          dependencyType: newDependency.type,
        }),
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Dependency added successfully",
        });
        setIsDependencyDialogOpen(false);
        setNewDependency({ taskId: '', type: 'depends_on' });
        fetchIssues();
      } else {
        throw new Error('Failed to create dependency');
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to add dependency",
        variant: "destructive",
      });
    }
  };

  const handleResolveDependency = async (
    sourceProjectId: string,
    sourceTaskId: string,
    targetProjectId: string,
    targetTaskId: string,
    dependencyType: 'depends_on' | 'blocked_by'
  ) => {
    try {
      const response = await fetch(`${basePath}/api/dependencies`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceProjectId,
          sourceTaskId,
          targetProjectId,
          targetTaskId,
          dependencyType,
        }),
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Dependency resolved",
        });
        setIsDependencyViewOpen(false);
        fetchIssues();
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Failed to resolve dependency",
        variant: "destructive",
      });
    }
  };

  // Get projects available for a column (for card creation)
  const getProjectsForColumn = (columnName: string) => {
    // Get all projects that have this status
    const projectsWithStatus = new Set<string>();
    
    issues.forEach(issue => {
      if (issue.originalStatusName.toUpperCase() === columnName) {
        projectsWithStatus.add(issue.projectId);
      }
    });
    
    // Also check column mappings
    columnMappings.forEach(mapping => {
      if (mapping.mergedColumnName === columnName) {
        mapping.originalColumns.forEach(col => {
          projectsWithStatus.add(col.projectId);
        });
      }
    });
    
    return allProjects.filter(p => 
      selectedProjectIds.includes(p.id) && 
      (projectsWithStatus.has(p.id) || projectsWithStatus.size === 0)
    );
  };

  if (projectsLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  const statusColumns = Object.keys(groupedIssues);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <PageHeader
          title="Kanban Board"
          icon={<Columns3 className="h-5 w-5 text-white" />}
          gradient="from-emerald-500 to-teal-500"
          description="Drag cards to change status - changes sync with Jira & Trello"
        />
        
        <div className="flex items-center gap-3">
          {/* Dependency Filter Checkbox */}
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-2 rounded-lg">
            <Checkbox
              id="dependency-filter"
              checked={showDependenciesOnly}
              onCheckedChange={(checked) => setShowDependenciesOnly(checked === true)}
            />
            <Label
              htmlFor="dependency-filter"
              className="text-sm font-medium cursor-pointer flex items-center gap-1.5"
            >
              <Link2 className="h-4 w-4" />
              Dependency
            </Label>
          </div>
          
          {/* Legend */}
          <div className="hidden md:flex items-center gap-4 mr-4 text-sm bg-muted/50 px-4 py-2 rounded-lg">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></div>
              <span className="text-muted-foreground font-medium">Jira</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm"></div>
              <span className="text-muted-foreground font-medium">Trello</span>
            </div>
          </div>
          
          {/* Column Mapping Settings */}
          <Sheet open={isColumnMappingOpen} onOpenChange={setIsColumnMappingOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" disabled={selectedProjectIds.length === 0} className="rounded-full">
                <Settings className="h-4 w-4 mr-2" />
                Column Settings
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[400px] sm:w-[540px]">
              <SheetHeader>
                <SheetTitle>Column Mapping & Merging</SheetTitle>
                <SheetDescription>
                  Merge columns from different projects that represent the same status
                </SheetDescription>
              </SheetHeader>
              
              <ColumnMappingManager
                allStatusNames={allStatusNames}
                columnMappings={columnMappings}
                allProjects={allProjects}
                basePath={basePath}
                onMappingsChange={(mappings) => setColumnMappings(mappings)}
              />
            </SheetContent>
          </Sheet>
          
          {/* Project Selector */}
          <Popover open={isProjectSelectorOpen} onOpenChange={setIsProjectSelectorOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="rounded-full">
                <Filter className="h-4 w-4 mr-2" />
                Projects ({selectedProjectIds.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-semibold mb-3">Select Projects</h4>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {allProjects.map((project) => (
                      <div key={project.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={project.id}
                          checked={selectedProjectIds.includes(project.id)}
                          onCheckedChange={() => handleProjectToggle(project.id)}
                        />
                        <Label
                          htmlFor={project.id}
                          className="flex-1 cursor-pointer flex items-center gap-2"
                        >
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            TOOL_COLORS[project.integrationType].line
                          )} />
                          <span className="text-sm truncate">{project.name}</span>
                          {project.key && (
                            <span className="text-xs text-muted-foreground">
                              ({project.key})
                            </span>
                          )}
                        </Label>
                      </div>
                    ))}
                    {allProjects.length === 0 && (
                      <div className="text-center py-8">
                        <div className="mb-4">
                          <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
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
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {selectedProjectIds.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Please select at least one project to view the Kanban board.
          </AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && selectedProjectIds.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Kanban Board */}
          <div className="flex gap-4 overflow-x-auto pb-4 mt-6">
            {statusColumns.map((status) => {
              const mapping = columnMappings.find(m => m.mergedColumnName === status);
              const originalColumns = mapping?.originalColumns || [];
              
              return (
                <KanbanColumn
                  key={status}
                  status={status}
                  issues={groupedIssues[status]}
                  originalColumns={originalColumns}
                  onTaskClick={(task) => {
                    setSelectedTask(task);
                    setIsDependencyViewOpen(true);
                  }}
                  onAddDependency={(task) => {
                    setSelectedTask(task);
                    setIsDependencyDialogOpen(true);
                  }}
                  onAddCard={() => {
                    setCreateCardColumn(status);
                    setIsCreateCardOpen(true);
                  }}
                />
              );
            })}
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeTask ? (
              <TaskCard
                issue={activeTask}
                onClick={() => {}}
                onAddDependency={() => {}}
                isDragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create Card Dialog */}
      <Dialog open={isCreateCardOpen} onOpenChange={setIsCreateCardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Card</DialogTitle>
            <DialogDescription>
              Create a new card in {createCardColumn} column
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Project</Label>
              <Select
                value={newCardData.projectId}
                onValueChange={(value) => setNewCardData({ ...newCardData, projectId: value })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {getProjectsForColumn(createCardColumn || '').map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          TOOL_COLORS[project.integrationType].line
                        )} />
                        <span>{project.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {project.integrationType}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Summary / Title</Label>
              <Input
                placeholder="Enter card title"
                value={newCardData.summary}
                onChange={(e) => setNewCardData({ ...newCardData, summary: e.target.value })}
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Description (optional)</Label>
              <Textarea
                placeholder="Enter description"
                value={newCardData.description}
                onChange={(e) => setNewCardData({ ...newCardData, description: e.target.value })}
                className="mt-1"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateCardOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateCard} 
              disabled={!newCardData.summary || !newCardData.projectId || isCreatingCard}
            >
              {isCreatingCard && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dependency View Dialog */}
      <Dialog open={isDependencyViewOpen} onOpenChange={setIsDependencyViewOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <div className={cn(
                "w-3 h-3 rounded-full",
                selectedTask && TOOL_COLORS[selectedTask.integrationType].line
              )} />
              <span className="font-mono">{selectedTask?.key}</span>
              <Badge variant="outline" className="text-xs">
                {selectedTask?.projectName}
              </Badge>
              {selectedTask?.status && (
                <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                  {selectedTask.status.name}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-base font-medium text-foreground/90 pt-1">
              {selectedTask?.summary}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-5">
              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-lg border border-border/50 bg-muted/20">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Assignee</p>
                  {selectedTask.integrationType === 'JIRA' && issueEditMetadata ? (
                    <Select
                      value={(selectedTask.assignee as any)?.accountId ?? '__unassigned__'}
                      onValueChange={(v) => updateJiraIssueField('assignee', v === '__unassigned__' ? null : v)}
                      disabled={issueEditSaving}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__unassigned__">Unassigned</SelectItem>
                        {issueEditMetadata.assignableUsers.map((u) => (
                          <SelectItem key={u.accountId} value={u.accountId}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={u.avatarUrls?.['48x48']} />
                                <AvatarFallback className="text-[10px]">{u.displayName?.charAt(0) || '?'}</AvatarFallback>
                              </Avatar>
                              {u.displayName}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      {selectedTask.assignee ? (
                        <>
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={selectedTask.assignee.avatarUrls?.['48x48']} />
                            <AvatarFallback className="text-[10px]">
                              {selectedTask.assignee.displayName?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{selectedTask.assignee.displayName}</span>
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Priority</p>
                  {selectedTask.integrationType === 'JIRA' && issueEditMetadata ? (
                    <Select
                      value={selectedTask.priority?.id ?? ''}
                      onValueChange={(v) => updateJiraIssueField('priority', v || null)}
                      disabled={issueEditSaving}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        {issueEditMetadata.priorities.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            <div className="flex items-center gap-2">
                              {p.iconUrl && <img src={p.iconUrl} alt="" className="h-4 w-4" />}
                              {p.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      {selectedTask.priority?.iconUrl && (
                        <img src={selectedTask.priority.iconUrl} alt="" className="h-4 w-4" />
                      )}
                      <span className="text-sm">{selectedTask.priority?.name || 'None'}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Type</p>
                  <div className="flex items-center gap-2">
                    {selectedTask.issuetype?.iconUrl && (
                      <img src={selectedTask.issuetype.iconUrl} alt="" className="h-4 w-4" />
                    )}
                    <span className="text-sm">{selectedTask.issuetype?.name || 'Unknown'}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Status</p>
                  <span className="text-sm">{selectedTask.status?.name || 'Unknown'}</span>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Due Date</p>
                  {selectedTask.integrationType === 'JIRA' ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        className="h-9"
                        value={selectedTask.duedate ? selectedTask.duedate.split('T')[0] : ''}
                        onChange={(e) => {
                          const v = e.target.value || null;
                          updateJiraIssueField('duedate', v);
                        }}
                        disabled={issueEditSaving}
                      />
                      {selectedTask.duedate && new Date(selectedTask.duedate) < new Date() && (
                        <span className="text-xs text-red-400">Overdue</span>
                      )}
                    </div>
                  ) : selectedTask.duedate ? (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={cn(
                        "text-sm",
                        new Date(selectedTask.duedate) < new Date() && "text-red-400"
                      )}>
                        {new Date(selectedTask.duedate).toLocaleDateString()}
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">Created</p>
                  <span className="text-sm">{new Date(selectedTask.created).toLocaleDateString()}</span>
                </div>
                {selectedTask.updated && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Updated</p>
                    <span className="text-sm">{new Date(selectedTask.updated).toLocaleDateString()}</span>
                  </div>
                )}
                {selectedTask.customfield_10016 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Story Points</p>
                    <span className="text-sm">{selectedTask.customfield_10016}</span>
                  </div>
                )}
              </div>

              {/* Description */}
              {selectedTask.description && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-muted-foreground">Description</h4>
                  <div className="p-3 rounded-lg border border-border/50 bg-muted/10 text-sm leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {renderAdfToPlainText(selectedTask.description)}
                  </div>
                </div>
              )}

              {/* Dependencies */}
              {(selectedTask.dependencies?.blockedBy?.length || 0) > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2 text-red-600">
                    <AlertTriangle className="h-4 w-4" />
                    Blocked By ({selectedTask.dependencies?.blockedBy?.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedTask.dependencies?.blockedBy?.map((blocker, idx) => (
                      <Card key={idx} className="border-red-500/30 bg-red-950/20 dark:bg-red-950/30">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="bg-muted/50">{blocker.projectName}</Badge>
                              <Badge variant="outline" className="font-mono bg-muted/50">{blocker.taskKey}</Badge>
                              <span className="text-sm truncate max-w-[300px] text-foreground">{blocker.taskSummary}</span>
                            </div>
                            <Badge variant="destructive" className="bg-red-500/20 text-red-400 border-red-500/30">Blocking</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {(selectedTask.dependencies?.dependsOn?.length || 0) > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 flex items-center gap-2 text-blue-600">
                    <Link2 className="h-4 w-4" />
                    Depends On ({selectedTask.dependencies?.dependsOn?.length})
                  </h4>
                  <div className="space-y-2">
                    {selectedTask.dependencies?.dependsOn?.map((dep, idx) => (
                      <Card key={idx} className="border-blue-500/30 bg-blue-950/20 dark:bg-blue-950/30">
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="bg-muted/50">{dep.projectName}</Badge>
                              <Badge variant="outline" className="font-mono bg-muted/50">{dep.taskKey}</Badge>
                              <span className="text-sm truncate max-w-[250px] text-foreground">{dep.taskSummary}</span>
                            </div>
                            {dep.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400"
                                onClick={() => handleResolveDependency(
                                  selectedTask.projectId,
                                  selectedTask.id,
                                  dep.projectId,
                                  dep.taskId,
                                  'depends_on'
                                )}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Resolve
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
              
              {(!selectedTask.dependencies?.blockedBy?.length && !selectedTask.dependencies?.dependsOn?.length) && (
                <p className="text-muted-foreground text-center py-4">
                  No dependencies for this task
                </p>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDependencyViewOpen(false)}>
              Close
            </Button>
            <Button onClick={() => {
              setIsDependencyViewOpen(false);
              setIsDependencyDialogOpen(true);
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Dependency
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Dependency Dialog */}
      <Dialog open={isDependencyDialogOpen} onOpenChange={setIsDependencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Dependency</DialogTitle>
            <DialogDescription>
              Link this task to another task (can be from different project)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Current Task</Label>
              <div className="p-2 border rounded-md bg-muted mt-1">
                <div className="flex items-center gap-2">
                  <div className={cn(
                    "w-2 h-2 rounded-full",
                    selectedTask && TOOL_COLORS[selectedTask.integrationType].line
                  )} />
                  <Badge variant="outline">{selectedTask?.projectName}</Badge>
                  <span className="font-mono text-sm">{selectedTask?.key}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 truncate">{selectedTask?.summary}</p>
              </div>
            </div>
            
            <div>
              <Label>Dependency Type</Label>
              <Select
                value={newDependency.type}
                onValueChange={(value: 'depends_on' | 'blocked_by') =>
                  setNewDependency({ ...newDependency, type: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="depends_on">This task depends on...</SelectItem>
                  <SelectItem value="blocked_by">This task is blocked by...</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label>Target Task</Label>
              <Select
                value={newDependency.taskId}
                onValueChange={(value) =>
                  setNewDependency({ ...newDependency, taskId: value })
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a task" />
                </SelectTrigger>
                <SelectContent>
                  {issues
                    .filter(i => i.id !== selectedTask?.id || i.projectId !== selectedTask?.projectId)
                    .map((issue) => (
                      <SelectItem key={`${issue.projectId}:${issue.id}`} value={issue.id}>
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            TOOL_COLORS[issue.integrationType].line
                          )} />
                          <span className="font-mono text-xs">{issue.key}</span>
                          <span className="truncate max-w-[200px]">{issue.summary}</span>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDependencyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDependency} disabled={!newDependency.taskId}>
              Add Dependency
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Column Mapping Manager Component
function ColumnMappingManager({
  allStatusNames,
  columnMappings,
  allProjects,
  basePath,
  onMappingsChange,
}: {
  allStatusNames: Array<{
    projectId: string;
    projectName: string;
    integrationType: string;
    statusName: string;
  }>;
  columnMappings: ColumnMapping[];
  allProjects: ProjectWithType[];
  basePath: string;
  onMappingsChange: (mappings: ColumnMapping[]) => void;
}) {
  const [newMapping, setNewMapping] = useState({
    mergedColumnName: '',
    selectedColumns: [] as string[],
  });
  const { toast } = useToast();

  const handleCreateMapping = async () => {
    if (!newMapping.mergedColumnName || newMapping.selectedColumns.length < 2) {
      toast({
        title: "Error",
        description: "Please provide a merged column name and select at least 2 columns to merge",
        variant: "destructive",
      });
      return;
    }

    try {
      const originalColumns = newMapping.selectedColumns.map(colKey => {
        const [projectId, statusName] = colKey.split(':');
        const status = allStatusNames.find(s => 
          s.projectId === projectId && s.statusName === statusName
        );
        return {
          projectId,
          integrationType: status?.integrationType || 'JIRA',
          originalColumnName: statusName,
        };
      });

      const response = await fetch(`${basePath}/api/column-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mergedColumnName: newMapping.mergedColumnName,
          originalColumns,
          displayOrder: columnMappings.length,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          onMappingsChange([...columnMappings, data.mapping]);
          setNewMapping({ mergedColumnName: '', selectedColumns: [] });
          toast({
            title: "Success",
            description: "Column mapping created successfully",
          });
        }
      } else {
        throw new Error('Failed to create mapping');
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create column mapping",
        variant: "destructive",
      });
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    try {
      const response = await fetch(`${basePath}/api/column-mappings?id=${mappingId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onMappingsChange(columnMappings.filter(m => m._id !== mappingId));
        toast({
          title: "Success",
          description: "Column mapping deleted",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: "Failed to delete column mapping",
        variant: "destructive",
      });
    }
  };

  // Group status names by project
  const statusByProject = useMemo(() => {
    const grouped: Record<string, typeof allStatusNames> = {};
    allStatusNames.forEach(status => {
      if (!grouped[status.projectId]) {
        grouped[status.projectId] = [];
      }
      grouped[status.projectId].push(status);
    });
    return grouped;
  }, [allStatusNames]);

  return (
    <div className="space-y-6 mt-6">
      {/* Existing Mappings */}
      <div>
        <h3 className="font-semibold mb-3">Existing Column Merges</h3>
        <div className="space-y-2">
          {columnMappings.map((mapping) => (
            <Card key={mapping._id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="default">{mapping.mergedColumnName}</Badge>
                      <Merge className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      {mapping.originalColumns.map((col, idx) => {
                        const project = allProjects.find(p => 
                          p.id === col.projectId || p.externalId === col.projectId
                        );
                        return (
                          <div key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <div className={cn(
                              "w-2 h-2 rounded-full",
                              TOOL_COLORS[col.integrationType as keyof typeof TOOL_COLORS]?.line || 'bg-gray-500'
                            )} />
                            <span>{project?.name || col.projectId}</span>
                            <span>→ {col.originalColumnName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteMapping(mapping._id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {columnMappings.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No column mappings yet. Create one below to merge columns like &quot;Done&quot; and &quot;Completed&quot;.
            </p>
          )}
        </div>
      </div>

      {/* Create New Mapping */}
      <div>
        <h3 className="font-semibold mb-3">Create New Column Merge</h3>
        <div className="space-y-4">
          <div>
            <Label>Merged Column Name</Label>
            <Input
              placeholder="e.g., Done, Completed, In Progress"
              value={newMapping.mergedColumnName}
              onChange={(e) => setNewMapping({ ...newMapping, mergedColumnName: e.target.value })}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label>Select Columns to Merge (select 2 or more)</Label>
            <ScrollArea className="h-64 border rounded-md p-2 mt-2">
              <div className="space-y-3">
                {Object.entries(statusByProject).map(([projectId, statuses]) => {
                  const project = allProjects.find(p => 
                    p.id === projectId || p.externalId === projectId
                  );
                  return (
                    <div key={projectId} className="space-y-1">
                      <div className="font-medium text-sm mb-1 flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          project && TOOL_COLORS[project.integrationType]?.line
                        )} />
                        {project?.name || projectId}
                      </div>
                      {statuses.map((status) => {
                        const colKey = `${status.projectId}:${status.statusName}`;
                        const isSelected = newMapping.selectedColumns.includes(colKey);
                        const isMapped = columnMappings.some(m => 
                          m.originalColumns.some(c => 
                            c.projectId === status.projectId && 
                            c.originalColumnName === status.statusName
                          )
                        );
                        
                        return (
                          <div key={colKey} className="flex items-center space-x-2 ml-4">
                            <Checkbox
                              id={colKey}
                              checked={isSelected}
                              disabled={isMapped}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setNewMapping({
                                    ...newMapping,
                                    selectedColumns: [...newMapping.selectedColumns, colKey],
                                  });
                                } else {
                                  setNewMapping({
                                    ...newMapping,
                                    selectedColumns: newMapping.selectedColumns.filter(c => c !== colKey),
                                  });
                                }
                              }}
                            />
                            <Label
                              htmlFor={colKey}
                              className={cn(
                                "text-sm cursor-pointer flex-1",
                                isMapped && "text-muted-foreground opacity-50"
                              )}
                            >
                              {status.statusName}
                              {isMapped && <span className="ml-2 text-xs">(already mapped)</span>}
                            </Label>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {Object.keys(statusByProject).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No columns available. Select projects first to see their columns.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
          
          <Button 
            onClick={handleCreateMapping} 
            className="w-full"
            disabled={!newMapping.mergedColumnName || newMapping.selectedColumns.length < 2}
          >
            <Merge className="h-4 w-4 mr-2" />
            Create Column Merge ({newMapping.selectedColumns.length} selected)
          </Button>
        </div>
      </div>
    </div>
  );
}

// Kanban Column Component with droppable
function KanbanColumn({
  status,
  issues,
  originalColumns,
  onTaskClick,
  onAddDependency,
  onAddCard,
}: {
  status: string;
  issues: TaskWithProject[];
  originalColumns: Array<{
    projectId: string;
    integrationType: string;
    originalColumnName: string;
  }>;
  onTaskClick: (task: TaskWithProject) => void;
  onAddDependency: (task: TaskWithProject) => void;
  onAddCard: () => void;
}) {
  const isMerged = originalColumns.length > 0;
  const isDoneColumn = status.toUpperCase().includes('DONE') || status.toUpperCase().includes('COMPLETED');
  
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: {
      type: 'column',
      status,
    },
  });
  
  return (
    <div className="flex-shrink-0 w-80" ref={setNodeRef}>
      <Card className={cn(
        "h-full transition-all duration-300 border-border/50 bg-card/50 backdrop-blur-sm",
        isOver && "ring-2 ring-primary ring-offset-2 shadow-lg"
      )}>
        <CardContent className="p-0">
          <div className="p-4 border-b border-border/50 bg-gradient-to-r from-muted/30 to-muted/10 rounded-t-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <h3 className="font-semibold text-foreground">{status}</h3>
                {isMerged && (
                  <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-primary/20">
                    <Merge className="h-3 w-3 mr-1" />
                    Merged
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs font-medium">
                  {issues.length}
                </Badge>
                {isDoneColumn && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={onAddCard}
                title="Add card"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {isMerged && (
              <div className="mt-2 text-xs text-muted-foreground">
                Merges: {originalColumns.map(c => c.originalColumnName).join(', ')}
              </div>
            )}
          </div>
          
          <SortableContext
            items={issues.map(i => `${i.projectId}:${i.id}`)}
            strategy={verticalListSortingStrategy}
          >
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="p-2 space-y-2">
                {issues.map((issue) => (
                  <SortableTaskCard
                    key={`${issue.projectId}:${issue.id}`}
                    issue={issue}
                    onClick={() => onTaskClick(issue)}
                    onAddDependency={(e) => {
                      e.stopPropagation();
                      onAddDependency(issue);
                    }}
                  />
                ))}
                {issues.length === 0 && (
                  <div className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed border-border/50 rounded-lg bg-muted/20">
                    <p>Drop cards here</p>
                    <Button variant="ghost" size="sm" onClick={onAddCard} className="mt-2 hover:bg-primary/10 hover:text-primary">
                      <Plus className="h-4 w-4 mr-1" />
                      Add card
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </SortableContext>
        </CardContent>
      </Card>
    </div>
  );
}

// Sortable Task Card
function SortableTaskCard({
  issue,
  onClick,
  onAddDependency,
}: {
  issue: TaskWithProject;
  onClick: () => void;
  onAddDependency: (e: React.MouseEvent) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${issue.projectId}:${issue.id}`,
    data: {
      type: 'task',
      issue,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCard
        issue={issue}
        onClick={onClick}
        onAddDependency={onAddDependency}
        isDragging={isDragging}
        dragListeners={listeners}
      />
    </div>
  );
}

// Task Card Component
function TaskCard({
  issue,
  onClick,
  onAddDependency,
  isDragging = false,
  dragListeners,
}: {
  issue: TaskWithProject;
  onClick: () => void;
  onAddDependency: (e: React.MouseEvent) => void;
  isDragging?: boolean;
  dragListeners?: any;
}) {
  const hasBlockers = (issue.dependencies?.blockedBy?.length || 0) > 0;
  const hasDependencies = (issue.dependencies?.dependsOn?.length || 0) > 0;
  const isOverdue = issue.duedate && new Date(issue.duedate) < new Date();
  const toolColors = TOOL_COLORS[issue.integrationType];
  
  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-lg transition-all duration-300 border-l-4 group bg-card/80 backdrop-blur-sm hover:bg-card hover:border-opacity-100",
        toolColors.border,
        hasBlockers && "bg-red-950/20 border-red-500/50",
        isDragging && "opacity-50 shadow-xl rotate-2 scale-105"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 space-y-2">
        {/* Drag handle and header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <div 
              {...dragListeners}
              className="cursor-grab active:cursor-grabbing p-1 -ml-1 hover:bg-muted rounded transition-colors"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <Badge variant="outline" className="text-xs font-mono bg-muted/50">
              {issue.key}
            </Badge>
            <Badge className={cn("text-xs border-0", toolColors.badge)}>
              {issue.integrationType}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-primary/10 hover:text-primary"
            onClick={onAddDependency}
            title="Add dependency"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        
        {/* Tool indicator line */}
        <div className={cn("h-1 w-full rounded-full", toolColors.line)} />
        
        <p className="text-sm font-medium text-foreground leading-tight line-clamp-2">
          {issue.summary}
        </p>
        
        <div className="flex items-center gap-2 flex-wrap">
          {hasBlockers && (
            <div className="flex items-center gap-1 text-xs text-red-400 bg-red-950/30 border border-red-800/30 px-2 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" />
              <span>Blocked ({issue.dependencies?.blockedBy?.length})</span>
            </div>
          )}
          {hasDependencies && !hasBlockers && (
            <div className="flex items-center gap-1 text-xs text-blue-400 bg-blue-950/30 border border-blue-800/30 px-2 py-0.5 rounded-full">
              <Link2 className="h-3 w-3" />
              <span>Depends ({issue.dependencies?.dependsOn?.length})</span>
            </div>
          )}
        </div>
        
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          {issue.duedate ? (
            <div className={cn(
              "flex items-center gap-1 text-xs",
              isOverdue ? "text-red-400" : "text-muted-foreground"
            )}>
              <Calendar className="h-3 w-3" />
              <span>{new Date(issue.duedate).toLocaleDateString('en-GB', { 
                day: 'numeric', 
                month: 'short' 
              })}</span>
              {isOverdue && (
                <AlertTriangle className="h-3 w-3 ml-1 text-red-500" />
              )}
            </div>
          ) : (
            <div />
          )}
          
          {issue.assignee && (
            <Avatar className="h-6 w-6 border-2 border-primary/20">
              <AvatarImage 
                src={issue.assignee.avatarUrls?.['48x48']} 
                alt={issue.assignee.displayName}
              />
              <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white text-xs">
                {issue.assignee.displayName
                  .split(' ')
                  .map(n => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
