import { logger } from "@/lib/utils/logger";

export interface AssigneeChartData {
  name: string;
  value: number;
}

export interface AssigneeIssue {
  assignee?: { displayName: string };
}

export class AssigneeChartProcessor {
  /**
   * Processes issues to generate assignee chart data
   */
  static process<T extends AssigneeIssue>(issues: T[]): AssigneeChartData[] {
    const context = 'AssigneeChartProcessor.process';
    
    if (!issues || issues.length === 0) {
      logger.debug('No issues to process for assignee chart', undefined, context);
      return [];
    }

    logger.debug(`Processing ${issues.length} issues for assignee chart`, undefined, context);

    const assigneeCounts = new Map<string, number>();
    
    issues.forEach(issue => {
      const assigneeName = issue.assignee?.displayName || 'Unassigned';
      assigneeCounts.set(assigneeName, (assigneeCounts.get(assigneeName) || 0) + 1);
    });

    const chartData = Array.from(assigneeCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    logger.debug(`Generated assignee chart data for ${chartData.length} assignees`, { chartData }, context);
    return chartData;
  }

  /**
   * Validates assignee chart data
   */
  static validate(data: AssigneeChartData[]): boolean {
    if (!Array.isArray(data)) {
      return false;
    }

    return data.every(item => 
      typeof item.name === 'string' && 
      typeof item.value === 'number' && 
      item.value >= 0
    );
  }

  /**
   * Gets issues by specific assignee
   */
  static getIssuesByAssignee<T extends AssigneeIssue>(
    issues: T[], 
    assigneeName: string
  ): T[] {
    const context = 'AssigneeChartProcessor.getIssuesByAssignee';
    
    const filteredIssues = issues.filter(issue => {
      const issueAssignee = issue.assignee?.displayName || 'Unassigned';
      return issueAssignee === assigneeName;
    });
    
    logger.debug(
      `Found ${filteredIssues.length} issues assigned to "${assigneeName}"`, 
      undefined, 
      context
    );
    
    return filteredIssues;
  }
} 