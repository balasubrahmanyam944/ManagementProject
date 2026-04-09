import { z } from 'zod';

/**
 * Project validation schemas
 */
export const ProjectSchema = z.object({
  id: z.string().min(1, 'Project ID is required'),
  key: z.string()
    .min(1, 'Project key is required')
    .max(10, 'Project key must be 10 characters or less')
    .regex(/^[A-Z][A-Z0-9]*$/, 'Project key must start with a letter and contain only uppercase letters and numbers'),
  name: z.string()
    .min(1, 'Project name is required')
    .max(100, 'Project name must be 100 characters or less'),
  projectTypeKey: z.string().optional(),
  avatarUrls: z.object({
    '48x48': z.string().url().optional(),
    '24x24': z.string().url().optional(),
    '16x16': z.string().url().optional(),
    '32x32': z.string().url().optional(),
  }).optional(),
});

export const ProjectAnalyticsSchema = z.object({
  totalIssues: z.number().min(0),
  openIssues: z.number().min(0),
  inProgressIssues: z.number().min(0),
  doneIssues: z.number().min(0),
});

export const ProjectWithAnalyticsSchema = ProjectSchema.extend({
  analytics: ProjectAnalyticsSchema.optional(),
});

/**
 * Issue validation schemas
 */
export const IssueStatusSchema = z.object({
  name: z.string().min(1, 'Status name is required'),
  statusCategory: z.object({
    key: z.string(),
    name: z.string(),
  }).optional(),
});

export const IssueTypeSchema = z.object({
  name: z.string().min(1, 'Issue type name is required'),
  iconUrl: z.string().url().optional(),
  subtask: z.boolean().optional(),
});

export const UserSchema = z.object({
  displayName: z.string().min(1, 'Display name is required'),
  avatarUrls: z.object({
    '48x48': z.string().url().optional(),
    '24x24': z.string().url().optional(),
  }).optional(),
  emailAddress: z.string().email().optional(),
  accountId: z.string().optional(),
});

export const PrioritySchema = z.object({
  name: z.string().min(1, 'Priority name is required'),
  iconUrl: z.string().url().optional(),
});

export const IssueSchema = z.object({
  id: z.string().min(1, 'Issue ID is required'),
  key: z.string()
    .min(1, 'Issue key is required')
    .regex(/^[A-Z]+-\d+$/, 'Issue key must be in format PROJECT-123'),
  summary: z.string()
    .min(1, 'Issue summary is required')
    .max(255, 'Issue summary must be 255 characters or less'),
  status: IssueStatusSchema,
  issuetype: IssueTypeSchema,
  assignee: UserSchema.optional(),
  priority: PrioritySchema.optional(),
  created: z.string().datetime('Invalid created date format'),
  updated: z.string().datetime('Invalid updated date format'),
  description: z.any().optional(),
});

/**
 * Authentication validation schemas
 */
export const JiraApiTokenSchema = z.object({
  email: z.string()
    .email('Invalid email address')
    .min(1, 'Email is required'),
  apiToken: z.string()
    .min(1, 'API token is required')
    .min(24, 'API token appears to be too short'),
  siteUrl: z.string()
    .url('Invalid site URL')
    .refine(url => url.includes('atlassian.net'), 'Must be an Atlassian domain'),
});

export const TrelloTokenSchema = z.object({
  token: z.string()
    .min(1, 'Trello token is required')
    .min(64, 'Trello token appears to be too short'),
});

/**
 * Filter validation schemas
 */
export const FilterOptionsSchema = z.object({
  statuses: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
  priorities: z.array(z.string()).optional(),
  dateRange: z.object({
    from: z.date().optional(),
    to: z.date().optional(),
  }).optional(),
});

/**
 * Chart data validation schemas
 */
export const ChartDataPointSchema = z.object({
  name: z.string().min(1, 'Chart data point name is required'),
  value: z.number().min(0, 'Chart data point value must be non-negative'),
});

export const StatusChartDataSchema = z.array(ChartDataPointSchema);
export const TypeChartDataSchema = z.array(ChartDataPointSchema);
export const AssigneeChartDataSchema = z.array(ChartDataPointSchema);

/**
 * API Response validation schemas
 */
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  success: z.boolean(),
  data: dataSchema.optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const ProjectsResponseSchema = ApiResponseSchema(z.array(ProjectWithAnalyticsSchema));
export const ProjectDetailsResponseSchema = ApiResponseSchema(ProjectWithAnalyticsSchema);
export const IssuesResponseSchema = ApiResponseSchema(z.array(IssueSchema));

/**
 * URL validation schemas
 */
export const UrlSchema = z.string().url('Invalid URL format');

export const JiraUrlSchema = z.string()
  .url('Invalid URL format')
  .refine(
    url => url.includes('atlassian.net') || url.includes('jira'),
    'Must be a valid Jira URL'
  );

export const TrelloUrlSchema = z.string()
  .url('Invalid URL format')
  .refine(
    url => url.includes('trello.com'),
    'Must be a valid Trello URL'
  );

/**
 * Pagination schemas
 */
export const PaginationSchema = z.object({
  page: z.number().min(1, 'Page must be at least 1').default(1),
  limit: z.number().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  total: z.number().min(0).optional(),
});

/**
 * Export commonly used types
 */
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectWithAnalytics = z.infer<typeof ProjectWithAnalyticsSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type FilterOptions = z.infer<typeof FilterOptionsSchema>;
export type ChartDataPoint = z.infer<typeof ChartDataPointSchema>;
export type JiraApiTokenCredentials = z.infer<typeof JiraApiTokenSchema>;
export type TrelloTokenCredentials = z.infer<typeof TrelloTokenSchema>;
export type Pagination = z.infer<typeof PaginationSchema>; 