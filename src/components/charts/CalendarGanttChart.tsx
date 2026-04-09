"use client";

import React, { useMemo, useState } from 'react';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, isToday, addMonths, subMonths, isValid, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { JiraDashboardIssue } from '@/types/integrations';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Link2, Filter } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';

// Extended issue type with project info
export interface MultiProjectIssue extends JiraDashboardIssue {
  projectName: string;
  projectKey: string;
  integrationType?: string;
  dependencies?: {
    dependsOn?: Array<{
      taskId: string;
      taskKey?: string;
      taskSummary: string;
      projectId: string;
      projectName: string;
    }>;
    blockedBy?: Array<{
      taskId: string;
      taskKey?: string;
      taskSummary: string;
      projectId: string;
      projectName: string;
    }>;
  };
}

// Define the data structure for calendar items
interface CalendarItem {
  id: string;
  name: string;
  date: Date;
  endDate: Date;
  progress: number;
  status: string;
  assignee?: string;
  type: string;
  priority?: string;
  projectName: string;
  projectKey: string;
  integrationType?: string;
  dependencies?: {
    dependsOn?: Array<{
      taskId: string;
      taskKey?: string;
      taskSummary: string;
      projectId: string;
      projectName: string;
    }>;
    blockedBy?: Array<{
      taskId: string;
      taskKey?: string;
      taskSummary: string;
      projectId: string;
      projectName: string;
    }>;
  };
}

interface CalendarGanttChartProps {
  issues: MultiProjectIssue[];
  title?: string;
}

