import { logger } from "@/lib/utils/logger";

export interface StatusChartData {
  name: string;
  value: number;
}

export interface StatusIssue {
  status: { name: string };
}

export class StatusChartProcessor {
  /**
   * Processes issues to generate status chart data
   */
  static process<T extends StatusIssue>(issues: T[]): StatusChartData[] {
    const context = 'StatusChartProcessor.process';
    
    if (!issues || issues.length === 0) {
      logger.debug('No issues to process for status chart', undefined, context);
      return [];
    }

    logger.debug(`Processing ${issues.length} issues for status chart`, undefined, context);

    const statusCounts = new Map<string, number>();
    
    issues.forEach(issue => {
      const statusName = issue.status.name;
      statusCounts.set(statusName, (statusCounts.get(statusName) || 0) + 1);
    });

    const chartData = Array.from(statusCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    logger.debug(`Generated status chart data for ${chartData.length} statuses`, { chartData }, context);
    return chartData;
  }

  /**
   * Validates status chart data
   */
  static validate(data: StatusChartData[]): boolean {
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
   * Gets issues by specific status
   */
  static getIssuesByStatus<T extends StatusIssue>(
    issues: T[], 
    statusName: string
  ): T[] {
    const context = 'StatusChartProcessor.getIssuesByStatus';
    
    const filteredIssues = issues.filter(issue => issue.status.name === statusName);
    
    logger.debug(
      `Found ${filteredIssues.length} issues with status "${statusName}"`, 
      undefined, 
      context
    );
    
    return filteredIssues;
  }
} 