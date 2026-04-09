import { isAfter, isBefore, parseISO, startOfDay, addDays } from "date-fns";
import { FilterOptions, FilterableIssue } from "./types";
import { logger } from "@/lib/utils/logger";

export class IssueFilter {
  /**
   * Filters issues based on the provided filter options
   */
  static filter<T extends FilterableIssue>(issues: T[], filters: FilterOptions): T[] {
    const context = 'IssueFilter.filter';
    
    if (!issues || issues.length === 0) {
      logger.debug('No issues to filter', undefined, context);
      return [];
    }

    logger.debug(`Filtering ${issues.length} issues`, { filters }, context);

    const filteredIssues = issues.filter(issue => {
      return this.matchesStatusFilter(issue, filters) &&
             this.matchesTypeFilter(issue, filters) &&
             this.matchesAssigneeFilter(issue, filters) &&
             this.matchesPriorityFilter(issue, filters) &&
             this.matchesDateFilter(issue, filters);
    });

    logger.debug(`Filtered to ${filteredIssues.length} issues`, undefined, context);
    return filteredIssues;
  }

  private static matchesStatusFilter<T extends FilterableIssue>(
    issue: T, 
    filters: FilterOptions
  ): boolean {
    if (!filters.statuses || filters.statuses.length === 0) {
      return true;
    }
    return filters.statuses.includes(issue.status.name);
  }

  private static matchesTypeFilter<T extends FilterableIssue>(
    issue: T, 
    filters: FilterOptions
  ): boolean {
    if (!filters.types || filters.types.length === 0) {
      return true;
    }
    return filters.types.includes(issue.issuetype.name);
  }

  private static matchesAssigneeFilter<T extends FilterableIssue>(
    issue: T, 
    filters: FilterOptions
  ): boolean {
    if (!filters.assignees || filters.assignees.length === 0) {
      return true;
    }
    const assigneeName = issue.assignee?.displayName || 'Unassigned';
    return filters.assignees.includes(assigneeName);
  }

  private static matchesPriorityFilter<T extends FilterableIssue>(
    issue: T, 
    filters: FilterOptions
  ): boolean {
    if (!filters.priorities || filters.priorities.length === 0) {
      return true;
    }
    if (!issue.priority) {
      return false;
    }
    return filters.priorities.includes(issue.priority.name);
  }

  private static matchesDateFilter<T extends FilterableIssue>(
    issue: T, 
    filters: FilterOptions
  ): boolean {
    if (!filters.dateRange || (!filters.dateRange.from && !filters.dateRange.to)) {
      return true;
    }

    const issueDate = parseISO(issue.updated);
    
    if (filters.dateRange.from && isBefore(issueDate, startOfDay(filters.dateRange.from))) {
      return false;
    }
    
    if (filters.dateRange.to && isAfter(issueDate, startOfDay(addDays(filters.dateRange.to, 1)))) {
      return false;  
    }

    return true;
  }

  /**
   * Gets available filter options from a collection of issues
   */
  static getAvailableOptions<T extends FilterableIssue>(issues: T[]) {
    const context = 'IssueFilter.getAvailableOptions';
    
    if (!issues || issues.length === 0) {
      logger.debug('No issues provided for filter options', undefined, context);
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

    const options = {
      statuses: Array.from(statuses).sort(),
      types: Array.from(types).sort(),
      assignees: Array.from(assignees).sort(),
      priorities: Array.from(priorities).sort()
    };

    logger.debug('Generated filter options', options, context);
    return options;
  }
} 