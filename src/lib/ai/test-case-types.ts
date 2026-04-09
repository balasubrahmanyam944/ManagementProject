/**
 * Type definitions for test cases
 * This file is safe to import in both client and server code
 */

export interface TestCase {
  id: string;
  title: string;
  description: string;
  category: 'Functional' | 'UI/UX' | 'Integration' | 'Data Validation' | 'Security' | 'Performance' | 'Edge Case';
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  steps: string[];
  expectedResult: string;
  preconditions: string[];
  testData: string[];
  estimatedTime: string;
  tags: string[];
}

