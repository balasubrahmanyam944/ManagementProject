import { JiraDashboardIssue, TrelloCard } from "@/types/integrations";
import { FilterOptions } from "@/components/charts/ChartFilters";
import { StatusChartData } from "@/components/charts/IssuesByStatusPieChart";
import { TypeChartData } from "@/components/charts/IssuesByTypeBarChart";
import { AssigneeChartData } from "@/components/charts/IssuesByAssigneeChart";
import { TimelineChartData } from "@/components/charts/IssuesByTimelineChart";
import { BurndownChartData } from "@/components/charts/BurndownChart";
import { addDays, format, isAfter, isBefore, parseISO, startOfDay } from "date-fns";

/**
 * Filters issues based on the provided filter options
 */
export const filterIssues = (issues: JiraDashboardIssue[], filters: FilterOptions): JiraDashboardIssue[] => {
  if (!issues || issues.length === 0) return [];
  
  return issues.filter(issue => {
    // Filter by status
    if (filters.statuses && filters.statuses.length > 0 && !filters.statuses.includes(issue.status.name)) {
      return false;
    }
    
    // Filter by type
    if (filters.types && filters.types.length > 0 && !filters.types.includes(issue.issuetype.name)) {
      return false;
    }
    
    // Filter by assignee
    if (filters.assignees && filters.assignees.length > 0) {
      const assigneeName = issue.assignee?.displayName || 'Unassigned';
      if (!filters.assignees.includes(assigneeName)) {
        return false;
      }
    }
    
    // Filter by priority
    if (filters.priorities && filters.priorities.length > 0 && issue.priority) {
      if (!filters.priorities.includes(issue.priority.name)) {
        return false;
      }
    }
    
    // Filter by date range
    if (filters.dateRange && (filters.dateRange.from || filters.dateRange.to)) {
      const issueDate = parseISO(issue.updated);
      
      if (filters.dateRange.from && isBefore(issueDate, startOfDay(filters.dateRange.from))) {
        return false;
      }
      
      if (filters.dateRange.to && isAfter(issueDate, startOfDay(addDays(filters.dateRange.to, 1)))) {
        return false;
      }
    }
    
    return true;
  });
};

/**
 * Processes issues to generate status chart data
 */
