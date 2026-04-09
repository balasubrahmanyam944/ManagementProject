"use client";

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { format, parseISO, differenceInDays, addDays, isValid } from 'date-fns';
import { JiraDashboardIssue } from '@/types/integrations';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut } from 'lucide-react';

// Extended issue type with project info
export interface MultiProjectIssue extends JiraDashboardIssue {
  projectName: string;
  projectKey: string;
  integrationType?: string;
}

// Define the data structure for Gantt chart items
export interface MultiProjectGanttItem {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  status: string;
  assignee?: string;
  type: string;
  priority?: string;
  projectName: string;
  projectKey: string;
  integrationType?: string;
  isOverdue?: boolean;
}

interface MultiProjectGanttChartProps {
  issues: MultiProjectIssue[];
  title?: string;
}

// Convert issues to Gantt chart items
const convertToGanttItems = (issues: MultiProjectIssue[]): MultiProjectGanttItem[] => {
  return issues.map((issue) => {
    // Determine start date
    let startDate = new Date();
    if ((issue as any).customfield_10018) {
      startDate = parseISO((issue as any).customfield_10018);
    } else if ((issue as any).customfield_10015) {
      startDate = parseISO((issue as any).customfield_10015);
    } else if (issue.created) {
      startDate = parseISO(issue.created);
    }

    // Determine end date
    let endDate = addDays(startDate, 1);
    if (issue.duedate) {
      endDate = parseISO(issue.duedate);
    } else if (issue.resolutiondate) {
      endDate = parseISO(issue.resolutiondate);
    } else if (issue.updated && parseISO(issue.updated) > startDate) {
      endDate = parseISO(issue.updated);
    } else {
      endDate = addDays(startDate, 1);
    }

    // Ensure end date is after start date
    if (endDate <= startDate) {
      endDate = addDays(startDate, 1);
    }
    
    // Calculate progress based on status
    let progress = 0;
    const statusName = issue.status?.name?.toLowerCase() || '';
    switch (statusName) {
      case 'done':
      case 'closed':
      case 'resolved':
      case 'complete':
      case 'completed':
        progress = 100;
        break;
      case 'in progress':
      case 'in development':
      case 'doing':
        progress = 50;
        break;
      case 'in review':
      case 'testing':
      case 'review':
        progress = 75;
        break;
      default:
        progress = 0;
    }

    const finalStartDate = isValid(startDate) ? startDate : new Date();
    const finalEndDate = isValid(endDate) ? endDate : addDays(startDate, 1);
    
    return {
      id: issue.id,
      name: issue.summary || issue.key,
      startDate: finalStartDate,
      endDate: finalEndDate,
      progress,
      status: issue.status?.name || 'Unknown',
      assignee: issue.assignee?.displayName || 'Unassigned',
      type: issue.issuetype?.name || 'Task',
      priority: issue.priority?.name,
      projectName: issue.projectName,
      projectKey: issue.projectKey,
      integrationType: issue.integrationType,
      isOverdue: false
    };
  });
};

// Helper function to get status color
const getStatusColor = (status: string, progress: number): string => {
  if (progress === 100) return '#22c55e'; // green
  if (progress >= 75) return '#3b82f6'; // blue
  if (progress >= 50) return '#f59e0b'; // amber
  if (progress > 0) return '#ef4444'; // red
  return '#6b7280'; // gray
};

// Helper function to get project color (for distinguishing projects)
const getProjectColor = (projectKey: string, projectIndex: number): string => {
  const colors = [
    '#8b5cf6', // violet
    '#06b6d4', // cyan
    '#f97316', // orange
    '#ec4899', // pink
    '#14b8a6', // teal
    '#84cc16', // lime
    '#6366f1', // indigo
    '#f43f5e', // rose
  ];
  return colors[projectIndex % colors.length];
};

// Helper function to calculate dynamic priority based on due date proximity
const calculateDynamicPriority = (endDate: Date, status: string): { priority: string, color: string } => {
  const now = new Date();
  const completedStatuses = ['done', 'closed', 'resolved', 'complete', 'completed'];
  
  if (completedStatuses.includes(status.toLowerCase())) {
    return { priority: 'Complete', color: '#22c55e' };
  }
  
  const daysUntilDue = differenceInDays(endDate, now);
  
  if (daysUntilDue < 0) {
    return { priority: 'Critical (Overdue)', color: '#dc2626' };
  } else if (daysUntilDue === 0) {
    return { priority: 'Critical (Due Today)', color: '#dc2626' };
  } else if (daysUntilDue <= 2) {
    return { priority: 'High (Due Soon)', color: '#ea580c' };
  } else if (daysUntilDue <= 7) {
    return { priority: 'Medium (This Week)', color: '#ca8a04' };
  } else if (daysUntilDue <= 30) {
    return { priority: 'Low (This Month)', color: '#16a34a' };
  } else {
    return { priority: 'Lowest (Future)', color: '#0891b2' };
  }
};

