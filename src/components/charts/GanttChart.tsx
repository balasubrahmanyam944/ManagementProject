"use client";

import React, { useMemo } from 'react';
import { format, parseISO, differenceInDays, addDays, isValid } from 'date-fns';
import { JiraDashboardIssue, TrelloCard } from '@/types/integrations';

// Define the data structure for Gantt chart items
export interface GanttChartItem {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number;
  status: string;
  assignee?: string;
  type: string;
  priority?: string;
  dependencies?: string[];
  isOverdue?: boolean;
}

interface GanttChartProps {
  issues: JiraDashboardIssue[] | TrelloCard[];
  title?: string;
}

// Helper function to determine if an issue is a Jira issue
const isJiraIssue = (issue: any): issue is JiraDashboardIssue => {
  return 'key' in issue && 'status' in issue && 'created' in issue;
};

// Helper function to determine if an issue is a Trello card
const isTrelloCard = (issue: any): issue is TrelloCard => {
  return 'idList' in issue && 'list' in issue;
};

// Convert issues to Gantt chart items
const convertToGanttItems = (issues: (JiraDashboardIssue | TrelloCard)[]): GanttChartItem[] => {
  return issues.map((issue, index) => {
    if (isJiraIssue(issue)) {


      // Determine start date: try multiple custom fields, then fall back to created date
      let startDate = new Date();
      if (issue.customfield_10018) {
        // Sprint start date is often in customfield_10018
        startDate = parseISO(issue.customfield_10018);
      } else if (issue.customfield_10015) {
        startDate = parseISO(issue.customfield_10015);
      } else if (issue.created) {
        startDate = parseISO(issue.created);
      }

      // Determine end date: priority order: duedate > resolutiondate > updated date > calculated
      let endDate = addDays(startDate, 1); // Default to 1 day duration
      if (issue.duedate) {
        endDate = parseISO(issue.duedate);
      } else if (issue.resolutiondate) {
        endDate = parseISO(issue.resolutiondate);
      } else if (issue.updated && parseISO(issue.updated) > startDate) {
        endDate = parseISO(issue.updated);
      } else {
        // If no specific end date, show as single day task (as requested by user)
        endDate = addDays(startDate, 1); // Single day duration when no dates are set
      }

      // Ensure end date is after start date
      if (endDate <= startDate) {
        endDate = addDays(startDate, 1);

      }
      
      // Calculate progress based on status
      let progress = 0;
      switch (issue.status.name.toLowerCase()) {
        case 'done':
        case 'closed':
        case 'resolved':
          progress = 100;
          break;
        case 'in progress':
        case 'in development':
          progress = 50;
          break;
        case 'in review':
        case 'testing':
          progress = 75;
          break;
        default:
          progress = 0;
      }

      const finalStartDate = isValid(startDate) ? startDate : new Date();
      const finalEndDate = isValid(endDate) ? endDate : addDays(startDate, 1);
      
      return {
        id: issue.id,
        name: issue.summary,
        startDate: finalStartDate,
        endDate: finalEndDate,
        progress,
        status: issue.status.name,
        assignee: issue.assignee?.displayName || 'Unassigned',
        type: issue.issuetype.name,
        priority: issue.priority?.name,
        dependencies: [],
        isOverdue: false // Not needed anymore, using dynamic calculation
      };
    } else if (isTrelloCard(issue)) {


      // For Trello cards, use dateLastActivity as start date (when card was last worked on)
      let startDate = new Date();
      if (issue.dateLastActivity) {
        startDate = parseISO(issue.dateLastActivity);

      }

      // Use due date if available, otherwise create a reasonable duration
      let endDate = addDays(startDate, 1); // Default to 1 day duration
      if (issue.due) {
        endDate = parseISO(issue.due);
        // If due date is before start date, adjust start date
        if (endDate < startDate) {
          startDate = addDays(endDate, -3); // Start 3 days before due date
        }
      } else {
        // No due date set, show as single day task (as requested by user)
        endDate = addDays(startDate, 1); // Single day duration when no due date is set
      }

      // Ensure end date is after start date
      if (endDate <= startDate) {
        endDate = addDays(startDate, 1);

      }
      
      // Calculate progress based on list name/status
      let progress = 0;
      const listName = issue.list.name.toLowerCase();
      if (listName.includes('done') || listName.includes('complete')) {
        progress = 100;
      } else if (listName.includes('doing') || listName.includes('progress')) {
        progress = 50;
      } else if (listName.includes('review') || listName.includes('testing')) {
        progress = 75;
      }

      const finalStartDate = isValid(startDate) ? startDate : new Date();
      const finalEndDate = isValid(endDate) ? endDate : addDays(startDate, 1);
      
      return {
        id: issue.id,
        name: issue.name,
        startDate: finalStartDate,
        endDate: finalEndDate,
        progress,
        status: issue.list.name,
        assignee: issue.members.length > 0 ? issue.members[0].fullName : 'Unassigned',
        type: 'Card',
        priority: issue.labels && issue.labels.length > 0 ? issue.labels[0].name : 'Normal',
        dependencies: [],
        isOverdue: false // Not needed anymore, using dynamic calculation
      };
    }
    
    // Fallback
    return {
      id: `item-${index}`,
      name: 'Unknown Item',
      startDate: new Date(),
      endDate: addDays(new Date(), 1),
      progress: 0,
      status: 'Unknown',
      type: 'Unknown',
      dependencies: [],
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

// Helper function to calculate dynamic priority based on due date proximity
const calculateDynamicPriority = (endDate: Date, status: string): { priority: string, color: string } => {
  const now = new Date();
  const completedStatuses = ['done', 'closed', 'resolved', 'complete', 'completed'];
  
  // If task is completed, use a neutral color
  if (completedStatuses.includes(status.toLowerCase())) {
    return { priority: 'Complete', color: '#22c55e' }; // Green for completed
  }
  
  // Calculate days until due date (can be negative if overdue)
  const daysUntilDue = differenceInDays(endDate, now);
  
  // Dynamic priority logic based on time remaining
  if (daysUntilDue < 0) {
    // Overdue - Critical
    return { priority: 'Critical (Overdue)', color: '#dc2626' }; // Red
  } else if (daysUntilDue === 0) {
    // Due today - Critical
    return { priority: 'Critical (Due Today)', color: '#dc2626' }; // Red
  } else if (daysUntilDue <= 2) {
    // Due within 2 days - High
    return { priority: 'High (Due Soon)', color: '#ea580c' }; // Orange
  } else if (daysUntilDue <= 7) {
    // Due within a week - Medium
    return { priority: 'Medium (This Week)', color: '#ca8a04' }; // Yellow
  } else if (daysUntilDue <= 30) {
    // Due within a month - Low
    return { priority: 'Low (This Month)', color: '#16a34a' }; // Green
  } else {
    // Due far in future - Lowest
    return { priority: 'Lowest (Future)', color: '#0891b2' }; // Cyan
  }
};

// Helper function to get priority color (now uses dynamic calculation)
const getPriorityColor = (endDate: Date, status: string): string => {
  return calculateDynamicPriority(endDate, status).color;
};

// Helper function to get priority label
const getPriorityLabel = (endDate: Date, status: string): string => {
  return calculateDynamicPriority(endDate, status).priority;
};

export default function GanttChart({ issues, title = "Project Gantt Chart" }: GanttChartProps) {
  const ganttItems = useMemo(() => convertToGanttItems(issues), [issues]);
  
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
    const endDate = addDays(maxDate, 2);
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
        label: format(currentDate, 'MMM dd')
      });
      currentDate = addDays(currentDate, 1);
    }
    
    return headers;
  }, [dateRange]);

  if (!issues || issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-border rounded-lg bg-card">
        <p className="text-muted-foreground">No tasks available for Gantt view</p>
      </div>
    );
  }

  const ITEM_HEIGHT = 50;
  const TASK_NAME_WIDTH = 300;

  return (
    <div className="w-full">
      <h3 className="text-lg font-semibold mb-4 text-foreground">{title}</h3>
      
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {/* Synchronized scrolling container with sticky header */}
        <div className="overflow-x-auto max-h-96">
          <div style={{ minWidth: `${TASK_NAME_WIDTH + timelineHeaders.length * 60}px` }}>
            {/* Header - Sticky */}
            <div className="flex border-b-2 border-border bg-muted/50 sticky top-0 z-20 shadow-md">
              <div 
                className="border-r border-border p-3 font-medium bg-muted/50 flex items-center flex-shrink-0 opacity-100 text-foreground"
                style={{ width: TASK_NAME_WIDTH, minWidth: TASK_NAME_WIDTH }}
              >
                <span>Task</span>
              </div>
              <div className="flex">
                {timelineHeaders.map((header, index) => (
                  <div 
                    key={index}
                    className="border-r border-border p-2 text-center text-xs font-medium bg-muted/50 flex-shrink-0 opacity-100 text-foreground"
                    style={{ minWidth: '60px', width: '60px' }}
                  >
                    {header.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks */}
            <div className="overflow-y-auto">
              {ganttItems.map((item, index) => {
                const startOffset = differenceInDays(item.startDate, dateRange.startDate);
                const duration = differenceInDays(item.endDate, item.startDate) || 1;
                const leftPosition = Math.max(0, startOffset * 60);
                const barWidth = Math.max(20, duration * 60);

                return (
                  <div key={item.id} className="flex border-b border-border hover:bg-muted/20 transition-colors">
                    {/* Task Info */}
                    <div 
                      className="border-r border-border p-3 flex flex-col justify-center flex-shrink-0 bg-card"
                      style={{ width: TASK_NAME_WIDTH, minWidth: TASK_NAME_WIDTH }}
                    >
                      <div className="font-medium text-sm truncate text-foreground" title={item.name}>
                        {item.name}
                      </div>
                      <div className="flex flex-col gap-1 mt-1">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getPriorityColor(item.endDate, item.status) }}
                            title={`Priority: ${getPriorityLabel(item.endDate, item.status)}`}
                          />
                          <span className="text-xs text-muted-foreground">
                            
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">👤</span>
                          <span className="text-xs text-foreground font-medium truncate" title={`Assigned to: ${item.assignee}`}>
                            {item.assignee}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div 
                      className="relative flex items-center bg-card"
                      style={{ height: ITEM_HEIGHT, width: `${timelineHeaders.length * 60}px`, minWidth: `${timelineHeaders.length * 60}px` }}
                    >
                      {/* Timeline Grid Lines */}
                      {timelineHeaders.map((_, headerIndex) => (
                        <div
                          key={headerIndex}
                          className="absolute border-r border-border"
                          style={{
                            left: `${headerIndex * 60}px`,
                            height: '100%',
                            width: '1px'
                          }}
                        />
                      ))}

                      {/* Gantt Bar */}
                      <div
                        className="absolute rounded-md shadow-sm border z-10"
                        style={{
                          left: `${leftPosition}px`,
                          width: `${barWidth}px`,
                          height: '20px',
                          backgroundColor: getStatusColor(item.status, item.progress),
                          opacity: 0.8
                        }}
                        title={`${item.name}\nAssignee: ${item.assignee}\nStatus: ${item.status}\nProgress: ${item.progress}%\nPriority: ${getPriorityLabel(item.endDate, item.status)}\nStart: ${format(item.startDate, 'MMM dd, yyyy')}\nEnd: ${format(item.endDate, 'MMM dd, yyyy')}\nDuration: ${differenceInDays(item.endDate, item.startDate) + 1} day(s)`}
                                              >
                          {/* Progress Bar */}
                          <div
                            className="h-full rounded-md"
                            style={{
                              width: `${item.progress}%`,
                              backgroundColor: getStatusColor(item.status, item.progress),
                              opacity: 1
                            }}
                          />
                          {/* Assignee initials on bar (if bar is wide enough) */}
                          {barWidth > 40 && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span 
                                className="text-xs font-semibold text-white drop-shadow-sm"
                                style={{ 
                                  textShadow: '1px 1px 1px rgba(0,0,0,0.5)',
                                  fontSize: '10px'
                                }}
                              >
                                {(item.assignee || 'Unassigned').split(' ').map(name => name.charAt(0)).join('').substring(0, 2).toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 p-4 bg-muted/30 rounded-lg border border-border">
        <h4 className="text-sm font-medium mb-2 text-foreground">Legend</h4>
        <div className="mb-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">📋 Task Information:</span> Each task shows the title, assignee (👤), progress percentage, and priority indicator.
          Assignee initials appear on wider Gantt bars.
        </div>
        <div className="mb-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">📅 Date & Priority Logic:</span> 
          <strong className="text-foreground">Dates:</strong> Jira uses due date → resolution date → updated date. Trello uses due date → last activity. 
          <strong className="text-foreground">Priority:</strong> Calculated by days until due date (overdue = critical, 1-2 days = high, etc.).
        </div>
        <div className="flex flex-wrap gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-muted-foreground/50 rounded"></div>
            <span className="text-foreground">Not Started</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-foreground">Started</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-amber-500 rounded"></div>
            <span className="text-foreground">In Progress</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-500 rounded"></div>
            <span className="text-foreground">Near Complete</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-foreground">Complete</span>
          </div>
        </div>
        
        <div className="mt-2 flex flex-wrap gap-4 text-xs">
          <span className="font-medium text-foreground">Dynamic Priority (Based on Due Date):</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-red-600 rounded-full"></div>
            <span className="text-foreground">Critical (Overdue/Due Today)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-orange-600 rounded-full"></div>
            <span className="text-foreground">High (Due in 1-2 days)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-yellow-600 rounded-full"></div>
            <span className="text-foreground">Medium (Due this week)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-600 rounded-full"></div>
            <span className="text-foreground">Low (Due this month)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-cyan-600 rounded-full"></div>
            <span className="text-foreground">Lowest (Due in future)</span>
          </div>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">🎯 Smart Priority:</span> Priority automatically calculated based on time remaining until due date, not original Jira/Trello priority.
        </div>
      </div>
    </div>
  );
} 