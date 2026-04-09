import { logger } from "@/lib/utils/logger";

export interface TypeChartData {
  name: string;
  value: number;
}

export interface TypeIssue {
  issuetype: { name: string };
}

export class TypeChartProcessor {
  /**
   * Processes issues to generate type chart data
   */
  static process<T extends TypeIssue>(issues: T[]): TypeChartData[] {
    const context = 'TypeChartProcessor.process';
    
    if (!issues || issues.length === 0) {
      logger.debug('No issues to process for type chart', undefined, context);
      return [];
    }

    logger.debug(`Processing ${issues.length} issues for type chart`, undefined, context);

    const typeCounts = new Map<string, number>();
    
    issues.forEach(issue => {
      const typeName = issue.issuetype.name;
      typeCounts.set(typeName, (typeCounts.get(typeName) || 0) + 1);
    });

    const chartData = Array.from(typeCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    logger.debug(`Generated type chart data for ${chartData.length} types`, { chartData }, context);
    return chartData;
  }

  /**
   * Validates type chart data
   */
  static validate(data: TypeChartData[]): boolean {
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
   * Gets issues by specific type
   */
  static getIssuesByType<T extends TypeIssue>(
    issues: T[], 
    typeName: string
  ): T[] {
    const context = 'TypeChartProcessor.getIssuesByType';
    
    const filteredIssues = issues.filter(issue => issue.issuetype.name === typeName);
    
    logger.debug(
      `Found ${filteredIssues.length} issues with type "${typeName}"`, 
      undefined, 
      context
    );
    
    return filteredIssues;
  }
} 