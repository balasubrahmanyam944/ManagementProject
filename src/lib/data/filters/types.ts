import { DateRange } from "react-day-picker";

export interface FilterOptions {
  statuses?: string[];
  types?: string[];
  assignees?: string[];
  priorities?: string[];
  dateRange?: DateRange;
}

export interface FilterableIssue {
  status: { name: string };
  issuetype: { name: string };
  assignee?: { displayName: string };
  priority?: { name: string };
  updated: string;
}