// Tool colors - Dark mode
const getToolColor = (integrationType?: string): { bg: string; border: string; text: string } => {
  switch (integrationType?.toUpperCase()) {
    case 'JIRA':
      return { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-300' };
    case 'TRELLO':
      return { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-300' };
    case 'TESTRAIL':
      return { bg: 'bg-green-500/20', border: 'border-green-500', text: 'text-green-300' };
    default:
      return { bg: 'bg-muted/50', border: 'border-border', text: 'text-foreground' };
  }
};

// Progress status colors
const getProgressColor = (progress: number, status: string): string => {
  const statusLower = status.toLowerCase();
  if (statusLower.includes('done') || statusLower.includes('complete') || statusLower.includes('closed') || statusLower.includes('resolved')) {
    return 'bg-green-500';
  }
  if (progress >= 75 || statusLower.includes('review') || statusLower.includes('testing')) {
    return 'bg-blue-500';
  }
  if (progress >= 50 || statusLower.includes('progress') || statusLower.includes('doing')) {
    return 'bg-amber-500';
  }
  if (progress > 0) {
    return 'bg-orange-500';
  }
  return 'bg-gray-400';
};

// Convert issues to calendar items
const convertToCalendarItems = (issues: MultiProjectIssue[]): CalendarItem[] => {
  return issues.map((issue) => {
    // Determine date (use due date, or created date, or today)
    let date = new Date();
    let endDate = new Date();
    
    if (issue.duedate) {
      date = parseISO(issue.duedate);
      endDate = date;
    } else if ((issue as any).customfield_10018) {
      date = parseISO((issue as any).customfield_10018);
      endDate = date;
    } else if ((issue as any).customfield_10015) {
      date = parseISO((issue as any).customfield_10015);
      endDate = date;
    } else if (issue.created) {
      date = parseISO(issue.created);
      endDate = issue.updated ? parseISO(issue.updated) : date;
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

    return {
      id: issue.id,
      name: issue.summary || issue.key,
      date: isValid(date) ? date : new Date(),
      endDate: isValid(endDate) ? endDate : new Date(),
      progress,
      status: issue.status?.name || 'Unknown',
      assignee: issue.assignee?.displayName || 'Unassigned',
      type: issue.issuetype?.name || 'Task',
      priority: issue.priority?.name,
      projectName: issue.projectName,
      projectKey: issue.projectKey,
      integrationType: issue.integrationType,
      dependencies: issue.dependencies,
    };
  });
};

export default function CalendarGanttChart({ issues, title = "Calendar View" }: CalendarGanttChartProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showDependenciesOnly, setShowDependenciesOnly] = useState(false);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  
  const calendarItems = useMemo(() => {
    const items = convertToCalendarItems(issues);
    if (showDependenciesOnly) {
      return items.filter(item => 
        (item.dependencies?.dependsOn && item.dependencies.dependsOn.length > 0) ||
        (item.dependencies?.blockedBy && item.dependencies.blockedBy.length > 0)
      );
    }
    return items;
  }, [issues, showDependenciesOnly]);

  // Calculate available months within date range
  const availableMonths = useMemo(() => {
    if (!dateRange.from || !dateRange.to) {
      // If no date range, use all months from calendar items
      const allDates = calendarItems.map(item => item.date);
      if (allDates.length === 0) {
        return [new Date()];
      }
      
      const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
      
      const months: Date[] = [];
      let current = startOfMonth(minDate);
      while (current <= maxDate) {
        months.push(new Date(current));
        current = addMonths(current, 1);
      }
      return months.length > 0 ? months : [new Date()];
    }
    
    // Get all months between from and to dates
    const months: Date[] = [];
    let current = startOfMonth(dateRange.from);
    const endMonth = startOfMonth(dateRange.to);
    
    while (current <= endMonth) {
      months.push(new Date(current));
      current = addMonths(current, 1);
    }
    
    return months.length > 0 ? months : [new Date()];
  }, [dateRange, calendarItems]);

  // Get current month index in available months
  const currentMonthIndex = useMemo(() => {
    const currentMonth = startOfMonth(currentDate);
    const index = availableMonths.findIndex(month => 
      format(month, 'yyyy-MM') === format(currentMonth, 'yyyy-MM')
    );
    return index >= 0 ? index : 0; // Default to 0 if not found
  }, [currentDate, availableMonths]);

  // Get calendar grid dates (filtered by date range if set)
  const calendarDates = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 0 });

    const dates: Date[] = [];
    let day = startDate;
    while (day <= endDate) {
      // If date range is set, only include dates within range
      if (dateRange.from && dateRange.to) {
        const dayStart = startOfDay(day);
        const rangeStart = startOfDay(dateRange.from);
        const rangeEnd = endOfDay(dateRange.to);
        
        if (isWithinInterval(dayStart, { start: rangeStart, end: rangeEnd })) {
          dates.push(day);
        } else {
          dates.push(day); // Still add for grid layout, but will be hidden
        }
      } else {
        dates.push(day);
      }
      day = addDays(day, 1);
    }
    return dates;
  }, [currentDate, dateRange]);

  // Group items by date
  const itemsByDate = useMemo(() => {
    const grouped: Record<string, CalendarItem[]> = {};
    
    calendarItems.forEach(item => {
      const dateKey = format(item.date, 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(item);
    });
    
    return grouped;
  }, [calendarItems]);

  // Get unique tools for legend
  const tools = useMemo(() => {
    const toolSet = new Set<string>();
    calendarItems.forEach(item => {
      if (item.integrationType) {
        toolSet.add(item.integrationType.toUpperCase());
      }
    });
    return Array.from(toolSet);
  }, [calendarItems]);

  const goToPreviousMonth = () => {
    if (currentMonthIndex > 0) {
      setCurrentDate(availableMonths[currentMonthIndex - 1]);
    } else if (!dateRange.from || !dateRange.to) {
      // If no date range, allow normal navigation
      setCurrentDate(subMonths(currentDate, 1));
    }
  };
  
  const goToNextMonth = () => {
    if (currentMonthIndex < availableMonths.length - 1) {
      setCurrentDate(availableMonths[currentMonthIndex + 1]);
    } else if (!dateRange.from || !dateRange.to) {
      // If no date range, allow normal navigation
      setCurrentDate(addMonths(currentDate, 1));
    }
  };
  
  const handleDateRangeChange = (range: { from: Date | undefined; to: Date | undefined }) => {
    if (range.from && range.to) {
      setDateRange({ from: range.from, to: range.to });
      // Set current date to the start of the range
      setCurrentDate(startOfMonth(range.from));
      setIsDateFilterOpen(false);
    } else if (range.from) {
      setDateRange({ from: range.from, to: null });
    } else {
      setDateRange({ from: null, to: null });
    }
  };
  
  const clearDateRange = () => {
    setDateRange({ from: null, to: null });
    setCurrentDate(new Date());
    setIsDateFilterOpen(false);
  };

  const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  if (!issues || issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 border border-border rounded-lg bg-card">
        <p className="text-muted-foreground">No tasks available for Calendar view</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="w-full bg-card rounded-lg shadow-sm border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-4">
            {/* Date Range Filter */}
            <Popover open={isDateFilterOpen} onOpenChange={setIsDateFilterOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex items-center gap-2 relative z-10">
                  <Filter className="h-4 w-4" />
                  Date Range
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <Label>Select Date Range</Label>
                    <Calendar
                      mode="range"
                      selected={{
                        from: dateRange.from || undefined,
                        to: dateRange.to || undefined,
                      }}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          handleDateRangeChange({ from: range.from, to: range.to });
                        } else if (range?.from) {
                          setDateRange({ from: range.from, to: null });
                        } else {
                          setDateRange({ from: null, to: null });
                        }
                      }}
                      numberOfMonths={2}
                      className="rounded-md border"
                    />
                  </div>
                  {dateRange.from && dateRange.to && (
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="text-sm text-muted-foreground">
                        {format(dateRange.from, 'MMM d, yyyy')} - {format(dateRange.to, 'MMM d, yyyy')}
                      </div>
                      <Button variant="ghost" size="sm" onClick={clearDateRange}>
                        Clear
                      </Button>
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
            <div className="flex items-center gap-1">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={goToPreviousMonth}
                disabled={!!(dateRange.from && dateRange.to && currentMonthIndex === 0)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={goToNextMonth}
                disabled={!!(dateRange.from && dateRange.to && currentMonthIndex === availableMonths.length - 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <h2 className="text-xl font-semibold">
              {format(currentDate, 'MMMM yyyy')}
              {dateRange.from && dateRange.to && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  ({format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')})
                </span>
              )}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            
            {/* Dependency Filter Checkbox */}
            <div className="flex items-center gap-2">
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
            
            {/* Tool Legend */}
            <div className="flex items-center gap-4">
              {tools.map(tool => {
                const colors = getToolColor(tool);
                return (
                  <div key={tool} className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded ${colors.bg} border-2 ${colors.border}`} />
                    <span className="text-sm font-medium">{tool}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Week Day Headers */}
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {weekDays.map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-foreground border-r border-border last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
            {calendarDates.map((date, index) => {
            const dateKey = format(date, 'yyyy-MM-dd');
            const dayItems = itemsByDate[dateKey] || [];
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isCurrentDay = isToday(date);
            const maxVisibleItems = 3;
            const hasMoreItems = dayItems.length > maxVisibleItems;
            const isExpanded = expandedDates.has(dateKey);
            const visibleItems = isExpanded ? dayItems : dayItems.slice(0, maxVisibleItems);
            
            // Check if date is within the selected range
            const isInRange = dateRange.from && dateRange.to
              ? isWithinInterval(startOfDay(date), { 
                  start: startOfDay(dateRange.from), 
                  end: endOfDay(dateRange.to) 
                })
              : true;
            
            const toggleExpand = (e: React.MouseEvent) => {
              e.stopPropagation();
              setExpandedDates(prev => {
                const newSet = new Set(prev);
                if (newSet.has(dateKey)) {
                  newSet.delete(dateKey);
                } else {
                  newSet.add(dateKey);
                }
                return newSet;
              });
            };

            return (
              <div
                key={index}
                className={`min-h-[120px] border-b border-r border-border p-1 ${
                  !isCurrentMonth ? 'bg-muted/20' : 'bg-card'
                } ${isCurrentDay ? 'bg-primary/10 ring-2 ring-primary/30' : ''} ${
                  !isInRange ? 'opacity-30 pointer-events-none' : ''
                }`}
              >
                {/* Date Number */}
                <div className={`flex items-center justify-between mb-1`}>
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 text-sm font-medium rounded-full ${
                      !isInRange
                        ? 'text-muted-foreground/30'
                        : isCurrentDay
                        ? 'bg-primary text-primary-foreground'
                        : !isCurrentMonth
                        ? 'text-muted-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {format(date, 'd')}
                  </span>
                  {isInRange && dayItems.length > 0 && (
                    <span className="text-xs text-muted-foreground">{dayItems.length} item{dayItems.length > 1 ? 's' : ''}</span>
                  )}
                </div>

                {/* Items */}
                {isInRange && (
                  <div className="space-y-1">
                    {visibleItems.map((item) => {
                    const toolColors = getToolColor(item.integrationType);
                    const progressColor = getProgressColor(item.progress, item.status);
                    const hasDependencies = (item.dependencies?.dependsOn && item.dependencies.dependsOn.length > 0) ||
                                            (item.dependencies?.blockedBy && item.dependencies.blockedBy.length > 0);
                    const dependsOnCount = item.dependencies?.dependsOn?.length || 0;
                    const blockedByCount = item.dependencies?.blockedBy?.length || 0;
                    
                    // Different styling for dependency items
                    const dependencyStyle = hasDependencies 
                      ? 'bg-gradient-to-r from-purple-500/30 to-violet-500/30 border-l-purple-500 border-l-4 ring-1 ring-purple-500/30' 
                      : '';
                    
                    return (
                      <Tooltip key={item.id}>
                        <TooltipTrigger asChild>
                          <div
                            className={`relative px-2 py-1 rounded text-xs cursor-pointer truncate border-l-4 ${hasDependencies ? dependencyStyle : `${toolColors.bg} ${toolColors.border}`} ${toolColors.text} hover:opacity-80 transition-opacity`}
                          >
                            {/* Progress indicator */}
                            <div 
                              className={`absolute left-0 top-0 bottom-0 w-1 ${progressColor} rounded-l`}
                              style={{ width: '4px' }}
                            />
                            <div className="flex items-center gap-1">
                              {hasDependencies && (
                                <Link2 className="h-3 w-3 text-purple-400 flex-shrink-0" />
                              )}
                              <span className="font-medium truncate">{item.name}</span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs bg-popover border-border">
                          <div className="space-y-2">
                            <div className="font-semibold text-popover-foreground">{item.name}</div>
                            <div className="text-xs space-y-1 text-popover-foreground">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Project:</span>
                                <span>{item.projectName}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Tool:</span>
                                <span className={`px-1.5 py-0.5 rounded ${toolColors.bg} ${toolColors.text}`}>
                                  {item.integrationType || 'Unknown'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Status:</span>
                                <span>{item.status}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Progress:</span>
                                <div className="flex items-center gap-1">
                                  <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full ${progressColor}`}
                                      style={{ width: `${item.progress}%` }}
                                    />
                                  </div>
                                  <span>{item.progress}%</span>
                                </div>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Assignee:</span>
                                <span>{item.assignee}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Type:</span>
                                <span>{item.type}</span>
                              </div>
                              {item.priority && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Priority:</span>
                                  <span>{item.priority}</span>
                                </div>
                              )}
                              {hasDependencies && (
                                <div className="pt-2 mt-2 border-t border-border">
                                  {dependsOnCount > 0 && (
                                    <div className="mb-2">
                                      <div className="flex items-center gap-1.5 mb-1.5 text-purple-400">
                                        <Link2 className="h-3 w-3" />
                                        <span className="font-semibold">Depends On ({dependsOnCount})</span>
                                      </div>
                                      <div className="space-y-1 ml-4">
                                        {item.dependencies?.dependsOn?.slice(0, 3).map((dep, idx) => (
                                          <div key={idx} className="text-xs text-muted-foreground">
                                            • {dep.taskKey || dep.taskId}: {dep.taskSummary}
                                          </div>
                                        ))}
                                        {dependsOnCount > 3 && (
                                          <div className="text-xs text-muted-foreground">
                                            +{dependsOnCount - 3} more
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                  {blockedByCount > 0 && (
                                    <div>
                                      <div className="flex items-center gap-1.5 mb-1.5 text-red-400">
                                        <span className="font-semibold">Blocked By ({blockedByCount})</span>
                                      </div>
                                      <div className="space-y-1 ml-4">
                                        {item.dependencies?.blockedBy?.slice(0, 3).map((blocker, idx) => (
                                          <div key={idx} className="text-xs text-muted-foreground">
                                            • {blocker.taskKey || blocker.taskId}: {blocker.taskSummary}
                                          </div>
                                        ))}
                                        {blockedByCount > 3 && (
                                          <div className="text-xs text-muted-foreground">
                                            +{blockedByCount - 3} more
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                  
                    {hasMoreItems && (
                      <button
                        onClick={toggleExpand}
                        className="text-xs text-primary font-medium cursor-pointer hover:underline px-2 py-1 w-full text-left transition-colors"
                      >
                        {isExpanded 
                          ? `Show less` 
                          : `+${dayItems.length - maxVisibleItems} more`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="p-4 border-t border-border bg-muted/30">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Tool Colors */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-foreground">Integration Tools</h4>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-blue-500/20 border-2 border-blue-500" />
                  <span className="text-xs text-foreground">Jira</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-orange-500/20 border-2 border-orange-500" />
                  <span className="text-xs text-foreground">Trello</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded bg-green-500/20 border-2 border-green-500" />
                  <span className="text-xs text-foreground">TestRail</span>
                </div>
              </div>
            </div>

            {/* Progress Status */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-foreground">Progress Status</h4>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-muted-foreground/50" />
                  <span className="text-xs text-foreground">Not Started</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-amber-500" />
                  <span className="text-xs text-foreground">In Progress</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-blue-500" />
                  <span className="text-xs text-foreground">Review</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-green-500" />
                  <span className="text-xs text-foreground">Complete</span>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div>
              <h4 className="text-sm font-medium mb-2 text-foreground">Summary</h4>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{calendarItems.length}</span> total items across{' '}
                <span className="font-medium text-foreground">{tools.length}</span> tool{tools.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