export default function MultiProjectGanttChart({ issues, title = "Multi-Project Gantt Chart" }: MultiProjectGanttChartProps) {
  const [zoomLevel, setZoomLevel] = useState(40); // pixels per day
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const ganttItems = useMemo(() => convertToGanttItems(issues), [issues]);
  
  // Get unique projects for color mapping
  const projectKeys = useMemo(() => {
    const keys = new Set<string>();
    ganttItems.forEach(item => keys.add(item.projectKey));
    return Array.from(keys);
  }, [ganttItems]);

  // Calculate date range
  const dateRange = useMemo(() => {
    if (ganttItems.length === 0) {
      return {
        startDate: new Date(),
        endDate: addDays(new Date(), 30),
        totalDays: 30
      };
    }

    const allDates = ganttItems.flatMap(item => [item.startDate, item.endDate]);
    const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
    
    // Add some padding
    const startDate = addDays(minDate, -2);
    const endDate = addDays(maxDate, 5);
    const totalDays = differenceInDays(endDate, startDate);

    return { startDate, endDate, totalDays };
  }, [ganttItems]);

  // Generate timeline headers
  const timelineHeaders = useMemo(() => {
    const headers = [];
    let currentDate = dateRange.startDate;
    
    while (currentDate <= dateRange.endDate) {
      headers.push({
        date: new Date(currentDate),
        label: format(currentDate, 'MMM dd'),
        isWeekend: [0, 6].includes(currentDate.getDay())
      });
      currentDate = addDays(currentDate, 1);
    }
    
    return headers;
  }, [dateRange]);

  // Sort items by project, then by start date
  const sortedItems = useMemo(() => {
    return [...ganttItems].sort((a, b) => {
      const projectCompare = a.projectKey.localeCompare(b.projectKey);
      if (projectCompare !== 0) return projectCompare;
      return a.startDate.getTime() - b.startDate.getTime();
    });
  }, [ganttItems]);

  // Group items by project for display
  const itemsByProject = useMemo(() => {
    const grouped: Record<string, MultiProjectGanttItem[]> = {};
    
    sortedItems.forEach(item => {
      if (!grouped[item.projectKey]) {
        grouped[item.projectKey] = [];
      }
      grouped[item.projectKey].push(item);
    });
    
    return grouped;
  }, [sortedItems]);

  // Sync scroll between left column and timeline
  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (leftColumnRef.current) {
      leftColumnRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 10, 100));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 10, 20));
  };

  if (!issues || issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-border rounded-lg bg-card">
        <p className="text-muted-foreground">No tasks available for Gantt view</p>
      </div>
    );
  }

  const ITEM_HEIGHT = 48;
  const TASK_NAME_WIDTH = 280;
  const HEADER_HEIGHT = 40;
  const MAX_HEIGHT = 450;

  return (
    <div className="w-full overflow-hidden" style={{ contain: 'layout paint' }}>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 bg-card">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleZoomOut} title="Zoom Out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground px-2">{zoomLevel}px/day</span>
          <Button variant="outline" size="sm" onClick={handleZoomIn} title="Zoom In">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Project Legend */}
      <div className="flex flex-wrap gap-3 mb-4 p-3 bg-muted/30 rounded-lg border border-border">
        <span className="text-sm font-medium text-foreground">Projects:</span>
        {projectKeys.map((key, index) => {
          const projectItem = ganttItems.find(item => item.projectKey === key);
          return (
            <div key={key} className="flex items-center gap-2">
              <div 
                className="w-4 h-4 rounded flex-shrink-0"
                style={{ backgroundColor: getProjectColor(key, index) }}
              />
              <span className="text-sm">
                {projectItem?.projectName || key}
                <span className="text-muted-foreground ml-1">({key})</span>
              </span>
            </div>
          );
        })}
      </div>
      
      {/* Gantt Chart Container */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        {/* Header Row */}
        <div className="flex border-b-2 border-border">
          {/* Fixed Header Cell */}
          <div 
            className="flex-shrink-0 p-2 font-medium bg-muted/50 border-r-2 border-border flex items-center text-foreground"
            style={{ width: TASK_NAME_WIDTH, minWidth: TASK_NAME_WIDTH, height: HEADER_HEIGHT }}
          >
            Task / Project
          </div>
          {/* Scrollable Header - synced with body timeline scroll */}
          <div 
            className="flex-1 overflow-hidden bg-muted/50"
            style={{ height: HEADER_HEIGHT }}
          >
            <div 
              className="flex"
              style={{ 
                width: timelineHeaders.length * zoomLevel,
                transform: `translateX(-${timelineRef.current?.scrollLeft || 0}px)`
              }}
              id="header-row"
            >
              {timelineHeaders.map((header, index) => (
                <div 
                  key={index}
                  className={`flex-shrink-0 border-r border-border p-1 text-center text-xs font-medium flex items-center justify-center text-foreground ${
                    header.isWeekend ? 'bg-muted/40' : 'bg-muted/50'
                  }`}
                  style={{ width: zoomLevel, height: HEADER_HEIGHT }}
                >
                  {header.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Body - Two column layout */}
        <div className="flex">
          {/* Left Column - Task/Project names with its own vertical scroll */}
          <div 
            ref={leftColumnRef}
            className="flex-shrink-0 border-r-2 border-border bg-card overflow-y-auto"
            style={{ width: TASK_NAME_WIDTH, minWidth: TASK_NAME_WIDTH, maxHeight: MAX_HEIGHT }}
          >
            <div className="overflow-x-auto">
              <div className="min-w-max">
                {Object.entries(itemsByProject).map(([projectKey, items], projectIndex) => {
                  const projectColor = getProjectColor(projectKey, projectIndex);
                  const projectName = items[0]?.projectName || projectKey;
                  
                  return (
                    <React.Fragment key={projectKey}>
                      {/* Project Header */}
                      <div 
                        className="border-b border-border p-2 font-semibold bg-muted/30 flex items-center"
                        style={{ 
                          height: ITEM_HEIGHT,
                          borderLeft: `4px solid ${projectColor}`
                        }}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div 
                            className="w-3 h-3 rounded flex-shrink-0"
                            style={{ backgroundColor: projectColor }}
                          />
                          <span className="truncate text-foreground">{projectName}</span>
                          <span className="text-muted-foreground text-sm font-normal flex-shrink-0">
                            ({items.length})
                          </span>
                        </div>
                      </div>
                      
                      {/* Project Items */}
                      {items.map((item) => {
                        const dynamicPriority = calculateDynamicPriority(item.endDate, item.status);
                        return (
                          <div 
                            key={item.id}
                            className="border-b border-border p-2 bg-card hover:bg-muted/20 flex flex-col justify-center transition-colors"
                            style={{ 
                              height: ITEM_HEIGHT,
                              borderLeft: `4px solid ${projectColor}`
                            }}
                          >
                            <div className="flex items-center gap-2" title={item.name}>
                              <span 
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: dynamicPriority.color }}
                                title={`Priority: ${dynamicPriority.priority}`}
                              />
                              <span className="font-medium text-sm truncate text-foreground">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-2 pl-4">
                              <span className="text-xs text-muted-foreground truncate" style={{ maxWidth: 100 }}>
                                {item.assignee}
                              </span>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted/50 text-foreground flex-shrink-0">
                                {item.status}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
          
          {/* Right Column - Timeline/Dates with its own horizontal and vertical scroll */}
          
          <div 
            ref={timelineRef}
            className="flex-1 overflow-y-auto"
            style={{ maxHeight: MAX_HEIGHT }}
            onScroll={(e) => {
              handleTimelineScroll(e);
              // Sync header horizontal scroll
              const headerRow = document.getElementById('header-row');
              if (headerRow) {
                headerRow.style.transform = `translateX(-${e.currentTarget.scrollLeft}px)`;
              }
            }}
          >
            
            <div style={{ width: timelineHeaders.length * zoomLevel, minWidth: timelineHeaders.length * zoomLevel }}>
            <div className="overflow-x-auto">
            <div className="min-w-max">
              {Object.entries(itemsByProject).map(([projectKey, items], projectIndex) => {
                const projectColor = getProjectColor(projectKey, projectIndex);
                
                return (
                  <React.Fragment key={projectKey}>
                    {/* Project Header Row */}
                    <div 
                      className="flex border-b border-border bg-muted/30"
                      style={{ height: ITEM_HEIGHT }}
                    >
                      {timelineHeaders.map((header, idx) => (
                        <div 
                          key={idx} 
                          className={`flex-shrink-0 border-r border-border ${header.isWeekend ? 'bg-muted/40' : 'bg-muted/30'}`}
                          style={{ width: zoomLevel, height: ITEM_HEIGHT }}
                        />
                      ))}
                    </div>

                    {/* Project Items */}
                    {items.map((item) => {
                      const startOffset = differenceInDays(item.startDate, dateRange.startDate);
                      const duration = differenceInDays(item.endDate, item.startDate) || 1;
                      const barWidth = Math.max(20, duration * zoomLevel);
                      const barLeft = startOffset * zoomLevel;
                      const dynamicPriority = calculateDynamicPriority(item.endDate, item.status);

                      return (
                        <div 
                          key={item.id} 
                          className="flex border-b border-border hover:bg-muted/20 relative transition-colors"
                          style={{ height: ITEM_HEIGHT }}
                        >
                          {/* Grid cells */}
                          {timelineHeaders.map((header, idx) => (
                            <div 
                              key={idx}
                              className={`flex-shrink-0 border-r border-border ${header.isWeekend ? 'bg-muted/20' : 'bg-card'}`}
                              style={{ width: zoomLevel, height: ITEM_HEIGHT }}
                            />
                          ))}
                          
                          {/* Gantt Bar - positioned absolutely */}
                          <div
                            className="absolute rounded shadow-sm flex items-center justify-center overflow-hidden"
                            style={{
                              left: barLeft,
                              width: barWidth,
                              height: 24,
                              backgroundColor: projectColor,
                              opacity: 0.9,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              zIndex: 5
                            }}
                            title={`${item.name}\nProject: ${item.projectName}\nAssignee: ${item.assignee}\nStatus: ${item.status}\nProgress: ${item.progress}%\nPriority: ${dynamicPriority.priority}\nStart: ${format(item.startDate, 'MMM dd, yyyy')}\nEnd: ${format(item.endDate, 'MMM dd, yyyy')}\nDuration: ${differenceInDays(item.endDate, item.startDate) + 1} day(s)`}
                          >
                            {/* Progress Bar */}
                            <div
                              className="absolute left-0 top-0 h-full rounded-l"
                              style={{
                                width: `${item.progress}%`,
                                backgroundColor: getStatusColor(item.status, item.progress),
                                opacity: 0.9
                              }}
                            />
                            {/* Label */}
                            {barWidth > 50 && (
                              <span 
                                className="relative z-10 text-xs font-medium text-white truncate px-1"
                                style={{ 
                                  textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                                  maxWidth: barWidth - 8
                                }}
                              >
                                {item.assignee?.split(' ').map(n => n.charAt(0)).join('').substring(0, 2).toUpperCase() || 'UA'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </React.Fragment>
                );
              })}
              </div>
            </div>
            </div>
            
          
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
        <h4 className="text-sm font-medium mb-3 text-foreground">Legend</h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Status Legend */}
          <div>
            <span className="text-xs font-medium text-foreground mb-2 block">Progress Status:</span>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-muted-foreground/50 rounded"></div>
                <span className="text-foreground">Not Started</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-amber-500 rounded"></div>
                <span className="text-foreground">In Progress</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-blue-500 rounded"></div>
                <span className="text-foreground">Near Complete</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded"></div>
                <span className="text-foreground">Complete</span>
              </div>
            </div>
          </div>

          {/* Priority Legend */}
          <div>
            <span className="text-xs font-medium text-foreground mb-2 block">Dynamic Priority (Based on Due Date):</span>
            <div className="flex flex-wrap gap-3 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                <span className="text-foreground">Critical</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
                <span className="text-foreground">High</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-yellow-600 rounded-full"></div>
                <span className="text-foreground">Medium</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                <span className="text-foreground">Low</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-cyan-600 rounded-full"></div>
                <span className="text-foreground">Lowest</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">📋 Multi-Project View:</span> Issues are grouped by project. 
          Each project has a distinct color for easy identification. Scroll horizontally within the timeline area to see all dates.
        </div>
      </div>
    </div>
  );
}
