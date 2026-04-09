// Integration-related types for Jira, Trello, and TestRail

export interface JiraUser {
  accountId?: string
  displayName: string
  avatarUrls?: {
    '48x48': string
  }
}

export interface JiraIssueStatus {
  id: string
  name: string
  statusCategory: {
    id: number
    key?: string
    name: string
  }
}

export interface JiraIssueType {
  id: string
  name: string
  iconUrl: string
  subtask?: boolean
}

export interface JiraPriority {
  id: string
  name: string
  iconUrl: string
}

export interface JiraDashboardIssue {
  id: string
  key: string
  summary: string
  status: JiraIssueStatus
  issuetype: JiraIssueType
  assignee?: JiraUser
  priority?: JiraPriority
  created: string
  updated: string
  duedate?: string
  resolutiondate?: string
  customfield_10015?: string // Start date (Sprint start date)
  customfield_10016?: string // Story Points or other custom field  
  customfield_10018?: string // Another potential date field
  customfield_10019?: string // Another potential date field
  description?: any // Jira's ADF for description
}

export interface TrelloCard {
  id: string
  name: string
  desc: string
  idList: string
  idBoard: string
  url: string
  shortUrl: string
  closed: boolean
  due?: string
  dueComplete?: boolean
  labels?: Array<{
    id: string
    name: string
    color: string
  }>
  list: {
    id: string
    name: string
  }
  members: Array<{
    id: string
    fullName: string
    avatarUrl?: string
  }>
  dateLastActivity: string
}

export interface DetailedJiraProject {
  id: string
  key: string
  name: string
  description: string
  projectTypeKey: string
  avatarUrls: { '48x48': string }
  analytics: {
    totalIssues: number
    openIssues: number
    inProgressIssues: number
    doneIssues: number
  }
  lead: JiraUser
}

export interface DetailedTrelloProject {
  id: string
  name: string
  desc: string
  url: string
  shortUrl: string
  shortLink: string
  closed: boolean
  prefs?: {
    backgroundColor?: string
    backgroundImage?: string
  }
  members: Array<{
    id: string
    fullName: string
    avatarUrl?: string
  }>
  lists: Array<{
    id: string
    name: string
  }>
  labels: Array<{
    id: string
    name: string
    color: string
  }>
  analytics?: {
    totalIssues: number
    openIssues: number
    inProgressIssues: number
    doneIssues: number
  }
}

// TestRail Types
export interface TestRailUser {
  id: number
  name: string
  email: string
  is_active: boolean
  role_id: number
}

export interface TestRailTestCase {
  id: number
  title: string
  section_id: number
  template_id: number
  type_id: number
  priority_id: number
  milestone_id?: number
  refs?: string
  created_by: number
  created_on: number
  updated_by: number
  updated_on: number
  estimate?: string
  estimate_forecast?: string
  suite_id: number
  custom_fields?: Array<{
    id: number
    name: string
    value: any
  }>
  status?: {
    id: number
    name: string
  }
}

export interface TestRailProject {
  id: number
  name: string
  announcement?: string
  show_announcement: boolean
  is_completed: boolean
  completed_on?: number
  suite_mode: number
  url: string
}

export interface TestRailSuite {
  id: number
  name: string
  description?: string
  project_id: number
  url: string
}

export interface TestRailSection {
  id: number
  name: string
  description?: string
  parent_id?: number
  suite_id: number
  depth: number
  display_order: number
}

export interface TestRailRun {
  id: number
  suite_id?: number
  name: string
  description?: string
  milestone_id?: number
  assignedto_id?: number
  include_all: boolean
  is_completed: boolean
  completed_on?: number
  config?: string
  config_ids?: number[]
  blocked_count: number
  blocked_count_custom: number
  passed_count: number
  passed_count_custom: number
  retest_count: number
  retest_count_custom: number
  failed_count: number
  failed_count_custom: number
  custom_status1_count: number
  custom_status1_count_custom: number
  custom_status2_count: number
  custom_status2_count_custom: number
  custom_status3_count: number
  custom_status3_count_custom: number
  custom_status4_count: number
  custom_status4_count_custom: number
  custom_status5_count: number
  custom_status5_count_custom: number
  custom_status6_count: number
  custom_status6_count_custom: number
  custom_status7_count: number
  custom_status7_count_custom: number
  untested_count: number
  untested_count_custom: number
  case_ids?: number[]
  refs?: string
}

export interface DetailedTestRailProject {
  id: number
  name: string
  announcement?: string
  show_announcement: boolean
  is_completed: boolean
  completed_on?: number
  suite_mode: number
  url: string
  analytics?: {
    totalTestCases: number
    automatedTestCases: number
    manualTestCases: number
    passedTestCases: number
    failedTestCases: number
    blockedTestCases: number
    untestedTestCases: number
  }
}

// Slack Types
export interface SlackMentions {
  mentioned: boolean
  username?: string
  userId?: string
  mentionCount?: number
}

export interface SlackChannel {
  id: string
  name: string
  is_archived?: boolean
  is_private?: boolean
  num_members?: number
  mentions?: SlackMentions
} 