export const processIssuesByStatus = (issues: JiraDashboardIssue[]): StatusChartData[] => {
  if (!issues || issues.length === 0) return [];
  
  const statusCounts: Record<string, number> = {};
  issues.forEach(issue => {
    const statusName = issue.status.name;
    statusCounts[statusName] = (statusCounts[statusName] || 0) + 1;
  });
  
  return Object.entries(statusCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

/**
 * Processes issues to generate type chart data
 */
export const processIssuesByType = (issues: JiraDashboardIssue[]): TypeChartData[] => {
  if (!issues || issues.length === 0) return [];
  
  const typeCounts: Record<string, number> = {};
  issues.forEach(issue => {
    const typeName = issue.issuetype.name;
    typeCounts[typeName] = (typeCounts[typeName] || 0) + 1;
  });
  
  return Object.entries(typeCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

/**
 * Processes issues to generate assignee chart data
 */
export const processIssuesByAssignee = (issues: JiraDashboardIssue[]): AssigneeChartData[] => {
  if (!issues || issues.length === 0) return [];
  
  const assigneeCounts: Record<string, number> = {};
  issues.forEach(issue => {
    const assigneeName = issue.assignee?.displayName || 'Unassigned';
    assigneeCounts[assigneeName] = (assigneeCounts[assigneeName] || 0) + 1;
  });
  
  return Object.entries(assigneeCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
};

/**
 * Processes issues to generate timeline chart data
 */
export const processIssuesForTimeline = (issues: JiraDashboardIssue[]): TimelineChartData[] => {
  if (!issues || issues.length === 0) return [];
  
  // Get date range from issues
  const dates = issues.map(issue => parseISO(issue.created));
  const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
  const maxDate = new Date();
  
  // Create a map of dates
  const dateMap: Record<string, { created: number; resolved: number }> = {};
  
  // Initialize the date map with all dates in the range
  let currentDate = new Date(minDate);
  while (currentDate <= maxDate) {
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    dateMap[dateKey] = { created: 0, resolved: 0 };
    currentDate = addDays(currentDate, 1);
  }
  
  // Count created issues by date
  issues.forEach(issue => {
    const createdDate = format(parseISO(issue.created), 'yyyy-MM-dd');
    if (dateMap[createdDate]) {
      dateMap[createdDate].created += 1;
    }
    
    // Count resolved issues (if status is "Done")
    if (issue.status.name === 'Done') {
      const updatedDate = format(parseISO(issue.updated), 'yyyy-MM-dd');
      if (dateMap[updatedDate]) {
        dateMap[updatedDate].resolved += 1;
      }
    }
  });
  
  // Convert the map to an array and sort by date
  return Object.entries(dateMap)
    .map(([date, counts]) => ({
      date: format(parseISO(date), 'MMM dd'),
      created: counts.created,
      resolved: counts.resolved
    }))
    .sort((a, b) => {
      const dateA = parseISO(`${new Date().getFullYear()}-${a.date.replace(' ', '-')}`);
      const dateB = parseISO(`${new Date().getFullYear()}-${b.date.replace(' ', '-')}`);
      return dateA.getTime() - dateB.getTime();
    });
};

/**
 * Processes issues to generate burndown chart data
 */
export const processIssuesForBurndown = (
  issues: JiraDashboardIssue[],
  startDate?: Date,
  endDate?: Date
): { data: BurndownChartData[]; startDate: string; endDate: string; totalScope: number } => {
  if (!issues || issues.length === 0) {
    return { 
      data: [], 
      startDate: format(new Date(), 'MMM dd, yyyy'),
      endDate: format(addDays(new Date(), 14), 'MMM dd, yyyy'),
      totalScope: 0
    };
  }
  
  // Determine start and end dates
  const start = startDate || parseISO(issues[0].created);
  const end = endDate || addDays(new Date(), 14);
  
  // Calculate total scope (total number of issues)
  const totalScope = issues.length;
  
  // Create a map of dates
  const dateMap: Record<string, { remaining: number; ideal: number }> = {};
  
  // Initialize the date map with all dates in the range
  let currentDate = new Date(start);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  
  while (currentDate <= end) {
    const dateKey = format(currentDate, 'yyyy-MM-dd');
    const daysPassed = Math.ceil((currentDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const idealRemaining = Math.max(0, totalScope - (totalScope * (daysPassed / totalDays)));
    
    dateMap[dateKey] = { 
      remaining: totalScope, // Will be updated later
      ideal: Math.round(idealRemaining)
    };
    
    currentDate = addDays(currentDate, 1);
  }
  
  // Calculate actual remaining work for each day
  issues.forEach(issue => {
    if (issue.status.name === 'Done') {
      const resolvedDate = format(parseISO(issue.updated), 'yyyy-MM-dd');
      
      // Update all dates after this issue was resolved
      Object.keys(dateMap).forEach(dateKey => {
        if (dateKey >= resolvedDate) {
          dateMap[dateKey].remaining -= 1;
        }
      });
    }
  });
  
  // Convert the map to an array and sort by date
  const data = Object.entries(dateMap)
    .map(([date, counts]) => ({
      date: format(parseISO(date), 'MMM dd'),
      remaining: Math.max(0, counts.remaining),
      ideal: counts.ideal
    }))
    .sort((a, b) => {
      const dateA = parseISO(`${new Date().getFullYear()}-${a.date.replace(' ', '-')}`);
      const dateB = parseISO(`${new Date().getFullYear()}-${b.date.replace(' ', '-')}`);
      return dateA.getTime() - dateB.getTime();
    });
  
  return {
    data,
    startDate: format(start, 'MMM dd, yyyy'),
    endDate: format(end, 'MMM dd, yyyy'),
    totalScope
  };
};

/**
 * Gets all available filter options from the issues
 */
export const getAvailableFilterOptions = (issues: JiraDashboardIssue[]) => {
  if (!issues || issues.length === 0) {
    return {
      statuses: [],
      types: [],
      assignees: [],
      priorities: []
    };
  }
  
  const statuses = new Set<string>();
  const types = new Set<string>();
  const assignees = new Set<string>();
  const priorities = new Set<string>();
  
  issues.forEach(issue => {
    statuses.add(issue.status.name);
    types.add(issue.issuetype.name);
    assignees.add(issue.assignee?.displayName || 'Unassigned');
    if (issue.priority) {
      priorities.add(issue.priority.name);
    }
  });
  
  return {
    statuses: Array.from(statuses).sort(),
    types: Array.from(types).sort(),
    assignees: Array.from(assignees).sort(),
    priorities: Array.from(priorities).sort()
  };
};

/**
 * Gets issues for a specific status
 */
export const getIssuesByStatus = (issues: JiraDashboardIssue[], statusName: string): JiraDashboardIssue[] => {
  return issues.filter(issue => issue.status.name === statusName);
};

/**
 * Gets issues for a specific type
 */
export const getIssuesByType = (issues: JiraDashboardIssue[], typeName: string): JiraDashboardIssue[] => {
  return issues.filter(issue => issue.issuetype.name === typeName);
};

/**
 * Gets issues for a specific assignee
 */
export const getIssuesByAssignee = (issues: JiraDashboardIssue[], assigneeName: string): JiraDashboardIssue[] => {
  return issues.filter(issue => {
    const name = issue.assignee?.displayName || 'Unassigned';
    return name === assigneeName;
  });
};

// Trello Data Conversion Utilities

// Convert Trello card to Jira-like issue for chart compatibility
export function convertTrelloCardToIssue(card: TrelloCard): JiraDashboardIssue {
  return {
    id: card.id,
    key: card.id,
    summary: card.name,
    status: {
      id: card.list.id, // Include list ID for status dropdown
      name: card.list.name,
      statusCategory: {
        id: 0,
        key: determineTrelloStatusCategory(card.list.name),
        name: determineTrelloStatusCategory(card.list.name)
      }
    },
    issuetype: {
      id: 'card',
      name: card.labels.length > 0 ? card.labels[0].name || "Card" : "Card",
      iconUrl: "https://placehold.co/16x16/026AA7/FFFFFF?text=T",
      subtask: false
    },
    assignee: card.members.length > 0 ? {
      displayName: card.members[0].fullName,
      avatarUrls: { '48x48': card.members[0].avatarUrl || 'https://placehold.co/48x48/E0E0E0/000000?text=' + card.members[0].fullName.charAt(0) }
    } : undefined,
    priority: {
      id: 'medium',
      name: card.due ? "High" : "Medium", // Simple priority based on due date
      iconUrl: card.due ? "https://placehold.co/16x16/FF9800/FFFFFF?text=H" : "https://placehold.co/16x16/FFEB3B/FFFFFF?text=M"
    },
    created: card.dateLastActivity, // Using last activity as created date
    updated: card.dateLastActivity,
    description: card.desc
  };
}

// Determine status category from Trello list name
function determineTrelloStatusCategory(listName: string): string {
  const lowerName = listName.toLowerCase();
  
  if (lowerName.includes('to do') || lowerName.includes('todo') || lowerName.includes('backlog') || lowerName.includes('new')) {
    return 'new';
  } else if (lowerName.includes('doing') || lowerName.includes('in progress') || lowerName.includes('in review') || lowerName.includes('testing')) {
    return 'indeterminate';
  } else if (lowerName.includes('done') || lowerName.includes('complete') || lowerName.includes('finished') || lowerName.includes('closed')) {
    return 'done';
  } else {
    return 'indeterminate'; // Default to in-progress for unknown lists
  }
}

// Convert array of Trello cards to Jira-like issues
export function convertTrelloCardsToIssues(cards: TrelloCard[]): JiraDashboardIssue[] {
  return cards.map(convertTrelloCardToIssue);
}
